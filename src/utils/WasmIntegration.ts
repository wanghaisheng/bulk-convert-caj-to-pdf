// WASM集成层 - 连接CAJ解析器和MuPDF
// 提供统一的PDF处理接口

import { PyMuPDF } from '@bentopdf/pymupdf-wasm';
import { CajParseResult, ExtractedImage, TocEntry } from './CajParserWASM';

export interface WasmIntegrationOptions {
  pymupdfOptions?: {
    assetPath?: string;
    ghostscriptUrl?: string;
  };
}

export class WasmIntegration {
  private pymupdf: PyMuPDF | null = null;
  private initialized = false;
  
  constructor(private options: WasmIntegrationOptions = {}) {}
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.pymupdf = new PyMuPDF(this.options.pymupdfOptions);
      await this.pymupdf.load();
      this.initialized = true;
      console.log('WASM MuPDF initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WASM MuPDF:', error);
      throw new Error('WASM MuPDF initialization failed');
    }
  }
  
  private ensureInitialized(): void {
    if (!this.initialized || !this.pymupdf) {
      throw new Error('WASM MuPDF not initialized. Call initialize() first.');
    }
  }
  
  async extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
    this.ensureInitialized();
    
    try {
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const text = await this.pymupdf.extractText(pdfBlob);
      return text;
    } catch (error) {
      console.error('Failed to extract text from PDF:', error);
      return '';
    }
  }
  
  async extractImagesFromPdf(pdfData: Uint8Array): Promise<ExtractedImage[]> {
    this.ensureInitialized();
    
    try {
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const imageDatas = await this.pymupdf.pdfToImages(pdfBlob, {
        format: 'png',
        dpi: 150
      });
      
      return imageDatas.map((data, index) => ({
        data,
        ext: 'png',
        xref: index,
        width: 0, // 需要从PDF元数据获取
        height: 0,
        bpc: 8,
        colorspace: 'RGB',
        size: data.length
      }));
    } catch (error) {
      console.error('Failed to extract images from PDF:', error);
      return [];
    }
  }
  
  async extractTocFromPdf(pdfData: Uint8Array): Promise<TocEntry[]> {
    this.ensureInitialized();
    
    try {
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const doc = await this.pymupdf.open(pdfBlob);
      
      // 获取目录
      const toc: TocEntry[] = [];
      try {
        // 注意：PyMuPDF WASM可能没有直接的get_toc方法
        // 这里需要使用其他方法或返回空数组
        console.log('TOC extraction not fully implemented in WASM version');
      } catch (error) {
        console.warn('Failed to extract TOC:', error);
      }
      
      doc.close();
      return toc;
    } catch (error) {
      console.error('Failed to extract TOC from PDF:', error);
      return [];
    }
  }
  
  async repairPdf(pdfData: Uint8Array): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const repairedPdf = await this.pymupdf.repairPdf(pdfBlob);
      return repairedPdf;
    } catch (error) {
      console.error('Failed to repair PDF:', error);
      // 如果修复失败，返回原始PDF
      return new Blob([pdfData], { type: 'application/pdf' });
    }
  }
  
  async generatePdfFromContent(content: {
    text: string;
    images: ExtractedImage[];
    toc: TocEntry[];
  }): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      // 使用WASM MuPDF生成PDF
      const pdfBlob = await this.pymupdf.textToPdf(content.text, {
        fontSize: 11,
        pageSize: 'a4',
        margins: 72
      });
      
      return pdfBlob;
    } catch (error) {
      console.error('Failed to generate PDF from content:', error);
      throw new Error('PDF generation failed');
    }
  }
  
  async convertToPdf(file: File | Blob, options?: { filetype?: string }): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      return await this.pymupdf.convertToPdf(file, options);
    } catch (error) {
      console.error('Failed to convert to PDF:', error);
      throw new Error('PDF conversion failed');
    }
  }
  
  async extractMetadataFromPdf(pdfData: Uint8Array): Promise<{
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    pageCount: number;
  }> {
    this.ensureInitialized();
    
    try {
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const doc = await this.pymupdf.open(pdfBlob);
      
      const metadata = {
        pageCount: doc.pageCount,
        title: '',
        author: '',
        subject: '',
        keywords: ''
      };
      
      // 尝试提取元数据
      try {
        // 注意：PyMuPDF WASM的元数据访问可能有所不同
        console.log('Metadata extraction not fully implemented in WASM version');
      } catch (error) {
        console.warn('Failed to extract metadata:', error);
      }
      
      doc.close();
      return metadata;
    } catch (error) {
      console.error('Failed to extract metadata from PDF:', error);
      return { pageCount: 1 };
    }
  }
  
  async mergePdfs(pdfs: (Blob | File)[]): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      return await this.pymupdf.merge(pdfs);
    } catch (error) {
      console.error('Failed to merge PDFs:', error);
      throw new Error('PDF merge failed');
    }
  }
  
  async compressPdf(pdf: Blob | File): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      const result = await this.pymupdf.compressPdf(pdf, {
        images: { enabled: true, dpiThreshold: 150, dpiTarget: 96 },
        subsetFonts: true,
        save: { garbage: 4, deflate: true, clean: true }
      });
      return result.blob;
    } catch (error) {
      console.error('Failed to compress PDF:', error);
      throw new Error('PDF compression failed');
    }
  }
  
  async rasterizePdf(pdf: Blob | File, options?: {
    dpi?: number;
    format?: 'png' | 'jpeg';
    grayscale?: boolean;
  }): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      return await this.pymupdf.rasterizePdf(pdf, {
        dpi: options?.dpi || 150,
        format: options?.format || 'png',
        grayscale: options?.grayscale || false
      });
    } catch (error) {
      console.error('Failed to rasterize PDF:', error);
      throw new Error('PDF rasterization failed');
    }
  }
  
  async deskewPdf(pdf: Blob | File): Promise<{ pdf: Blob; result: any }> {
    this.ensureInitialized();
    
    try {
      return await this.pymupdf.deskewPdf(pdf, {
        threshold: 0.5,
        dpi: 150,
        maxAngle: 45
      });
    } catch (error) {
      console.error('Failed to deskew PDF:', error);
      throw new Error('PDF deskew failed');
    }
  }
  
  // 清理资源
  cleanup(): void {
    this.pymupdf = null;
    this.initialized = false;
  }
}
