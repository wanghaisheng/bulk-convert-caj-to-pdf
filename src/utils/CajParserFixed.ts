// 基于参考代码的正确CAJ解析器实现
// 参考: E:\workspace\bulk-convert-caj-to-pdf\ref\caj2pdf-bfa257ba640a907a9e2c5668f72907f498e2cb9e

// KDH解密密钥
const KDH_PASSPHRASE = new Uint8Array([0x46, 0x5A, 0x48, 0x4D, 0x45, 0x49]); // "FZHMEI"

// 图像类型映射
const IMAGE_TYPE_MAP: { [key: number]: string } = {
  0: "JBIG",
  1: "JPEG",
  2: "JPEG", // up-side-down
  3: "JBIG2"
};

// CAJ格式接口
interface CAJFormat {
  type: 'CAJ' | 'HN' | 'C8' | 'PDF' | 'KDH' | 'TEB';
  pageOffset: number;
  tocOffset: number;
  tocEndOffset: number;
  pageDataOffset: number;
  pageCount?: number;
}

// 页面信息结构
interface PageInfo {
  pageDataOffset: number;
  sizeOfTextSection: number;
  imagesPerPage: number;
  pageNumber: number;
  unknown1: number;
  nextPageDataOffset: number;
}

// 图像信息结构
interface ImageInfo {
  imageTypeEnum: number;
  offsetToImageData: number;
  sizeOfImageData: number;
  imageData: Uint8Array;
  imageType: string;
}

// TOC条目结构
interface TOCEntry {
  title: string;
  page: number;
  level: number;
}

/**
 * 正确的CAJ解析器实现
 */
export class CajParserFixed {
  private arrayBuffer: ArrayBuffer;
  private dataView: DataView;
  private format: CAJFormat | null = null;

  constructor(arrayBuffer: ArrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.dataView = new DataView(arrayBuffer);
  }

