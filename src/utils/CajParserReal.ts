// 真正解决中文乱码和内容提取问题的CAJ解析器
// 基于参考代码，专注于正确的编码处理和完整内容提取

// KDH解密密钥
const KDH_PASSPHRASE = new Uint8Array([0x46, 0x5A, 0x48, 0x4D, 0x45, 0x49]); // "FZHMEI"

// CAJ格式接口
interface CAJFormat {
  type: 'CAJ' | 'HN' | 'C8' | 'PDF' | 'KDH' | 'TEB';
  pageOffset: number;
  tocOffset: number;
  tocEndOffset: number;
  pageDataOffset: number;
  pageCount?: number;
}

// TOC条目结构
interface TOCEntry {
  title: string;
  page: number;
  level: number;
}

/**
 * 真正解决编码问题的CAJ解析器
 */
export class CajParserReal {
  private arrayBuffer: ArrayBuffer;
  private dataView: DataView;
  private format: CAJFormat | null = null;

  constructor(arrayBuffer: ArrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.dataView = new DataView(arrayBuffer);
  }

  /**
   * 正确检测CAJ文件格式
   */
  public detectFormat(): CAJFormat | null {
    try {
      if (this.arrayBuffer.byteLength < 4) return null;

      // 读取前4字节
      const first4 = new Uint8Array(this.arrayBuffer, 0, 4);

      // 检查C8格式
      if (first4[0] === 0xc8) {
        const pageCount = this.dataView.getInt32(0x08, true);
        return {
          type: 'C8',
          pageOffset: 0x08,
          tocOffset: 0,
          tocEndOffset: 0x50,
          pageDataOffset: 0x50 + 20 * pageCount,
          pageCount
        };
      }

      // 检查HN格式
      if (first4[0] === 0x48 && first4[1] === 0x4e) {
        if (this.arrayBuffer.byteLength >= 4 && 
            this.dataView.getUint8(2) === 0xc8 && 
            this.dataView.getUint8(3) === 0x00) {
          const pageCount = this.dataView.getInt32(0x90, true);
          return {
            type: 'HN',
            pageOffset: 0x90,
            tocOffset: 0,
            tocEndOffset: 0xD8,
            pageDataOffset: 0xD8 + 20 * pageCount,
            pageCount
          };
        }
      }

      // 尝试解码格式字符串 - 使用正确的编码
      try {
        // 首先尝试ASCII
        let fmt = '';
        for (let i = 0; i < 4; i++) {
          if (first4[i] >= 32 && first4[i] <= 126) {
            fmt += String.fromCharCode(first4[i]);
          } else {
            break;
          }
        }
        
        // 如果ASCII失败，尝试GB18030
        if (fmt.length < 3) {
          const decoder = new TextDecoder('gb18030', { fatal: false });
          fmt = decoder.decode(first4).replace(/\x00/g, '').trim();
        }
        
        switch (fmt) {
          case 'CAJ':
            const pageCount = this.dataView.getInt32(0x10, true);
            const tocNum = this.dataView.getInt32(0x110, true);
            return {
              type: 'CAJ',
              pageOffset: 0x10,
              tocOffset: 0x110,
              tocEndOffset: 0x110 + 4 + 0x134 * tocNum,
              pageDataOffset: 0x110 + 4 + 0x134 * tocNum + 20 * pageCount,
              pageCount
            };
          case 'HN':
            const hnPageCount = this.dataView.getInt32(0x90, true);
            const hnTocNum = this.dataView.getInt32(0x158, true);
            return {
              type: 'HN',
              pageOffset: 0x90,
              tocOffset: 0x158,
              tocEndOffset: 0x158 + 4 + 0x134 * hnTocNum,
              pageDataOffset: 0x158 + 4 + 0x134 * hnTocNum + 20 * hnPageCount,
              pageCount: hnPageCount
            };
          case '%PDF':
            return {
              type: 'PDF',
              pageOffset: 0,
              tocOffset: 0,
              tocEndOffset: 0,
              pageDataOffset: 0
            };
          case 'KDH ':
            return {
              type: 'KDH',
              pageOffset: 0,
              tocOffset: 0,
              tocEndOffset: 0,
              pageDataOffset: 0
            };
          case 'TEB':
            return {
              type: 'TEB',
              pageOffset: 0,
              tocOffset: 0,
              tocEndOffset: 0,
              pageDataOffset: 0
            };
        }
      } catch (decodeError) {
        console.warn('格式解码失败:', decodeError);
      }

      return null;
    } catch (error) {
      console.error('格式检测失败:', error);
      return null;
    }
  }

