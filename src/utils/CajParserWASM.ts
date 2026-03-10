// 基于Python CAJ解析器的完整TypeScript实现
// 系统架构：格式检测 + 解析器 + WASM集成

export interface CajFormat {
  type: 'CAJ' | 'HN' | 'C8' | 'KDH' | 'PDF' | 'TEB';
  version?: string;
  offsets: FormatOffsets;
}

export interface FormatOffsets {
  pageNumberOffset: number;
  tocNumberOffset: number;
  tocEndOffset: number;
  pageDataOffset: number;
}

export interface CajMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  pageCount: number;
  tocCount: number;
}

export interface TocEntry {
  title: string;
  page: number;
  level: number;
}

export interface ExtractedImage {
  xref: number;
  width: number;
  height: number;
  bpc: number;
  colorspace: string;
  size: number;
  data: Uint8Array;
  ext: string;
}

export interface CajParseResult {
  format: CajFormat;
  metadata: CajMetadata;
  toc: TocEntry[];
  text: string;
  images: ExtractedImage[];
  pdfData?: Uint8Array;
}

export interface CajParserOptions {
  pymupdfOptions?: {
    assetPath?: string;
    ghostscriptUrl?: string;
  };
}

// 格式检测器
export class FormatDetector {
  static detect(data: Uint8Array): CajFormat {
    const header = new DataView(data.buffer);
    
    try {
      // C8格式检测
      if (header.getUint8(0) === 0xc8) {
        return {
          type: 'C8',
          offsets: {
            pageNumberOffset: 0x08,
            tocNumberOffset: 0,
            tocEndOffset: 0x50,
            pageDataOffset: 0x50 + 20 * this.getC8PageCount(data)
          }
        };
      }
      
      // HN格式检测
      if (header.getUint16(0) === 0x484E) { // "HN"
        const nextBytes = new Uint8Array(data.buffer, 2, 2);
        if (nextBytes[0] === 0xc8 && nextBytes[1] === 0x00) {
          return {
            type: 'HN',
            offsets: {
              pageNumberOffset: 0x90,
              tocNumberOffset: 0,
              tocEndOffset: 0xD8,
              pageDataOffset: 0xD8 + 20 * this.getHNPageCount(data)
            }
          };
        }
        
        return {
          type: 'HN',
          offsets: {
            pageNumberOffset: 0x90,
            tocNumberOffset: 0x158,
            tocEndOffset: 0x1D8,
            pageDataOffset: 0x1D8 + 20 * this.getHNPageCount(data)
          }
        };
      }
      
      // CAJ格式检测
      const headerStr = new TextDecoder('gb18030', { fatal: false }).decode(data.slice(0, 4)).replace('\x00', '');
      if (headerStr === 'CAJ') {
        return {
          type: 'CAJ',
          offsets: {
            pageNumberOffset: 0x10,
            tocNumberOffset: 0x110,
            tocEndOffset: 0x248,
            pageDataOffset: 0x248 + 20 * this.getCAJPageCount(data)
          }
        };
      }
      
      // KDH格式检测
      if (headerStr === 'KDH ') {
        return {
          type: 'KDH',
          offsets: {
            pageNumberOffset: 0,
            tocNumberOffset: 0,
            tocEndOffset: 0,
            pageDataOffset: 0
          }
        };
      }
      
      // TEB格式检测
      if (headerStr === 'TEB') {
        return {
          type: 'TEB',
          offsets: {
            pageNumberOffset: 0,
            tocNumberOffset: 0,
            tocEndOffset: 0,
            pageDataOffset: 0
          }
        };
      }
      
      // PDF格式检测
      if (headerStr.startsWith('%PDF')) {
        return {
          type: 'PDF',
          offsets: {
            pageNumberOffset: 0,
            tocNumberOffset: 0,
            tocEndOffset: 0,
            pageDataOffset: 0
          }
        };
      }
      
      throw new Error('Unknown CAJ format');
    } catch (error) {
      console.error('Format detection failed:', error);
      throw new Error('Failed to detect CAJ format');
    }
  }
  
