// 基于Python CAJ解析器的TypeScript实现
// 直接集成到现有的MuPDFConverter中

// CAJ解析器类 - 基于Python代码转换
export class CajParser {
  private KDH_PASSPHRASE = [0x46, 0x5A, 0x48, 0x4D, 0x45, 0x49]; // "FZHMEI"
  
  constructor(private filename: string, private arrayBuffer: ArrayBuffer) {}
  
  // 检测CAJ格式 - 基于Python代码
  detectFormat(): { type: string; pageOffset?: number; tocOffset?: number; tocEndOffset?: number } | null {
    const dataView = new DataView(this.arrayBuffer);
    
    try {
      // 读取前4个字节
      const header = new Uint8Array(this.arrayBuffer, 0, 4);
      
      // 检查C8格式
      if (header[0] === 0xc8) {
        return {
          type: "C8",
          pageOffset: 0x08,
          tocOffset: 0,
          tocEndOffset: 0x50
        };
      }
      
      // 检查HN格式
      if (header[0] === 0x48 && header[1] === 0x4E) {
        // 检查是否是HN格式
        const nextBytes = new Uint8Array(this.arrayBuffer, 2, 2);
        if (nextBytes[0] === 0xc8 && nextBytes[1] === 0x00) {
          return {
            type: "HN",
            pageOffset: 0x90,
            tocOffset: 0,
            tocEndOffset: 0xD8
          };
        }
        
        // 标准HN格式
        return {
          type: "HN",
          pageOffset: 0x90,
          tocOffset: 0x158
        };
      }
      
      // 检查其他格式
      const headerStr = new TextDecoder('gb18030', { fatal: false }).decode(header).replace('\x00', '');
      
      if (headerStr === "CAJ") {
        return {
          type: "CAJ",
          pageOffset: 0x10,
          tocOffset: 0x110
        };
      }
      
      if (headerStr === "KDH ") {
        return { type: "KDH" };
      }
      
      if (headerStr === "TEB") {
        return { type: "TEB" };
      }
      
      if (headerStr.startsWith("%PDF")) {
        return { type: "PDF" };
      }
      
    } catch (error) {
      console.warn('格式检测失败:', error);
    }
    
    return null;
  }
  
  // 获取页面数量 - 基于Python代码
  getPageCount(format: { pageOffset?: number }): number {
    if (!format.pageOffset) return 0;
    
    const dataView = new DataView(this.arrayBuffer);
    if (format.pageOffset + 4 <= this.arrayBuffer.byteLength) {
      return dataView.getInt32(format.pageOffset, true);
    }
    return 0;
  }
  
  // 获取目录数量 - 基于Python代码
  getTocCount(format: { tocOffset?: number }): number {
    if (!format.tocOffset || format.tocOffset === 0) return 0;
    
    const dataView = new DataView(this.arrayBuffer);
    if (format.tocOffset + 4 <= this.arrayBuffer.byteLength) {
      return dataView.getInt32(format.tocOffset, true);
    }
    return 0;
  }
  
  // 提取目录 - 基于Python代码
  getToc(format: { tocOffset?: number; tocEndOffset?: number }): Array<{title: string; page: number; level: number}> {
    const toc: Array<{title: string; page: number; level: number}> = [];
    
    if (!format.tocOffset || format.tocOffset === 0) return toc;
    
    try {
      const dataView = new DataView(this.arrayBuffer);
      const tocCount = this.getTocCount(format);
      
      for (let i = 0; i < tocCount; i++) {
        const entryOffset = format.tocOffset + 4 + 0x134 * i;
        
        if (entryOffset + 0x134 <= this.arrayBuffer.byteLength) {
          // 读取目录条目 (256s24s12s12si) - 基于Python struct.unpack
          const titleBytes = new Uint8Array(this.arrayBuffer, entryOffset, 256);
          const pageBytes = new Uint8Array(this.arrayBuffer, entryOffset + 256, 24);
          const levelBytes = new Uint8Array(this.arrayBuffer, entryOffset + 280, 12);
          const levelData = new DataView(this.arrayBuffer, entryOffset + 292, 4);
          
          // 解析标题
          const titleEnd = titleBytes.indexOf(0);
          const title = new TextDecoder('gb18030', { fatal: false })
            .decode(titleBytes.slice(0, titleEnd))
            .trim();
          
          // 解析页码
          const pageEnd = pageBytes.indexOf(0);
          const page = parseInt(new TextDecoder('ascii', { fatal: false })
            .decode(pageBytes.slice(0, pageEnd))
            .trim());
          
          // 解析级别
          const level = levelData.getInt32(0, true);
          
          toc.push({ title, page, level });
        }
      }
    } catch (error) {
      console.warn('目录提取失败:', error);
    }
    
    return toc;
  }
  