  /**
   * 正确提取TOC（解决中文乱码）
   */
  public extractTOC(): TOCEntry[] {
    if (!this.format || this.format.tocOffset === 0) {
      return [];
    }

    const toc: TOCEntry[] = [];
    
    try {
      const tocNum = this.dataView.getInt32(this.format.tocOffset, true);
      console.log('目录条目数量:', tocNum);

      if (tocNum < 0 || tocNum > 10000) {
        console.warn('目录数量异常，跳过目录解析:', tocNum);
        return toc;
      }

      const maxEntries = Math.floor((this.arrayBuffer.byteLength - this.format.tocOffset - 4) / 0x134);
      const actualTocNum = Math.min(tocNum, maxEntries);
      
      console.log('实际解析目录条目数:', actualTocNum);
      
      for (let i = 0; i < actualTocNum; i++) {
        try {
          const entryOffset = this.format.tocOffset + 4 + 0x134 * i;
          
          if (entryOffset + 256 + 24 + 12 + 12 + 4 > this.arrayBuffer.byteLength) {
            console.warn(`目录条目 ${i} 超出文件边界，停止解析`);
            break;
          }

          // 读取标题 - 使用正确的中文编码
          const titleBytes = new Uint8Array(this.arrayBuffer, entryOffset, 256);
          const titleEnd = titleBytes.findIndex(b => b === 0);
          const titleBytesTrimmed = titleBytes.slice(0, titleEnd >= 0 ? titleEnd : 256);
          
          let title = '';
          try {
            // 首先尝试GB18030（CAJ文件的标准编码）
            const decoder = new TextDecoder('gb18030', { fatal: false });
            title = decoder.decode(titleBytesTrimmed);
          } catch (gbError) {
            try {
              // 如果GB18030失败，尝试GBK
              const decoder = new TextDecoder('gbk', { fatal: false });
              title = decoder.decode(titleBytesTrimmed);
            } catch (gbkError) {
              try {
                // 最后尝试UTF-8
                const decoder = new TextDecoder('utf-8', { fatal: false });
                title = decoder.decode(titleBytesTrimmed);
              } catch (utfError) {
                // 如果都失败，使用安全的方式
                title = Array.from(titleBytesTrimmed)
                  .map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '?')
                  .join('');
              }
            }
          }

          // 读取页码
          const pageBytes = new Uint8Array(this.arrayBuffer, entryOffset + 256 + 24, 12);
          const pageEnd = pageBytes.findIndex(b => b === 0);
          const pageStr = new TextDecoder('ascii').decode(pageBytes.slice(0, pageEnd >= 0 ? pageEnd : 12));
          const page = parseInt(pageStr) || 1;

          // 读取级别
          const levelOffset = entryOffset + 256 + 24 + 12 + 12;
          let level = 1;
          if (levelOffset + 4 <= this.arrayBuffer.byteLength) {
            level = this.dataView.getInt32(levelOffset, true);
          }

          toc.push({
            title: title.trim(),
            page,
            level: Math.max(1, level) // 确保级别至少为1
          });

        } catch (entryError) {
          console.warn(`解析目录条目 ${i} 失败:`, entryError);
          continue;
        }
      }

    } catch (error) {
      console.error('TOC解析失败:', error);
    }

