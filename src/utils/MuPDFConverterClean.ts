// 完全清理版本的CAJ转换器

interface CAJFormat {
  type: string;
  pageOffset: number;
  tocOffset: number;
  tocEndOffset: number;
  pageDataOffset: number;
}

interface CajFile {
  id: string;
  file: File;
  uploadStatus: "pending" | "uploading" | "uploaded" | "converting" | "completed" | "error";
  blobUrl: string;
  txtUrl: string;
  outputFormat: "pdf" | "txt";
  progress: number;
  errorMessage?: string;
  selected: boolean;
  needsOcr: boolean;
}

export class MuPDFConverterClean {
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      console.log('初始化清理版CAJ解析器...');
      this.initialized = true;
      console.log('✅ 清理版解析器初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
      throw error;
    }
  }

  // 格式检测
  private async detectCAJFormat(file: File): Promise<CAJFormat | null> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer, 0, 4);
      const headerStr = String.fromCharCode(...header.filter(b => b > 0));
      
      if (headerStr.startsWith('CAJ')) {
        return {
          type: 'CAJ',
          pageOffset: 0x10,
          tocOffset: 0x110,
          tocEndOffset: 0,
          pageDataOffset: 0
        };
      }
      
      return null;
    } catch (error) {
      console.error('格式检测失败:', error);
      return null;
    }
  }

  // 严格的中文文本提取
  private extractCleanChineseText(arrayBuffer: ArrayBuffer): string {
    try {
      // 尝试多种编码
      const encodings = ['gb18030', 'gbk', 'gb2312', 'utf-8'];
      let bestResult = '';
      let maxValidChinese = 0;
      
      for (const encoding of encodings) {
        try {
          const decoder = new TextDecoder(encoding, { fatal: false });
          const text = decoder.decode(arrayBuffer);
          
          // 提取所有中文字符序列
          const chineseMatches = text.match(/[\u4e00-\u9fff]+/g);
          if (!chineseMatches) continue;
          
          const chineseText = chineseMatches.join('');
          
          // 验证中文字符的质量
          const validChineseCount = this.countValidChinese(chineseText);
          
          if (validChineseCount > maxValidChinese) {
            maxValidChinese = validChineseCount;
            bestResult = chineseText;
          }
        } catch (e) {
          // 忽略编码错误
        }
      }
      
      // 最终清理
      return this.cleanChineseText(bestResult);
      
    } catch (error) {
      console.warn('中文文本提取失败:', error);
      return '';
    }
  }

  // 计算有效中文字符数量
  private countValidChinese(text: string): number {
    // 常用中文字符范围
    const validChinese = text.match(/[\u4e00-\u9fff]/g);
    return validChinese ? validChinese.length : 0;
  }

  // 清理中文文本
  private cleanChineseText(text: string): string {
    if (!text) return '';
    
    // 只保留中文字符、数字、基本标点和空格
    const cleaned = text
      .replace(/[^\u4e00-\u9fff0-9\s\.,;:!?()（）【】""''""—–\-\n\r\t]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // 检查是否包含足够的中文内容
    const chineseCount = this.countValidChinese(cleaned);
    if (chineseCount < 100) {
      return ''; // 中文内容太少，可能是乱码
    }
    
    return cleaned;
  }

  // 简单PDF生成
  private generateSimplePdf(content: string): Uint8Array {
    const maxLength = 5000;
    const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) : content;
    
    const lines = truncatedContent.split('\n').filter(line => line.trim());
    const maxLinesPerPage = 40;
    const pages: string[] = [];
    
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      const pageLines = lines.slice(i, i + maxLinesPerPage);
      pages.push(pageLines.join('\n'));
    }
    
    const maxPages = Math.min(pages.length, 5);
    const pdfPages = pages.slice(0, maxPages);
    
    let pdf = `%PDF-1.4\n`;
    pdf += `1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n`;
    
    pdf += `2 0 obj\n<<\n/Type /Pages\n/Kids [`;
    for (let i = 0; i < pdfPages.length; i++) {
      pdf += `${3 + i} 0 R `;
    }
    pdf += `]\n/Count ${pdfPages.length}\n>>\nendobj\n`;
    
    let xref = `xref\n0 ${pdfPages.length + 3}\n0000000000 65535 f \n`;
    let currentOffset = pdf.length;
    
    for (let i = 0; i < pdfPages.length + 2; i++) {
      xref += `${currentOffset.toString().padStart(10, '0')} 00000 n \n`;
      currentOffset += pdfPages.length > 0 ? 100 : 50;
    }
    
    for (let i = 0; i < pdfPages.length; i++) {
      const pageContent = pdfPages[i].replace(/[\n\r]/g, ' ');
      pdf += `${3 + i} 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents <</Length ${pageContent.length}>>\n>>\nstream\n${pageContent}\nendstream\nendobj\n`;
    }
    
    const trailer = `trailer\n<<\n/Size ${pdfPages.length + 3}\n/Root 1 0 R\n>>\nstartxref\n${pdf.length}\n%%EOF\n`;
    
    pdf += xref + trailer;
    return new TextEncoder().encode(pdf);
  }

  // 主要转换方法
  async convertCajToPdf(cajFile: CajFile): Promise<Blob> {
    try {
      console.log('转换CAJ文件为PDF:', cajFile.file.name);
      
      const format = await this.detectCAJFormat(cajFile.file);
      if (!format) {
        throw new Error('无法检测文件格式');
      }
      
      console.log('检测到格式:', format.type);
      
      const arrayBuffer = await cajFile.file.arrayBuffer();
      const text = this.extractCleanChineseText(arrayBuffer);
      
      if (text.length === 0) {
        throw new Error('无法提取有效的中文内容');
      }
      
      console.log('提取有效中文内容长度:', text.length);
      
      const pdfContent = this.generateSimplePdf(text);
      const blob = new Blob([pdfContent.buffer], { type: 'application/pdf' });
      
      console.log('PDF生成完成，大小:', blob.size, 'bytes');
      return blob;
      
    } catch (error) {
      console.error('PDF转换失败:', error);
      throw error;
    }
  }

  // 文本提取方法
  async extractTextFromCaj(cajFile: CajFile): Promise<string> {
    try {
      console.log('提取CAJ文件文本:', cajFile.file.name);
      
      const format = await this.detectCAJFormat(cajFile.file);
      if (!format) {
        return '无法检测文件格式';
      }
      
      const arrayBuffer = await cajFile.file.arrayBuffer();
      const text = this.extractCleanChineseText(arrayBuffer);
      
      return text;
      
    } catch (error) {
      console.error('文本提取失败:', error);
      return '文本提取失败';
    }
  }
}
