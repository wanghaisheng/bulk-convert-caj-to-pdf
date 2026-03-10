// 统一的CAJ转换器 - 使用简化的WASM集成
// 提供完整的CAJ到PDF转换功能

import { CajParserWASM, CajParseResult, ExtractedImage, TocEntry } from './CajParserWASM';
import { WasmIntegration } from './WasmIntegrationSimple';

export interface CajConverterOptions {
  pymupdfOptions?: {
    assetPath?: string;
    ghostscriptUrl?: string;
  };
  enableTextExtraction?: boolean;
  enableImageExtraction?: boolean;
  enableTocExtraction?: boolean;
  enablePdfRepair?: boolean;
}

export interface CajConversionResult {
  success: boolean;
  format: string;
  pageCount: number;
  tocCount: number;
  textLength: number;
  imageCount: number;
  pdfSize: number;
  toc: TocEntry[];
  text: string;
  images: ExtractedImage[];
  pdfBlob: Blob;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
  processingTime: number;
  wasmAvailable: boolean;
}

export class UnifiedCajConverter {
  private cajParser: CajParserWASM;
  private wasmIntegration: WasmIntegration;
  private options: CajConverterOptions;
  private wasmAvailable = false;
  
  constructor(options: CajConverterOptions = {}) {
    this.options = {
      enableTextExtraction: true,
      enableImageExtraction: true,
      enableTocExtraction: true,
      enablePdfRepair: true,
      ...options
    };
    
    this.cajParser = new CajParserWASM({
      pymupdfOptions: this.options.pymupdfOptions
    });
    
    this.wasmIntegration = new WasmIntegration({
      pymupdfOptions: this.options.pymupdfOptions
    });
  }
  
  async initialize(): Promise<void> {
    console.log('Initializing Unified CAJ Converter...');
    
    try {
      await this.wasmIntegration.initialize();
      this.wasmAvailable = true;
      console.log('✅ WASM MuPDF initialized successfully');
    } catch (error) {
      console.warn('⚠️ WASM MuPDF initialization failed, using fallback mode:', error);
      this.wasmAvailable = false;
    }
    
    console.log('✅ Unified CAJ Converter initialized');
  }
  