  // CAJ格式转换 - 基于Python代码
  convertCajToPdf(): Uint8Array {
    const format = this.detectFormat();
    if (!format || format.type !== 'CAJ') {
      throw new Error('不支持的格式或非CAJ格式');
    }
    
    const dataView = new DataView(this.arrayBuffer);
    
    try {
      // 基于Python _convert_caj 方法
      const pageOffset = format.pageOffset!;
      
      // 读取PDF起始指针
      if (pageOffset + 4 <= this.arrayBuffer.byteLength) {
        const pdfStartPointer = dataView.getInt32(pageOffset + 4, true);
        
        if (pdfStartPointer > 0 && pdfStartPointer < this.arrayBuffer.byteLength) {
          // 读取PDF起始位置
          const pdfStart = dataView.getInt32(pdfStartPointer, true);
          
          if (pdfStart > 0 && pdfStart < this.arrayBuffer.byteLength) {
            // 搜索PDF结束位置 - 基于Python代码
            let pdfEnd = -1;
            const searchRange = Math.min(1000, this.arrayBuffer.byteLength - pdfStart);
            const pdfData = new Uint8Array(this.arrayBuffer, pdfStart, searchRange);
            
            // 搜索 "endobj" 标记
            for (let i = pdfData.length - 100; i >= 0; i--) {
              if (pdfData[i] === 0x65 && // 'e'
                  pdfData[i + 1] === 0x6E && // 'n'
                  pdfData[i + 2] === 0x64 && // 'd'
                  pdfData[i + 3] === 0x6F && // 'o'
                  pdfData[i + 4] === 0x62 && // 'b'
                  pdfData[i + 5] === 0x6A) { // 'j'
                pdfEnd = pdfStart + i + 6;
                break;
              }
            }
            
            if (pdfEnd > pdfStart) {
              const pdfLength = pdfEnd - pdfStart;
              console.log(`找到PDF数据，长度: ${pdfLength} bytes`);
              
              // 提取PDF数据
              const pdfDataBytes = new Uint8Array(this.arrayBuffer, pdfStart, pdfLength);
              
              // 添加PDF头部 - 基于Python代码
              const pdfHeader = new TextEncoder().encode('%PDF-1.3\r\n');
              const fullPdfData = new Uint8Array(pdfHeader.length + pdfDataBytes.length);
              fullPdfData.set(pdfHeader);
              fullPdfData.set(pdfDataBytes, pdfHeader.length);
              
              // 添加EOF标记
              const eofMarker = new TextEncoder().encode('\r\n%%EOF\r');
              const finalPdfData = new Uint8Array(fullPdfData.length + eofMarker.length);
              finalPdfData.set(fullPdfData);
              finalPdfData.set(eofMarker, fullPdfData.length);
              
              return finalPdfData;
            }
          }
        }
      }
      
      throw new Error('未找到PDF数据');
      
    } catch (error) {
      console.error('CAJ转换失败:', error);
      throw error;
    }
  }
  
  // 提取文本内容 - 基于Python代码
  extractText(): string {
    const format = this.detectFormat();
    if (!format) return '';
    
    let text = '';
    
    if (format.type === 'CAJ') {
      try {
        // 基于Python代码的CAJ解析
        const pdfData = this.convertCajToPdf();
        
        // 从PDF数据中提取文本
        text = this.extractTextFromPdfData(pdfData);
        
      } catch (error) {
        console.warn('CAJ文本提取失败:', error);
        
        // 降级：直接搜索文本
        text = this.searchTextInBinary();
      }
    }
    
    return text;
  }
  