    return toc;
  }

  /**
   * 提取完整的PDF数据（针对CAJ格式）
   */
  public extractPdfData(): Uint8Array | null {
    if (!this.format || this.format.type !== 'CAJ') {
      return null;
    }

    try {
      // 基于参考代码的PDF数据提取逻辑
      const pdfStartPointerOffset = this.format.pageOffset + 4;
      if (pdfStartPointerOffset + 4 > this.arrayBuffer.byteLength) {
        return null;
      }

      const pdfStartPointer = this.dataView.getInt32(pdfStartPointerOffset, true);
      
      if (pdfStartPointer + 4 > this.arrayBuffer.byteLength) {
        return null;
      }

      const pdfStart = this.dataView.getInt32(pdfStartPointer, true);

      // 查找所有 "endobj" 标记的位置
      const endobjPositions = this.findEndobjPositions();
      if (endobjPositions.length === 0) {
        console.warn('未找到PDF endobj标记');
        return null;
      }

      const pdfEnd = endobjPositions[endobjPositions.length - 1] + 6;
      const pdfLength = pdfEnd - pdfStart;

      if (pdfStart < 0 || pdfLength <= 0 || pdfStart + pdfLength > this.arrayBuffer.byteLength) {
        console.warn('PDF数据范围无效');
        return null;
      }

      // 提取PDF数据
      const pdfData = new Uint8Array(this.arrayBuffer, pdfStart, pdfLength);
      
      // 验证PDF数据
      const pdfHeader = new TextDecoder('ascii', { fatal: false }).decode(pdfData.slice(0, 4));
      if (!pdfHeader.startsWith('%PDF')) {
        console.warn('提取的数据不是有效的PDF格式');
        return null;
      }
      
      console.log(`成功提取PDF数据: ${pdfLength} bytes`);
      return pdfData;

    } catch (error) {
      console.error('PDF数据提取失败:', error);
      return null;
    }
  }

  /**
   * 查找所有 "endobj" 标记的位置
   */
  private findEndobjPositions(): number[] {
    const positions: number[] = [];
    const data = new Uint8Array(this.arrayBuffer);
    const endobjPattern = new Uint8Array([0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A]); // "endobj"

    for (let i = 0; i <= data.length - endobjPattern.length; i++) {
      let match = true;
      for (let j = 0; j < endobjPattern.length; j++) {
        if (data[i + j] !== endobjPattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        positions.push(i);
      }
    }

    return positions;
  }

  /**
   * 解析HN格式的页面数据（修复编码问题）
   */
  public parseHNPageData(pageOffset: number): { text: string; images: any[] } {
    try {
      if (pageOffset + 20 > this.arrayBuffer.byteLength) {
        return { text: '', images: [] };
      }

      // 读取页面信息
      const pageInfo = this.parsePageInfo(pageOffset);
      
      if (pageInfo.pageDataOffset + pageInfo.sizeOfTextSection > this.arrayBuffer.byteLength) {
        return { text: '', images: [] };
      }

      // 读取页面数据
      const pageData = new Uint8Array(this.arrayBuffer, pageInfo.pageDataOffset, pageInfo.sizeOfTextSection);
      
      // 使用修复的HN文本解析
      const text = this.parseHNTextDataFixed(pageData);
      
      return { text, images: [] };

    } catch (error) {
      console.error('HN页面数据解析失败:', error);
      return { text: '', images: [] };
    }
  }

  /**
   * 修复的HN文本数据解析（解决编码问题）
   */
  private parseHNTextDataFixed(data: Uint8Array): string {
    const characters: string[] = [];
    let offset = 0;

    while (offset <= data.length - 2) {
      const dispatchCode = data[offset] | (data[offset + 1] << 8);
      offset += 2;

      switch (dispatchCode) {
        case 0x8001: // Text
          if (offset + 4 <= data.length) {
            try {
              // 读取双字节字符（小端序）
              const charCode = data[offset + 1] << 8 | data[offset];
              const charBytes = new Uint8Array([data[offset + 1], data[offset]]);
              
              try {
                // 尝试GBK解码（HN文件常用编码）
                const char = new TextDecoder('gbk', { fatal: false }).decode(charBytes);
                if (char && char !== '\x00') {
                  characters.push(char);
                }
              } catch (decodeError) {
                // 处理特殊控制字符
                const specialChars: { [key: number]: string } = {
                  0xA389: "\t",
                  0xA38A: "\n", 
                  0xA38D: "\r",
                  0xA3A0: " ",
                };
                
                if (specialChars[charCode]) {
                  characters.push(specialChars[charCode]);
                } else {
                  // 对于无法解码的字符，跳过
                  console.debug(`跳过无法解码的字符: 0x${charCode.toString(16)}`);
                }
              }
            } catch (error) {
              // 跳过错误
            }
            offset += 4;
          }
          break;

        case 0x800A: // Figure
          if (offset + 24 <= data.length) {
            offset += 24; // 跳过图像数据
          }
          break;

        default:
          // 跳过未知的dispatch code
          break;
      }

      if (offset >= data.length) break;
    }

    let text = characters.join('');
    
    // 清理文本，移除空字符和多余空白
    text = text.replace(/\x00/g, '').replace(/\s+/g, ' ').trim();
    
    return text;
  }

  /**
   * 解析页面信息
   */
  private parsePageInfo(offset: number): {
    pageDataOffset: number;
    sizeOfTextSection: number;
    imagesPerPage: number;
    pageNumber: number;
    unknown1: number;
    nextPageDataOffset: number;
  } {
    return {
      pageDataOffset: this.dataView.getInt32(offset, true),
      sizeOfTextSection: this.dataView.getInt32(offset + 4, true),
      imagesPerPage: this.dataView.getUint16(offset + 8, true),
      pageNumber: this.dataView.getUint16(offset + 10, true),
      unknown1: this.dataView.getInt32(offset + 12, true),
      nextPageDataOffset: this.dataView.getInt32(offset + 16, true)
    };
  }

  /**
   * 提取大量文本内容（解决内容过少问题）
   */
  public extractAllText(): string {
    const textParts: string[] = [];

    try {
      if (!this.format) {
        return this.extractTextFromBinary();
      }

      switch (this.format.type) {
        case 'CAJ':
          // 尝试从PDF数据提取文本
          const pdfData = this.extractPdfData();
          if (pdfData) {
            const pdfText = this.extractTextFromPdfData(pdfData);
            if (pdfText.length > 0) {
              textParts.push(pdfText);
            }
          }
          
          // 如果PDF文本不足，尝试从文件其他位置提取
          if (textParts.join('').length < 1000) {
            const additionalText = this.extractTextFromBinary();
            if (additionalText.length > 0) {
              textParts.push(additionalText);
            }
          }
          break;

        case 'HN':
        case 'C8':
          // 解析所有页面
          if (this.format.pageDataOffset && this.format.pageCount) {
            let currentOffset = this.format.pageDataOffset;
            
            for (let page = 0; page < this.format.pageCount; page++) {
              try {
                const pageResult = this.parseHNPageData(currentOffset);
                if (pageResult.text.length > 0) {
                  textParts.push(pageResult.text);
                }
                
                // 计算下一页偏移
                if (currentOffset + 20 <= this.arrayBuffer.byteLength) {
                  const nextPageOffset = this.dataView.getInt32(currentOffset + 16, true);
                  if (nextPageOffset <= currentOffset || nextPageOffset >= this.arrayBuffer.byteLength) {
                    break;
                  }
                  currentOffset = nextPageOffset;
                } else {
                  break;
                }
              } catch (pageError) {
                console.warn(`解析第${page + 1}页失败:`, pageError);
                break;
              }
            }
          }
          break;

        case 'PDF':
          // 直接从PDF提取文本
          const pdfText = this.extractTextFromPdfData(new Uint8Array(this.arrayBuffer));
          if (pdfText.length > 0) {
            textParts.push(pdfText);
          }
          break;

        case 'KDH':
          // KDH解密后提取文本
          const decryptedData = this.decryptKDH();
          if (decryptedData.length > 0) {
            const decryptedText = this.extractTextFromPdfData(decryptedData);
            if (decryptedText.length > 0) {
              textParts.push(decryptedText);
            }
          }
          break;
      }

      // 如果仍然没有足够文本，尝试通用提取
      if (textParts.join('').length < 500) {
        const genericText = this.extractTextFromBinary();
        if (genericText.length > textParts.join('').length) {
          textParts.push(genericText);
        }
      }

    } catch (error) {
      console.error('文本提取失败:', error);
    }

    const finalText = textParts.join('\n\n').trim();
    console.log(`文本提取完成: ${finalText.length} 字符`);
    return finalText;
  }

  /**
   * 从PDF数据提取文本
   */
  private extractTextFromPdfData(pdfData: Uint8Array): string {
    const textParts: string[] = [];

    try {
      // 方法1: 提取括号内的文本
      const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(pdfData);
      const bracketTexts = pdfText.match(/\(([^)]+)\)/g);
      if (bracketTexts) {
        const bracketContent = bracketTexts.map(t => t.slice(1, -1)).join(' ');
        if (bracketContent.length > 10) {
          textParts.push(bracketContent);
        }
      }

      // 方法2: 提取流内容
      const streamMatches = pdfText.match(/stream\s*\n([\s\S]*?)\n*endstream/g);
      if (streamMatches) {
        for (const match of streamMatches) {
          const streamContent = match.replace(/stream\s*\n/, '').replace(/\n*endstream$/, '');
          if (streamContent.length > 10) {
            // 尝试解码流内容
            try {
              const decodedStream = new TextDecoder('utf-8', { fatal: false }).decode(
                new Uint8Array(Array.from(streamContent).map(c => c.charCodeAt(0)))
              );
              if (decodedStream.length > 10 && this.isMeaningfulText(decodedStream)) {
                textParts.push(decodedStream);
              }
            } catch (streamError) {
              // 跳过无法解码的流
            }
          }
        }
      }

      // 方法3: 提取所有可读文本
      const readableText = pdfText.replace(/[^\x20-\x7E\u4e00-\u9fff]/g, ' ').trim();
      if (readableText.length > 20 && this.isMeaningfulText(readableText)) {
        textParts.push(readableText);
      }

    } catch (error) {
      console.warn('PDF文本提取失败:', error);
    }

    return textParts.join('\n').trim();
  }

  /**
   * 从二进制数据提取文本（改进版）
   */
  private extractTextFromBinary(): string {
    const textParts: string[] = [];
    const data = new Uint8Array(this.arrayBuffer);

    try {
      // 尝试多种编码和位置
      const encodings = ['gb18030', 'gbk', 'gb2312', 'utf-8'];
      const startPositions = [0x20, 0x100, 0x200, 0x500, 0x1000]; // 常见的文本起始位置

      for (const startPos of startPositions) {
        if (startPos >= data.length) continue;

        for (const encoding of encodings) {
          try {
            // 尝试不同长度的文本块
            for (const length of [500, 1000, 2000, 5000]) {
              if (startPos + length > data.length) continue;

              const textData = data.slice(startPos, startPos + length);
              const decoder = new TextDecoder(encoding, { fatal: false });
              const text = decoder.decode(textData);
              const cleanText = text.replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ').trim();

              if (cleanText.length > 50 && this.isMeaningfulText(cleanText)) {
                textParts.push(cleanText);
                console.log(`在位置0x${startPos.toString(16)}使用${encoding}编码找到文本: ${cleanText.length}字符`);
                break;
              }
            }
          } catch (decodeError) {
            continue;
          }
        }
      }

    } catch (error) {
      console.warn('二进制文本提取失败:', error);
    }

    return textParts.join('\n').trim();
  }

  /**
   * 判断文本是否有意义
   */
  private isMeaningfulText(text: string): boolean {
    if (text.length < 10) return false;

    // 检查中文字符比例
    const chineseChars = text.match(/[\u4e00-\u9fff]/g);
    const chineseRatio = chineseChars ? chineseChars.length / text.length : 0;
    
    // 检查英文字符比例
    const englishChars = text.match(/[a-zA-Z]/g);
    const englishRatio = englishChars ? englishChars.length / text.length : 0;
    
    // 检查常见学术词汇
    const academicKeywords = ['研究', '分析', '方法', '结果', '结论', 'abstract', 'study', 'analysis', 'method', 'result', 'conclusion'];
    const hasAcademicContent = academicKeywords.some(keyword => text.toLowerCase().includes(keyword));
    
    return (chineseRatio > 0.1 || englishRatio > 0.3) && (hasAcademicContent || text.length > 100);
  }

  /**
   * KDH格式解密
   */
  public decryptKDH(): Uint8Array {
    if (!this.format || this.format.type !== 'KDH') {
      return new Uint8Array(this.arrayBuffer);
    }

    console.log('开始KDH解密...');
    
    if (this.arrayBuffer.byteLength < 254) {
      return new Uint8Array(this.arrayBuffer);
    }
    
    const encryptedData = new Uint8Array(this.arrayBuffer, 254);
    const output = new Uint8Array(encryptedData.length);
    
    for (let i = 0; i < encryptedData.length; i++) {
      output[i] = encryptedData[i] ^ KDH_PASSPHRASE[i % KDH_PASSPHRASE.length];
    }
    
    const eofPos = this.findEOFMarker(output);
    if (eofPos < 0) {
      console.warn('无法找到EOF标记');
      return output;
    }
    
    return output.slice(0, eofPos + 5);
  }

  /**
   * 查找EOF标记
   */
  private findEOFMarker(data: Uint8Array): number {
    const eofMarker = new Uint8Array([0x25, 0x25, 0x45, 0x4F, 0x46]); // %%EOF
    
    for (let i = 0; i <= data.length - eofMarker.length; i++) {
      let match = true;
      for (let j = 0; j < eofMarker.length; j++) {
        if (data[i + j] !== eofMarker[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i;
      }
    }
    
    return -1;
  }

  /**
   * 获取格式信息
   */
  public getFormat(): CAJFormat | null {
    return this.format;
  }

  /**
   * 初始化解析器
   */
  public initialize(): boolean {
    this.format = this.detectFormat();
    if (this.format) {
      console.log(`检测到格式: ${this.format.type}, 页数: ${this.format.pageCount || '未知'}`);
    }
    return this.format !== null;
  }
}