  async convertToPdf(file: File | Blob): Promise<CajConversionResult> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Starting CAJ to PDF conversion...');
      console.log(`📄 File: ${file instanceof File ? file.name : 'Unknown'}`);
      console.log(`📏 Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`🔧 WASM Available: ${this.wasmAvailable}`);
      
      // 1. 解析CAJ文件
      const parseResult = await this.cajParser.parse(file);
      console.log(`✅ Parsed ${parseResult.format.type} format`);
      console.log(`📄 Pages: ${parseResult.metadata.pageCount}`);
      console.log(`📋 TOC entries: ${parseResult.metadata.tocCount}`);
      
      // 2. 处理PDF数据
      let pdfData: Uint8Array | undefined;
      let pdfBlob: Blob;
      
      if (parseResult.pdfData) {
        console.log('📄 Using extracted PDF data');
        pdfData = parseResult.pdfData;
        
        // 修复PDF（如果启用且WASM可用）
        if (this.options.enablePdfRepair && this.wasmAvailable) {
          console.log('🔧 Repairing PDF...');
          pdfBlob = await this.wasmIntegration.repairPdf(pdfData);
        } else {
          pdfBlob = new Blob([pdfData.buffer], { type: 'application/pdf' });
        }
      } else {
        console.log('🔄 Converting to PDF...');
        if (this.wasmAvailable) {
          pdfBlob = await this.wasmIntegration.convertToPdf(file);
        } else {
          pdfBlob = await this.wasmIntegration.convertToPdf(file);
        }
        
        const arrayBuffer = await pdfBlob.arrayBuffer();
        pdfData = new Uint8Array(arrayBuffer);
      }
      
      // 3. 提取内容
      let text = '';
      let images: ExtractedImage[] = [];
      let toc = parseResult.toc;
      
      if (this.options.enableTextExtraction && pdfData) {
        console.log('📝 Extracting text...');
        text = await this.wasmIntegration.extractTextFromPdf(pdfData);
        console.log(`✅ Extracted ${text.length} characters`);
      }
      
      if (this.options.enableImageExtraction && pdfData) {
        console.log('🖼️ Extracting images...');
        images = await this.wasmIntegration.extractImagesFromPdf(pdfData);
        console.log(`✅ Extracted ${images.length} images`);
      }
      
      if (this.options.enableTocExtraction && toc.length === 0 && pdfData) {
        console.log('📋 Extracting TOC from PDF...');
        toc = await this.wasmIntegration.extractTocFromPdf(pdfData);
        console.log(`✅ Extracted ${toc.length} TOC entries`);
      }
      
      // 4. 提取元数据
      let metadata = {
        title: '',
        author: '',
        subject: '',
        keywords: ''
      };
      
      if (pdfData) {
        const pdfMetadata = await this.wasmIntegration.extractMetadataFromPdf(pdfData);
        metadata = { ...metadata, ...pdfMetadata };
      }
      
      // 5. 生成最终结果
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      const result: CajConversionResult = {
        success: true,
        format: parseResult.format.type,
        pageCount: parseResult.metadata.pageCount,
        tocCount: toc.length,
        textLength: text.length,
        imageCount: images.length,
        pdfSize: pdfBlob.size,
        toc,
        text,
        images,
        pdfBlob,
        metadata,
        processingTime,
        wasmAvailable: this.wasmAvailable
      };
      
      console.log('🎉 CAJ to PDF conversion completed successfully!');
      console.log(`⏱️ Processing time: ${processingTime}ms`);
      console.log(`📄 Output PDF size: ${(pdfBlob.size / 1024).toFixed(2)} KB`);
      console.log(`🔧 WASM Mode: ${this.wasmAvailable ? 'Enabled' : 'Fallback'}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ CAJ to PDF conversion failed:', error);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      return {
        success: false,
        format: 'Unknown',
        pageCount: 0,
        tocCount: 0,
        textLength: 0,
        imageCount: 0,
        pdfSize: 0,
        toc: [],
        text: '',
        images: [],
        pdfBlob: new Blob([], { type: 'application/pdf' }),
        metadata: {},
        processingTime,
        wasmAvailable: this.wasmAvailable
      };
    }
  }
  
  async extractText(file: File | Blob): Promise<string> {
    try {
      console.log('📝 Extracting text from CAJ file...');
      
      const parseResult = await this.cajParser.parse(file);
      
      if (parseResult.pdfData) {
        return await this.wasmIntegration.extractTextFromPdf(parseResult.pdfData);
      } else {
        const pdfBlob = await this.wasmIntegration.convertToPdf(file);
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        return await this.wasmIntegration.extractTextFromPdf(pdfData);
      }
    } catch (error) {
      console.error('❌ Text extraction failed:', error);
      return '';
    }
  }
  
  async extractImages(file: File | Blob): Promise<ExtractedImage[]> {
    try {
      console.log('🖼️ Extracting images from CAJ file...');
      
      const parseResult = await this.cajParser.parse(file);
      
      if (parseResult.pdfData) {
        return await this.wasmIntegration.extractImagesFromPdf(parseResult.pdfData);
      } else {
        const pdfBlob = await this.wasmIntegration.convertToPdf(file);
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        return await this.wasmIntegration.extractImagesFromPdf(pdfData);
      }
    } catch (error) {
      console.error('❌ Image extraction failed:', error);
      return [];
    }
  }
  
  async extractToc(file: File | Blob): Promise<TocEntry[]> {
    try {
      console.log('📋 Extracting TOC from CAJ file...');
      
      const parseResult = await this.cajParser.parse(file);
      
      if (parseResult.toc.length > 0) {
        return parseResult.toc;
      } else {
        // 尝试从PDF提取TOC
        if (parseResult.pdfData) {
          return await this.wasmIntegration.extractTocFromPdf(parseResult.pdfData);
        } else {
          const pdfBlob = await this.wasmIntegration.convertToPdf(file);
          const arrayBuffer = await pdfBlob.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          return await this.wasmIntegration.extractTocFromPdf(pdfData);
        }
      }
    } catch (error) {
      console.error('❌ TOC extraction failed:', error);
      return [];
    }
  }
  
  async getMetadata(file: File | Blob): Promise<{
    format: string;
    pageCount: number;
    tocCount: number;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  }> {
    try {
      console.log('📊 Extracting metadata from CAJ file...');
      
      const parseResult = await this.cajParser.parse(file);
      
      let pdfMetadata = {};
      if (parseResult.pdfData) {
        pdfMetadata = await this.wasmIntegration.extractMetadataFromPdf(parseResult.pdfData);
      } else {
        const pdfBlob = await this.wasmIntegration.convertToPdf(file);
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        pdfMetadata = await this.wasmIntegration.extractMetadataFromPdf(pdfData);
      }
      
      return {
        format: parseResult.format.type,
        pageCount: parseResult.metadata.pageCount,
        tocCount: parseResult.metadata.tocCount,
        ...pdfMetadata
      };
    } catch (error) {
      console.error('❌ Metadata extraction failed:', error);
      return {
        format: 'Unknown',
        pageCount: 0,
        tocCount: 0
      };
    }
  }
  
  async detectFormat(file: File | Blob): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      // 使用简单的格式检测
      const header = new DataView(data.buffer);
      
      // C8格式
      if (header.getUint8(0) === 0xc8) {
        return 'C8';
      }
      
      // HN格式
      if (header.getUint16(0) === 0x484E) {
        return 'HN';
      }
      
      // 其他格式
      const headerStr = new TextDecoder('gb18030', { fatal: false }).decode(data.slice(0, 4)).replace('\x00', '');
      
      if (headerStr === 'CAJ') return 'CAJ';
      if (headerStr === 'KDH ') return 'KDH';
      if (headerStr === 'TEB') return 'TEB';
      if (headerStr.startsWith('%PDF')) return 'PDF';
      
      return 'Unknown';
    } catch (error) {
      console.error('❌ Format detection failed:', error);
      return 'Unknown';
    }
  }
  
  // 批量处理
  async batchConvert(files: File[]): Promise<CajConversionResult[]> {
    console.log(`🔄 Starting batch conversion of ${files.length} files...`);
    
    const results: CajConversionResult[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`\n📄 Processing file ${i + 1}/${files.length}: ${file.name}`);
      
      try {
        const result = await this.convertToPdf(file);
        results.push(result);
        
        if (result.success) {
          console.log(`✅ Successfully converted ${file.name}`);
        } else {
          console.log(`❌ Failed to convert ${file.name}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error);
        
        results.push({
          success: false,
          format: 'Unknown',
          pageCount: 0,
          tocCount: 0,
          textLength: 0,
          imageCount: 0,
          pdfSize: 0,
          toc: [],
          text: '',
          images: [],
          pdfBlob: new Blob([], { type: 'application/pdf' }),
          metadata: {},
          processingTime: 0,
          wasmAvailable: this.wasmAvailable
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n🎉 Batch conversion completed: ${successCount}/${files.length} files converted successfully`);
    
    return results;
  }
  
  // 获取WASM状态
  getWasmStatus(): { available: boolean; initialized: boolean } {
    return {
      available: this.wasmAvailable,
      initialized: true
    };
  }
  
  // 清理资源
  cleanup(): void {
    this.wasmIntegration.cleanup();
  }
}