  private static getC8PageCount(data: Uint8Array): number {
    const view = new DataView(data.buffer);
    return view.getInt32(0x08, true);
  }
  
  private static getHNPageCount(data: Uint8Array): number {
    const view = new DataView(data.buffer);
    return view.getInt32(0x90, true);
  }
  
  private static getCAJPageCount(data: Uint8Array): number {
    const view = new DataView(data.buffer);
    return view.getInt32(0x10, true);
  }
}

// CAJ格式解析器
export class CajFormatParser {
  constructor(private data: Uint8Array, private format: CajFormat) {}
  
  async parse(): Promise<CajParseResult> {
    const metadata = this.extractMetadata();
    const toc = this.extractToc();
    const pdfData = this.extractPdfData();
    
    return {
      format: this.format,
      metadata,
      toc,
      text: '', // 将由WASM集成层处理
      images: [], // 将由WASM集成层处理
      pdfData
    };
  }
  
  private extractMetadata(): CajMetadata {
    const view = new DataView(this.data.buffer);
    const pageCount = view.getInt32(this.format.offsets.pageNumberOffset, true);
    const tocCount = this.format.offsets.tocNumberOffset > 0 ? 
      view.getInt32(this.format.offsets.tocNumberOffset, true) : 0;
    
    return {
      pageCount,
      tocCount
    };
  }
  
  private extractToc(): TocEntry[] {
    if (this.format.offsets.tocNumberOffset === 0) return [];
    
    const view = new DataView(this.data.buffer);
    const tocCount = view.getInt32(this.format.offsets.tocNumberOffset, true);
    const toc: TocEntry[] = [];
    
    for (let i = 0; i < tocCount; i++) {
      const tocOffset = this.format.offsets.tocNumberOffset + 4 + i * 0x134;
      if (tocOffset + 0x134 > this.data.length) break;
      
      try {
        // 读取标题 (0x120字节，GB18030编码)
        const titleBytes = new Uint8Array(this.data.buffer, tocOffset, 0x120);
        const titleEnd = titleBytes.findIndex(b => b === 0);
        const titleBytesTrimmed = titleBytes.slice(0, titleEnd >= 0 ? titleEnd : 0x120);
        const title = new TextDecoder('gb18030', { fatal: false }).decode(titleBytesTrimmed);
        
        // 读取页码和级别
        const page = view.getInt32(tocOffset + 0x12C, true);
        const level = view.getUint8(tocOffset + 0x130);
        
        if (title.trim()) {
          toc.push({ title: title.trim(), page, level });
        }
      } catch (error) {
        console.warn('Failed to parse TOC entry:', error);
      }
    }
    
    return toc;
  }
  
  private extractPdfData(): Uint8Array {
    const view = new DataView(this.data.buffer);
    
    try {
      // 获取PDF起始指针
      const pdfStartPointer = view.getInt32(this.format.offsets.pageNumberOffset + 4, true);
      const pdfStart = view.getInt32(pdfStartPointer, true);
      
      // 搜索"endobj"标记
      const pdfEnd = this.findLastEndobj(pdfStart);
      if (pdfEnd === -1) {
        throw new Error('Could not find PDF end marker');
      }
      
      const pdfLength = pdfEnd - pdfStart;
      const pdfContent = this.data.slice(pdfStart, pdfStart + pdfLength);
      
      // 添加PDF头部和尾部
      const pdfHeader = new TextEncoder().encode('%PDF-1.3\r\n');
      const pdfFooter = new TextEncoder().encode('\r\n%%EOF\r\n');
      
      return this.concatUint8Arrays(pdfHeader, pdfContent, pdfFooter);
    } catch (error) {
      console.error('Failed to extract PDF data:', error);
      throw new Error('PDF data extraction failed');
    }
  }
  
