// 严格清理版本的CAJ转换器 - 只提取真正可读的中文内容

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

export class MuPDFConverterStrict {
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      console.log('初始化严格版CAJ解析器...');
      this.initialized = true;
      console.log('✅ 严格版解析器初始化完成');
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
  private extractStrictChineseText(arrayBuffer: ArrayBuffer): string {
    try {
      // 使用gb18030编码（已知是正确的）
      const decoder = new TextDecoder('gb18030', { fatal: false });
      const text = decoder.decode(arrayBuffer);
      
      // 提取所有中文字符序列
      const chineseMatches = text.match(/[\u4e00-\u9fff]+/g);
      if (!chineseMatches) return '';
      
      const rawChineseText = chineseMatches.join('');
      
      // 严格过滤：只保留真正的可读中文
      const cleanText = this.strictCleanChineseText(rawChineseText);
      
      return cleanText;
      
    } catch (error) {
      console.warn('中文文本提取失败:', error);
      return '';
    }
  }

  // 严格的中文文本清理
  private strictCleanChineseText(text: string): string {
    if (!text) return '';
    
    // 常见的中文字符和词汇
    const commonChineseWords = [
      '的', '是', '在', '有', '和', '了', '不', '人', '一', '个', '我', '你', '他', '她', '它',
      '这', '那', '里', '来', '去', '说', '看', '听', '想', '做', '要', '会', '能', '可以', '应该',
      '研究', '分析', '发展', '经济', '社会', '中国', '历史', '文化', '教育', '科学', '技术',
      '第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章',
      '摘要', '绪论', '引言', '结论', '参考文献', '目录', '标题', '内容', '方法', '结果', '讨论'
    ];
    
    // 按字符分割并过滤
    const chars = text.split('');
    let cleanChars = [];
    let currentWord = '';
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      // 检查是否是常见中文字符
      if (commonChineseWords.includes(char)) {
        cleanChars.push(char);
        currentWord = '';
        continue;
      }
      
      // 检查是否是中文字符
      if (/[\u4e00-\u9fff]/.test(char)) {
        currentWord += char;
        
        // 检查当前词是否是常见词汇
        if (commonChineseWords.some(word => currentWord.includes(word))) {
          cleanChars.push(...currentWord.split(''));
          currentWord = '';
        } else if (currentWord.length > 4) {
          // 如果词太长且不常见，可能是乱码，丢弃
          currentWord = '';
        }
      } else if (/[0-9\s\.,;:!?()（）【】""''""—–\-\n\r\t]/.test(char)) {
        // 保留数字和基本标点
        if (currentWord.length > 0) {
          cleanChars.push(...currentWord.split(''));
          currentWord = '';
        }
        cleanChars.push(char);
      } else {
        // 其他字符丢弃，重置当前词
        currentWord = '';
      }
    }
    
    // 添加最后的词
    if (currentWord.length > 0) {
      cleanChars.push(...currentWord.split(''));
    }
    
    let result = cleanChars.join('');
    
    // 进一步清理：移除连续的重复字符（可能是乱码）
    result = result.replace(/(.)\1{3,}/g, '$1');
    
    // 清理空格和换行
    result = result
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // 检查质量
    if (this.countValidChinese(result) < 100) {
      return ''; // 中文内容太少
    }
    
    return result;
  }

  // 计算有效中文字符数量
  private countValidChinese(text: string): number {
    const validChinese = text.match(/[\u4e00-\u9fff]/g);
    return validChinese ? validChinese.length : 0;
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
      const text = this.extractStrictChineseText(arrayBuffer);
      
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
      const text = this.extractStrictChineseText(arrayBuffer);
      
      return text;
      
    } catch (error) {
      console.error('文本提取失败:', error);
      return '文本提取失败';
    }
  }
}
