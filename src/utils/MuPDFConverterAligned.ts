// 基于Python实现的对齐版本CAJ转换器

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

export class MuPDFConverterAligned {
  private pyMuPDF: any = null;
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      console.log('初始化对齐版CAJ二进制解析器...');
      this.initialized = true;
      console.log('✅ 对齐版解析器初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
      throw error;
    }
  }

  // 基于Python的精确格式检测
  private async detectCAJFormat(file: File): Promise<CAJFormat | null> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const dataView = new DataView(arrayBuffer);
      
      // 读取前4字节 - 完全对齐Python逻辑
      const header = new Uint8Array(arrayBuffer, 0, 4);
      const headerStr = String.fromCharCode(...header.filter(b => b > 0));
      
      console.log('文件头:', headerStr, header);
      
      if (headerStr.startsWith('CAJ')) {
        console.log('检测到CAJ格式');
        return {
          type: 'CAJ',
          pageOffset: 0x10,
          tocOffset: 0x110,
          tocEndOffset: 0,
          pageDataOffset: 0
        };
      }
      
      if (headerStr.startsWith('HN')) {
        // Python逻辑：动态计算偏移量
        const pageOffset = 0x90;
        const tocOffset = 0x158;
        const tocNum = dataView.getInt32(tocOffset, true);
        const tocEndOffset = tocOffset + 4 + 0x134 * tocNum;
        const pageDataOffset = tocEndOffset + 20 * dataView.getInt32(pageOffset, true);
        
        return {
          type: 'HN',
          pageOffset,
          tocOffset,
          tocEndOffset,
          pageDataOffset
        };
      }
      
      if (headerStr.startsWith('%PDF')) {
        console.log('检测到PDF格式');
        return {
          type: 'PDF',
          pageOffset: 0,
          tocOffset: 0,
          tocEndOffset: 0,
          pageDataOffset: 0
        };
      }
      
      if (headerStr.startsWith('KDH')) {
        console.log('检测到KDH格式');
        return {
          type: 'KDH',
          pageOffset: 0,
          tocOffset: 0,
          tocEndOffset: 0,
          pageDataOffset: 0
        };
      }
      
      if (headerStr.startsWith('TEB')) {
        console.log('检测到TEB格式');
        return {
          type: 'TEB',
          pageOffset: 0,
          tocOffset: 0,
          tocEndOffset: 0,
          pageDataOffset: 0
        };
      }
      
      // 如果标准检测失败，检查单字节格式
      if (header[0] === 0xC8) {
        console.log('检测到C8格式');
        return {
          type: 'C8',
          pageOffset: 0,
          tocOffset: 0,
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

  // 基于Python的TOC解析
  private extractTOC(arrayBuffer: ArrayBuffer, format: CAJFormat): any[] {
    if (format.tocOffset === 0) return [];
    
    const dataView = new DataView(arrayBuffer);
    const tocNum = dataView.getInt32(format.tocOffset, true);
    const toc = [];
    
    for (let i = 0; i < tocNum; i++) {
      try {
        const entryOffset = format.tocOffset + 4 + 0x134 * i;
        
        // Python逻辑：struct.unpack("256s24s12s12si", caj.read(0x134))
        const titleBytes = new Uint8Array(arrayBuffer, entryOffset, 256);
        const titleEnd = titleBytes.findIndex(b => b === 0);
        const title = new TextDecoder('gb18030', { fatal: false })
          .decode(titleBytes.slice(0, titleEnd > 0 ? titleEnd : 256));
        
        const pageBytes = new Uint8Array(arrayBuffer, entryOffset + 256 + 24, 12);
        const pageEnd = pageBytes.findIndex(b => b === 0);
        const page = parseInt(new TextDecoder().decode(
          pageBytes.slice(0, pageEnd > 0 ? pageEnd : 12)
        )) || 1;
        
        toc.push({ title, page, level: 1 });
      } catch (error) {
        console.warn(`TOC条目 ${i} 解析失败:`, error);
      }
    }
    
    return toc;
  }

  // 基于Python HNParsePage的文本提取
  private extractHNText(arrayBuffer: ArrayBuffer, format: CAJFormat): string {
    const data = new Uint8Array(arrayBuffer);
    const characters: string[] = [];
    let offset = format.pageDataOffset || 0;
    
    // 模拟Python的HNParsePage解析逻辑
    while (offset < data.length - 2) {
      const dispatchCode = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      
      // 处理文本类型 (0x8001, 0x8070)
      if (dispatchCode === 0x8001 || dispatchCode === 0x8070) {
        if (dispatchCode === 0x8001) {
          characters.push('\n');
        }
        
        // 解析文本内容 - 完全对齐Python逻辑
        while (offset < data.length - 4) {
          if (data[offset + 1] === 0x80) {
            break; // 结束标记
          }
          
          try {
            // Python: bytes([data[offset+3], data[offset+2]]).decode("gbk")
            const charBytes = new Uint8Array([data[offset + 3], data[offset + 2]]);
            const decoder = new TextDecoder('gbk', { fatal: false });
            const char = decoder.decode(charBytes);
            characters.push(char);
          } catch (e) {
            // 解码失败，跳过这个字符
          }
          
          offset += 4;
        }
      } else {
        offset += 2; // 跳过非文本数据
      }
    }
    
    return characters.join('')
      .replace(/\x00/g, '') // 移除空字符
      .replace(/\r/g, '') // 移除回车符
      .replace(/[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g, '') // 只保留中文和基本标点
      .replace(/\n{3,}/g, '\n\n'); // 限制连续换行
  }

  // 主要提取方法
  private async extractFullContent(file: File, format: CAJFormat): Promise<{ text: string; images: any[]; toc: any[] }> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 提取TOC
      const toc = this.extractTOC(arrayBuffer, format);
      console.log('目录条目数量:', toc.length);
      
      // 提取文本
      let text = '';
      if (format.type === 'HN') {
        text = this.extractHNText(arrayBuffer, format);
      } else {
        // 其他格式的降级处理
        text = this.searchChineseText(arrayBuffer);
      }
      
      console.log('提取文本长度:', text.length);
      
      return { text, images: [], toc };
    } catch (error) {
      console.error('内容提取失败:', error);
      return { text: '', images: [], toc: [] };
    }
  }

  // 降级文本搜索 - 改进版本
  private searchChineseText(arrayBuffer: ArrayBuffer): string {
    try {
      const data = new Uint8Array(arrayBuffer);
      let bestText = '';
      let maxChineseChars = 0;
      
      const encodings = ['utf-8', 'gb18030', 'gbk', 'gb2312'];
      
      for (const encoding of encodings) {
        try {
          const decoder = new TextDecoder(encoding, { fatal: false });
          const text = decoder.decode(arrayBuffer);
          const chineseMatches = text.match(/[\u4e00-\u9fff]+/g);
          const chineseCount = chineseMatches ? chineseMatches.join('').length : 0;
          
          if (chineseCount > maxChineseChars) {
            maxChineseChars = chineseCount;
            bestText = text;
          }
        } catch (e) {
          // 忽略编码错误
        }
      }
      
      // 更严格的清理 - 只保留真正的中文文本和基本标点
      const chineseMatches = bestText.match(/[\u4e00-\u9fff]+/g);
      if (!chineseMatches) return '';
      
      const cleanText = chineseMatches.join('');
      
      // 进一步过滤掉可能的乱码字符
      const filteredText = cleanText
        .replace(/[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      return filteredText;
      
    } catch (error) {
      console.warn('中文文本搜索失败:', error);
      return '';
    }
  }

  // 简单PDF生成
  private generateSimplePdf(content: string): Uint8Array {
    const maxLength = 5000;
    const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) : content;
    const cleanContent = truncatedContent.replace(/[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g, '');
    
    const lines = cleanContent.split('\n');
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
      
      const { text, toc } = await this.extractFullContent(cajFile.file, format);
      
      if (text.length === 0) {
        throw new Error('无法提取文本内容');
      }
      
      console.log('提取内容完成 - 文本长度:', text.length);
      
      const pdfContent = this.generateSimplePdf(text);
      const blob = new Blob([pdfContent.buffer], { type: 'application/pdf' });
      
      console.log('PDF生成完成，大小:', blob.size, 'bytes');
      return blob;
      
    } catch (error) {
      console.error('PDF转换失败:', error);
      throw error;
    }
  }

  async extractTextFromCaj(cajFile: CajFile): Promise<string> {
    try {
      console.log('提取CAJ文件文本:', cajFile.file.name);
      
      const format = await this.detectCAJFormat(cajFile.file);
      if (!format) {
        return '无法检测文件格式';
      }
      
      const { text } = await this.extractFullContent(cajFile.file, format);
      return text;
      
    } catch (error) {
      console.error('文本提取失败:', error);
      return '文本提取失败';
    }
  }
}