  private findLastEndobj(startOffset: number): number {
    const endobjMarker = new TextEncoder().encode('endobj');
    
    for (let i = this.data.length - endobjMarker.length; i >= startOffset; i--) {
      let found = true;
      for (let j = 0; j < endobjMarker.length; j++) {
        if (this.data[i + j] !== endobjMarker[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        return i + endobjMarker.length;
      }
    }
    
    return -1;
  }
  
  private concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return result;
  }
}

// HN格式解析器
export class HnFormatParser {
  constructor(private data: Uint8Array, private format: CajFormat) {}
  
  async parse(): Promise<CajParseResult> {
    const metadata = this.extractMetadata();
    const toc = this.extractToc();
    
    return {
      format: this.format,
      metadata,
      toc,
      text: '', // 将由WASM集成层处理
      images: [], // 将由WASM集成层处理
      pdfData: undefined // HN格式需要特殊处理
    };
  }
  
  private extractMetadata(): CajMetadata {
    const view = new DataView(this.data.buffer);
    const pageCount = view.getInt32(this.format.offsets.pageNumberOffset, true);
    const tocCount = this.format.offsets.tocNumberOffset > 0 ? 
      view.getInt32(this.format.offsets.tocNumberOffset, true) : 0;
    
    return {
      pageCount,
      tocCount
    };
  }
  
  private extractToc(): TocEntry[] {
    if (this.format.offsets.tocNumberOffset === 0) return [];
    
    const view = new DataView(this.data.buffer);
    const tocCount = view.getInt32(this.format.offsets.tocNumberOffset, true);
    const toc: TocEntry[] = [];
    
    for (let i = 0; i < tocCount; i++) {
      const tocOffset = this.format.offsets.tocNumberOffset + 4 + i * 0x134;
      if (tocOffset + 0x134 > this.data.length) break;
      
      try {
        // 读取标题
        const titleBytes = new Uint8Array(this.data.buffer, tocOffset, 0x120);
        const titleEnd = titleBytes.findIndex(b => b === 0);
        const titleBytesTrimmed = titleBytes.slice(0, titleEnd >= 0 ? titleEnd : 0x120);
        const title = new TextDecoder('gb18030', { fatal: false }).decode(titleBytesTrimmed);
        
        // 读取页码和级别
        const page = view.getInt32(tocOffset + 0x12C, true);
        const level = view.getUint8(tocOffset + 0x130);
        
        if (title.trim()) {
          toc.push({ title: title.trim(), page, level });
        }
      } catch (error) {
        console.warn('Failed to parse HN TOC entry:', error);
      }
    }
    
    return toc;
  }
}

// KDH格式解析器
export class KdhFormatParser {
  private readonly KDH_PASSPHRASE = "FZHMEI";
  
  constructor(private data: Uint8Array, private format: CajFormat) {}
  
  async parse(): Promise<CajParseResult> {
    const decryptedData = this.decryptKdh();
    const metadata = this.extractMetadata(decryptedData);
    
    return {
      format: this.format,
      metadata,
      toc: [], // KDH格式通常没有TOC
      text: '', // 将由WASM集成层处理
      images: [], // 将由WASM集成层处理
      pdfData: decryptedData
    };
  }
  
