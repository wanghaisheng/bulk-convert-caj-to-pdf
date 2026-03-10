import { CajFile } from '../Provider';
import { UnifiedCajConverter, CajConversionResult } from './UnifiedCajConverter';

// 为了兼容性，保留原有的接口
export interface ImageInfo {
  imageTypeEnum: number;
  offsetToImageData: number;
  sizeOfImageData: number;
  imageData: Uint8Array;
  imageType: string;
  width?: number;
  height?: number;
}

export interface TOCEntry {
  title: string;
  page: number;
  level: number;
}

export class MuPDFConverter {
  private unifiedConverter: UnifiedCajConverter;
  private initialized = false;
  
  constructor() {
    this.unifiedConverter = new UnifiedCajConverter({
      pymupdfOptions: {
        assetPath: '/assets/pymupdf/',
        ghostscriptUrl: 'https://cdn.jsdelivr.net/npm/@bentopdf/gs-wasm@0.1.0/assets/'
      },
      enableTextExtraction: true,
      enableImageExtraction: true,
      enableTocExtraction: true,
      enablePdfRepair: true
    });
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.unifiedConverter.initialize();
      this.initialized = true;
      console.log('✅ MuPDFConverter initialized successfully');
    } catch (error) {
      console.error('❌ MuPDFConverter initialization failed:', error);
      throw error;
    }
  }
  
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MuPDFConverter not initialized. Call initialize() first.');
    }
  }
  
  /**
   * 检测CAJ格式
   */
  async detectCAJFormat(file: File): Promise<{ type: string } | null> {
    try {
      const format = await this.unifiedConverter.detectFormat(file);
      return { type: format };
    } catch (error) {
      console.error('Format detection failed:', error);
      return null;
    }
  }
  
  /**
   * 转换CAJ文件为PDF
   */
  async convertCajToPdf(cajFile: CajFile): Promise<Blob> {
    this.ensureInitialized();
    
    try {
      console.log('🔄 Converting CAJ to PDF...');
      const result = await this.unifiedConverter.convertToPdf(cajFile.file);
      
      if (result.success) {
        console.log('✅ CAJ to PDF conversion successful');
        console.log(`📄 PDF size: ${(result.pdfSize / 1024).toFixed(2)} KB`);
        console.log(`📝 Text length: ${result.textLength} characters`);
        console.log(`🖼️ Images: ${result.imageCount}`);
        console.log(`📋 TOC entries: ${result.tocCount}`);
        
        return result.pdfBlob;
      } else {
        console.error('❌ CAJ to PDF conversion failed');
        throw new Error('CAJ to PDF conversion failed');
      }
    } catch (error) {
      console.error('❌ CAJ to PDF conversion error:', error);
      throw error;
    }
  }
  
  /**
   * 提取CAJ文件文本
   */
  async extractTextFromCaj(cajFile: CajFile): Promise<string> {
    this.ensureInitialized();
    
    try {
      console.log('📝 Extracting text from CAJ...');
      const text = await this.unifiedConverter.extractText(cajFile.file);
      
      console.log(`✅ Text extraction completed: ${text.length} characters`);
      
      // 如果文本太少，提供一些调试信息
      if (text.length < 100) {
        console.log('⚠️ Extracted text is very short, this might indicate:');
        console.log('   - The CAJ file format is not fully supported');
        console.log('   - The file contains mostly images');
        console.log('   - The file is encrypted or corrupted');
        console.log('   - Text extraction failed silently');
      }
      
      return text;
    } catch (error) {
      console.error('❌ Text extraction failed:', error);
      return '';
    }
  }
  
  /**
   * 提取完整内容（文本、图像、目录）
   */
  async extractFullContent(file: File, format?: { type: string }): Promise<{
    text: string;
    images: ImageInfo[];
    toc: TOCEntry[];
  }> {
    this.ensureInitialized();
    
    try {
      console.log('🔄 Extracting full content from CAJ...');
      
      // 并行提取所有内容
      const [text, images, toc] = await Promise.all([
        this.unifiedConverter.extractText(file),
        this.unifiedConverter.extractImages(file),
        this.unifiedConverter.extractToc(file)
      ]);
      
      // 转换图像格式以保持兼容性
      const compatibleImages: ImageInfo[] = images.map((img, index) => ({
        imageTypeEnum: 1, // 默认为JPEG
        offsetToImageData: 0,
        sizeOfImageData: img.size,
        imageData: img.data,
        imageType: img.ext,
        width: img.width,
        height: img.height
      }));
      
      console.log(`✅ Full content extraction completed:`);
      console.log(`   📝 Text: ${text.length} characters`);
      console.log(`   🖼️ Images: ${images.length}`);
      console.log(`   📋 TOC: ${toc.length} entries`);
      
      return { text, images: compatibleImages, toc };
    } catch (error) {
      console.error('❌ Full content extraction failed:', error);
      return { text: '', images: [], toc: [] };
    }
  }
  
  /**
   * 获取文件元数据
   */
  async getMetadata(file: File): Promise<{
    format: string;
    pageCount: number;
    tocCount: number;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  }> {
    this.ensureInitialized();
    
    try {
      return await this.unifiedConverter.getMetadata(file);
    } catch (error) {
      console.error('❌ Metadata extraction failed:', error);
      return {
        format: 'Unknown',
        pageCount: 0,
        tocCount: 0
      };
    }
  }
  
  /**
   * 生成包含内容的PDF
   */
  private generateContentPdf(fileName: string, text: string, images: ImageInfo[], toc: TOCEntry[]): Blob {
    let content = `
CAJ文件解析报告
================

文件名: ${fileName}
解析时间: ${new Date().toLocaleString()}
解析工具: 批量CAJ转换器 v4.0 (TypeScript + WASM)

解析结果概览
------------
- 提取文本长度: ${text.length} 字符
- 提取图像数量: ${images.length} 个
- 目录条目数量: ${toc.length} 个

`;

    // 添加目录
    if (toc.length > 0) {
      content += `\n目录结构\n--------\n`;
      toc.forEach(entry => {
        content += `${'  '.repeat(entry.level - 1)}${entry.title} (第${entry.page}页)\n`;
      });
    }

    // 添加提取的文本
    if (text.length > 0) {
      content += `\n提取的文本内容\n==============\n${text}\n`;
    }

    // 添加图像信息
    if (images.length > 0) {
      content += `\n提取的图像信息\n==============\n`;
      images.forEach((img, index) => {
        content += `图像 ${index + 1}: ${img.imageType}, ${img.width || 'Unknown'}x${img.height || 'Unknown'}\n`;
      });
    }

    // 创建简单的PDF内容
    const pdfContent = `%PDF-1.3
1 0 obj
<<
/Type /Catalog
/Pages 2 0 obj
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length ${content.length}
>>
stream
${content}
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000173 00000 n 
0000000300 00000 n 
0000000360 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
450
%%EOF
`;

    return new Blob([pdfContent], { type: 'application/pdf' });
  }
  
  /**
   * 生成降级PDF（转换报告）
   */
  private generateFallbackPdf(fileName: string, fileSize: number, format?: { type: string }): Blob {
    const content = `
CAJ文件转换报告
================

文件名: ${fileName}
文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB
文件格式: ${format?.type || 'Unknown'}
转换时间: ${new Date().toLocaleString()}
转换工具: 批量CAJ转换器 v4.0 (TypeScript + WASM)

转换结果
--------
状态: 转换失败
原因: 不支持的CAJ格式或文件损坏

建议:
1. 确认文件格式是否为标准的CAJ文件
2. 尝试使用官方CAJViewer打开文件
3. 如果文件可以正常打开，请联系开发者

技术信息
--------
- 解析器: TypeScript + WASM
- PDF引擎: MuPDF WASM
- 支持格式: CAJ、HN、C8、KDH、PDF、TEB
`;

    const pdfContent = `%PDF-1.3
1 0 obj
<<
/Type /Catalog
/Pages 2 0 obj
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length ${content.length}
>>
stream
${content}
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000173 00000 n 
0000000300 00000 n 
0000000360 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
450
%%EOF
`;

    return new Blob([pdfContent], { type: 'application/pdf' });
  }
  
  /**
   * 解密KDH文件
   */
  private decryptKDH(data: Uint8Array): Uint8Array {
    const KDH_PASSPHRASE = "FZHMEI";
    const passphraseBytes = new TextEncoder().encode(KDH_PASSPHRASE);
    
    // 跳过前254字节
    const encryptedData = data.slice(254);
    const decrypted = new Uint8Array(encryptedData.length);
    let keyIndex = 0;
    
    for (let i = 0; i < encryptedData.length; i++) {
      decrypted[i] = encryptedData[i] ^ passphraseBytes[keyIndex];
      keyIndex = (keyIndex + 1) % passphraseBytes.length;
    }
    
    return decrypted;
  }
  
  /**
   * 验证CAJ文件
   */
  async validateCajFile(file: File): Promise<boolean> {
    try {
      const format = await this.detectCAJFormat(file);
      return format !== null;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 批量转换CAJ文件
   */
  async batchConvertCajToPdf(files: CajFile[]): Promise<Blob[]> {
    this.ensureInitialized();
    
    console.log(`🔄 Starting batch conversion of ${files.length} CAJ files...`);
    
    const results: Blob[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const cajFile = files[i];
      console.log(`📄 Processing file ${i + 1}/${files.length}: ${cajFile.file.name}`);
      
      try {
        const pdfBlob = await this.convertCajToPdf(cajFile);
        results.push(pdfBlob);
        console.log(`✅ Successfully converted ${cajFile.file.name}`);
      } catch (error) {
        console.error(`❌ Failed to convert ${cajFile.file.name}:`, error);
        // 添加一个空的PDF以保持索引对应
        results.push(new Blob([], { type: 'application/pdf' }));
      }
    }
    
    const successCount = results.filter(blob => blob.size > 1000).length;
    console.log(`🎉 Batch conversion completed: ${successCount}/${files.length} files converted successfully`);
    
    return results;
  }
  
  /**
   * 清理资源
   */
  cleanup(): void {
    this.unifiedConverter.cleanup();
    this.initialized = false;
  }
}