  /**
   * 检测CAJ文件格式（基于参考代码）
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

      // 尝试解码格式字符串
      try {
        const decoder = new TextDecoder('gb18030', { fatal: false });
        const fmt = decoder.decode(first4).replace('\x00', '').trim();
        
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
        // 解码失败，继续其他检测
      }

      return null;
    } catch (error) {
      console.error('格式检测失败:', error);
      return null;
    }
  }

  /**
   * 解析TOC（目录）
   */
  public extractTOC(): TOCEntry[] {
    if (!this.format || this.format.tocOffset === 0) {
      return [];
    }

    const toc: TOCEntry[] = [];
    
    try {
      const tocNum = this.dataView.getInt32(this.format.tocOffset, true);
      console.log('目录条目数量:', tocNum);

      // 验证目录数量合理性
      if (tocNum < 0 || tocNum > 10000) {
        console.warn('目录数量异常，跳过目录解析:', tocNum);
        return toc;
      }

      // 计算最大可用的目录条目数
      const maxEntries = Math.floor((this.arrayBuffer.byteLength - this.format.tocOffset - 4) / 0x134);
      const actualTocNum = Math.min(tocNum, maxEntries);
      
      console.log('实际解析目录条目数:', actualTocNum);
      
      for (let i = 0; i < actualTocNum; i++) {
        try {
          const entryOffset = this.format.tocOffset + 4 + 0x134 * i;
          
          // 确保不会超出文件边界
          if (entryOffset + 256 + 24 + 12 + 12 + 4 > this.arrayBuffer.byteLength) {
            console.warn(`目录条目 ${i} 超出文件边界，停止解析`);
            break;
          }

          // 读取标题（256字节）
          const titleBytes = new Uint8Array(this.arrayBuffer, entryOffset, 256);
          const titleEnd = titleBytes.findIndex(b => b === 0);
          const titleBytesTrimmed = titleBytes.slice(0, titleEnd >= 0 ? titleEnd : 256);
          
          let title = '';
          try {
            const decoder = new TextDecoder('gb18030', { fatal: false });
            title = decoder.decode(titleBytesTrimmed);
          } catch (decodeError) {
            title = new TextDecoder('utf-8', { fatal: false }).decode(titleBytesTrimmed);
          }

          // 读取页码（12字节，从偏移256+24开始）
          const pageBytes = new Uint8Array(this.arrayBuffer, entryOffset + 256 + 24, 12);
          const pageEnd = pageBytes.findIndex(b => b === 0);
          const pageStr = new TextDecoder('ascii').decode(pageBytes.slice(0, pageEnd >= 0 ? pageEnd : 12));
          const page = parseInt(pageStr) || 1;

          // 读取级别（从偏移256+24+12+12开始）
          const levelOffset = entryOffset + 256 + 24 + 12 + 12;
          if (levelOffset + 4 > this.arrayBuffer.byteLength) {
            console.warn(`目录条目 ${i} 级别信息超出边界，使用默认值`);
            toc.push({
              title: title.trim(),
              page,
              level: 1
            });
          } else {
            const level = this.dataView.getInt32(levelOffset, true);
            toc.push({
              title: title.trim(),
              page,
              level
            });
          }

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
   * 提取PDF数据（针对CAJ格式）
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
        return null;
      }

      const pdfEnd = endobjPositions[endobjPositions.length - 1] + 6;
      const pdfLength = pdfEnd - pdfStart;

      if (pdfStart < 0 || pdfLength <= 0 || pdfStart + pdfLength > this.arrayBuffer.byteLength) {
        return null;
      }

      // 提取PDF数据
      const pdfData = new Uint8Array(this.arrayBuffer, pdfStart, pdfLength);
      
      // 添加PDF头部
      const pdfHeader = new TextEncoder().encode('%PDF-1.3\r\n');
      const fullPdfData = new Uint8Array(pdfHeader.length + pdfData.length + 2);
      fullPdfData.set(pdfHeader);
      fullPdfData.set(pdfData, pdfHeader.length);
      fullPdfData.set(new TextEncoder().encode('\r\n'), pdfHeader.length + pdfData.length);

      return fullPdfData;

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
   * 解析HN格式的页面数据
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
      
      // 使用HNParsePage逻辑解析文本
      const text = this.parseHNTextData(pageData);
      
      return { text, images: [] };

    } catch (error) {
      console.error('HN页面数据解析失败:', error);
      return { text: '', images: [] };
    }
  }

  /**
   * 解析HN文本数据（基于HNParsePage.py）
   */
  private parseHNTextData(data: Uint8Array): string {
    const characters: string[] = [];
    let offset = 0;

    while (offset <= data.length - 2) {
      const dispatchCode = data[offset] | (data[offset + 1] << 8);
      offset += 2;

      switch (dispatchCode) {
        case 0x8001: // Text
          if (offset + 4 <= data.length) {
            try {
              const charCode = data[offset + 1] << 8 | data[offset];
              const charBytes = new Uint8Array([data[offset + 1], data[offset]]);
              try {
                const char = new TextDecoder('gbk', { fatal: false }).decode(charBytes);
                characters.push(char);
              } catch (decodeError) {
                // 处理特殊字符
                const specialChars: { [key: number]: string } = {
                  0xA389: "\t",
                  0xA38A: "\n",
                  0xA38D: "\r",
                  0xA3A0: " ",
                };
                characters.push(specialChars[charCode] || `<0x${charCode.toString(16)}>`);
              }
            } catch (error) {
              // 忽略错误
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

    return characters.join('').replace(/\x00/g, '');
  }

  /**
   * 解析页面信息
   */
  private parsePageInfo(offset: number): PageInfo {
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
   * KDH格式解密
   */
  public decryptKDH(): Uint8Array {
    if (!this.format || this.format.type !== 'KDH') {
      return new Uint8Array(this.arrayBuffer);
    }

    console.log('开始KDH解密...');
    
    // 跳过前254字节
    if (this.arrayBuffer.byteLength < 254) {
      return new Uint8Array(this.arrayBuffer);
    }
    
    const encryptedData = new Uint8Array(this.arrayBuffer, 254);
    const output = new Uint8Array(encryptedData.length);
    
    // XOR解密
    for (let i = 0; i < encryptedData.length; i++) {
      output[i] = encryptedData[i] ^ KDH_PASSPHRASE[i % KDH_PASSPHRASE.length];
    }
    
    // 查找EOF标记
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
    return this.format !== null;
  }
}