  // 从PDF数据中提取文本 - 基于Python代码
  private extractTextFromPdfData(pdfData: Uint8Array): string {
    let text = '';
    
    try {
      // 搜索PDF文本对象
      const pdfString = new TextDecoder('latin1', { fatal: false }).decode(pdfData);
      
      // 查找文本流 - 基于Python代码
      const textStreamRegex = /BT\s*\/F\d+\s+\d+\s+Tf\s*([^]*?)ET/g;
      const matches = pdfString.match(textStreamRegex);
      
      if (matches && matches.length > 0) {
        for (const match of matches) {
          // 提取文本内容
          const textContentRegex = /\(([^)]+)\)/g;
          const textMatches = match.match(textContentRegex);
          
          if (textMatches) {
            for (const textMatch of textMatches) {
              const cleanText = textMatch.slice(1, -1); // 移除括号
              if (cleanText.length > 0) {
                text += cleanText + ' ';
              }
            }
          }
        }
      }
      
      // 如果没有找到文本流，尝试搜索其他文本模式
      if (text.length === 0) {
        // 搜索中文字符
        const chineseRegex = /[\u4e00-\u9fff]+/g;
        const chineseMatches = pdfString.match(chineseRegex);
        
        if (chineseMatches) {
          text = chineseMatches.join(' ');
        }
        
        // 搜索英文单词
        if (text.length === 0) {
          const wordRegex = /[a-zA-Z]{4,}/g;
          const wordMatches = pdfString.match(wordRegex);
          
          if (wordMatches && wordMatches.length > 5) {
            text = wordMatches.join(' ');
          }
        }
      }
      
      // 清理文本
      text = text.replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\r/g, '\r')
                .replace(/\s+/g, ' ')
                .trim();
      
    } catch (error) {
      console.warn('PDF文本解析失败:', error);
    }
    
    return text;
  }
  
  // 在二进制数据中搜索文本
  private searchTextInBinary(): string {
    const data = new Uint8Array(this.arrayBuffer);
    let text = '';
    
    try {
      // 搜索GB18030编码的中文字符
      for (let offset = 0; offset < data.length - 100; offset += 2) {
        if (data[offset] >= 0x81 && data[offset] <= 0xFE && 
            data[offset + 1] >= 0x40 && data[offset + 1] <= 0xFE) {
          
          const chunk = new Uint8Array(this.arrayBuffer, offset, 200);
          const decoder = new TextDecoder('gb18030', { fatal: false });
          const decoded = decoder.decode(chunk);
          
          const chineseChars = decoded.match(/[\u4e00-\u9fff]/g);
          if (chineseChars && chineseChars.length > 10) {
            text = decoded.trim();
            break;
          }
        }
      }
      
      // 如果没有找到，尝试UTF-8
      if (text.length === 0) {
        for (let offset = 0; offset < data.length - 100; offset += 10) {
          const chunk = new Uint8Array(this.arrayBuffer, offset, 100);
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const decoded = decoder.decode(chunk);
          
          const chineseChars = decoded.match(/[\u4e00-\u9fff]/g);
          if (chineseChars && chineseChars.length > 10) {
            text = decoded.trim();
            break;
          }
        }
      }
      
    } catch (error) {
      console.warn('二进制文本搜索失败:', error);
    }
    
    return text;
  }
  
  // KDH解密 - 基于Python代码
  decryptKdh(): Uint8Array {
    const data = new Uint8Array(this.arrayBuffer);
    
    // 跳过前254字节 - 基于Python代码
    const encryptedData = data.slice(254);
    
    // XOR解密 - 基于Python代码
    const output = new Uint8Array(encryptedData.length);
    let keyCursor = 0;
    
    for (let i = 0; i < encryptedData.length; i++) {
      output[i] = encryptedData[i] ^ this.KDH_PASSPHRASE[keyCursor];
      keyCursor = (keyCursor + 1) % this.KDH_PASSPHRASE.length;
    }
    
    // 查找EOF标记 - 基于Python代码
    const outputStr = new TextDecoder('ascii', { fatal: false }).decode(output);
    const eofPos = outputStr.lastIndexOf('%%EOF');
    
    if (eofPos < 0) {
      throw new Error('无法找到EOF标记');
    }
    
    return output.slice(0, eofPos + 5);
  }
}

// 导出解析器
export default CajParser;