  private decryptKdh(): Uint8Array {
    // 跳过前254字节
    const encryptedData = this.data.slice(254);
    const passphraseBytes = new TextEncoder().encode(this.KDH_PASSPHRASE);
    
    const decrypted = new Uint8Array(encryptedData.length);
    let keyIndex = 0;
    
    for (let i = 0; i < encryptedData.length; i++) {
      decrypted[i] = encryptedData[i] ^ passphraseBytes[keyIndex];
      keyIndex = (keyIndex + 1) % passphraseBytes.length;
    }
    
    // 查找%%EOF标记并截断
    const eofMarker = new TextEncoder().encode('%%EOF');
    let eofIndex = -1;
    
    for (let i = decrypted.length - eofMarker.length; i >= 0; i--) {
      let found = true;
      for (let j = 0; j < eofMarker.length; j++) {
        if (decrypted[i + j] !== eofMarker[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        eofIndex = i + eofMarker.length;
        break;
      }
    }
    
    if (eofIndex === -1) {
      throw new Error('Could not find %%EOF marker in KDH file');
    }
    
    return decrypted.slice(0, eofIndex);
  }
  
  private extractMetadata(data: Uint8Array): CajMetadata {
    // KDH格式通常是PDF，尝试解析PDF头部获取页数
    let pageCount = 1; // 默认值
    
    try {
      const pdfText = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, 1000));
      const countMatch = pdfText.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        pageCount = parseInt(countMatch[1], 10);
      }
    } catch (error) {
      console.warn('Failed to extract KDH metadata:', error);
    }
    
    return {
      pageCount,
      tocCount: 0
    };
  }
}

// PDF格式解析器
export class PdfFormatParser {
  constructor(private data: Uint8Array, private format: CajFormat) {}
  
  async parse(): Promise<CajParseResult> {
    const metadata = this.extractMetadata();
    
    return {
      format: this.format,
      metadata,
      toc: [], // 将由WASM集成层处理
      text: '', // 将由WASM集成层处理
      images: [], // 将由WASM集成层处理
      pdfData: this.data
    };
  }
  
  private extractMetadata(): CajMetadata {
    let pageCount = 1;
    
    try {
      const pdfText = new TextDecoder('ascii', { fatal: false }).decode(this.data.slice(0, 1000));
      const countMatch = pdfText.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        pageCount = parseInt(countMatch[1], 10);
      }
    } catch (error) {
      console.warn('Failed to extract PDF metadata:', error);
    }
    
    return {
      pageCount,
      tocCount: 0
    };
  }
}

// TEB格式解析器
export class TebFormatParser {
  constructor(private data: Uint8Array, private format: CajFormat) {}
  
  async parse(): Promise<CajParseResult> {
    const metadata = { pageCount: 1, tocCount: 0 };
    
    return {
      format: this.format,
      metadata,
      toc: [],
      text: '', // TEB格式需要特殊处理
      images: [],
      pdfData: undefined
    };
  }
}

// 主要的CAJ解析器类
export class CajParserWASM {
  constructor(private options: CajParserOptions = {}) {}
  
  async parse(file: File | Blob): Promise<CajParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // 格式检测
    const format = FormatDetector.detect(data);
    console.log('检测到CAJ格式:', format.type);
    
    // 根据格式选择解析器
    let parser;
    switch (format.type) {
      case 'CAJ':
        parser = new CajFormatParser(data, format);
        break;
      case 'HN':
      case 'C8':
        parser = new HnFormatParser(data, format);
        break;
      case 'KDH':
        parser = new KdhFormatParser(data, format);
        break;
      case 'PDF':
        parser = new PdfFormatParser(data, format);
        break;
      case 'TEB':
        parser = new TebFormatParser(data, format);
        break;
      default:
        throw new Error(`Unsupported format: ${format.type}`);
    }
    
    return await parser.parse();
  }
  
  async convertToPdf(file: File | Blob): Promise<Blob> {
    const result = await this.parse(file);
    
    if (result.pdfData) {
      // 如果有PDF数据，直接返回
      return new Blob([result.pdfData], { type: 'application/pdf' });
    } else {
      // 否则需要生成PDF（将在WASM集成层实现）
      throw new Error('PDF generation not implemented yet');
    }
  }
  
  async extractText(file: File | Blob): Promise<string> {
    const result = await this.parse(file);
    return result.text;
  }
  
  async extractImages(file: File | Blob): Promise<ExtractedImage[]> {
    const result = await this.parse(file);
    return result.images;
  }
  
  async extractToc(file: File | Blob): Promise<TocEntry[]> {
    const result = await this.parse(file);
    return result.toc;
  }
}
