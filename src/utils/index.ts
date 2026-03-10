// 统一导出文件 - 新的CAJ转换系统
// 提供完整的TypeScript CAJ解析和转换功能

// 核心解析器
export { CajParserWASM } from './CajParserWASM';
export type { 
  CajFormat, 
  FormatOffsets, 
  CajMetadata, 
  TocEntry, 
  ExtractedImage, 
  CajParseResult,
  CajParserOptions 
} from './CajParserWASM';

// WASM集成层
export { WasmIntegration } from './WasmIntegrationSimple';
export type { WasmIntegrationOptions } from './WasmIntegrationSimple';

// 统一转换器
export { UnifiedCajConverter } from './UnifiedCajConverterV2';
export type { 
  CajConverterOptions, 
  CajConversionResult 
} from './UnifiedCajConverterV2';

// 兼容性转换器
export { MuPDFConverterV2 as MuPDFConverter } from './MuPDFConverterV2';

// 便捷的工厂函数
export function createCajConverter(options?: CajConverterOptions) {
  return new UnifiedCajConverter(options);
}

export function createMuPDFConverter() {
  return new MuPDFConverterV2();
}

// 版本信息
export const VERSION = '4.0.0';
export const BUILD_DATE = new Date().toISOString();

// 功能特性
export const FEATURES = {
  formatDetection: true,
  textExtraction: true,
  imageExtraction: true,
  tocExtraction: true,
  pdfRepair: true,
  batchProcessing: true,
  wasmSupport: true,
  fallbackMode: true,
  errorHandling: true
};

// 支持的格式
export const SUPPORTED_FORMATS = {
  CAJ: { name: 'CAJ', description: '标准CAJ格式' },
  HN: { name: 'HN', description: '高级CAJ格式' },
  C8: { name: 'C8', description: '压缩CAJ格式' },
  KDH: { name: 'KDH', description: '加密CAJ格式' },
  PDF: { name: 'PDF', description: '内嵌PDF格式' },
  TEB: { name: 'TEB', description: '文本CAJ格式' }
};

// 默认配置
export const DEFAULT_OPTIONS: CajConverterOptions = {
  pymupdfOptions: {
    assetPath: '/assets/pymupdf/',
    ghostscriptUrl: 'https://cdn.jsdelivr.net/npm/@bentopdf/gs-wasm@0.1.0/assets/'
  },
  enableTextExtraction: true,
  enableImageExtraction: true,
  enableTocExtraction: true,
  enablePdfRepair: true
};

// 工具函数
export function detectFormat(file: File | Blob): Promise<string> {
  const converter = createCajConverter();
  return converter.detectFormat(file);
}

export async function quickConvert(file: File | Blob): Promise<Blob> {
  const converter = createCajConverter();
  await converter.initialize();
  const result = await converter.convertToPdf(file);
  converter.cleanup();
  return result.pdfBlob;
}

export async function extractText(file: File | Blob): Promise<string> {
  const converter = createCajConverter();
  await converter.initialize();
  const text = await converter.extractText(file);
  converter.cleanup();
  return text;
}

export async function extractImages(file: File | Blob): Promise<ExtractedImage[]> {
  const converter = createCajConverter();
  await converter.initialize();
  const images = await converter.extractImages(file);
  converter.cleanup();
  return images;
}

export async function extractToc(file: File | Blob): Promise<TocEntry[]> {
  const converter = createCajConverter();
  await converter.initialize();
  const toc = await converter.extractToc(file);
  converter.cleanup();
  return toc;
}

export async function getMetadata(file: File | Blob): Promise<{
  format: string;
  pageCount: number;
  tocCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}> {
  const converter = createCajConverter();
  await converter.initialize();
  const metadata = await converter.getMetadata(file);
  converter.cleanup();
  return metadata;
}

// 批量处理函数
export async function batchConvert(files: File[], options?: CajConverterOptions): Promise<CajConversionResult[]> {
  const converter = createCajConverter(options);
  await converter.initialize();
  const results = await converter.batchConvert(files);
  converter.cleanup();
  return results;
}

// 错误类型
export class CajConversionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CajConversionError';
  }
}

export class FormatDetectionError extends CajConversionError {
  constructor(message: string, details?: any) {
    super(message, 'FORMAT_DETECTION_ERROR', details);
  }
}

export class TextExtractionError extends CajConversionError {
  constructor(message: string, details?: any) {
    super(message, 'TEXT_EXTRACTION_ERROR', details);
  }
}

export class ImageExtractionError extends CajConversionError {
  constructor(message: string, details?: any) {
    super(message, 'IMAGE_EXTRACTION_ERROR', details);
  }
}

export class PdfGenerationError extends CajConversionError {
  constructor(message: string, details?: any) {
    super(message, 'PDF_GENERATION_ERROR', details);
  }
}

// 验证函数
export function validateFile(file: File | Blob): boolean {
  return file.size > 0;
}

export function validateFormat(format: string): boolean {
  return Object.keys(SUPPORTED_FORMATS).includes(format);
}

// 调试工具
export function createDebugLogger() {
  return {
    log: (message: string, data?: any) => {
      console.log(`[CAJ-Converter] ${message}`, data);
    },
    warn: (message: string, data?: any) => {
      console.warn(`[CAJ-Converter] ${message}`, data);
    },
    error: (message: string, data?: any) => {
      console.error(`[CAJ-Converter] ${message}`, data);
    }
  };
}

// 性能监控
export function createPerformanceMonitor() {
  const timers = new Map<string, number>();
  
  return {
    start: (name: string) => {
      timers.set(name, performance.now());
    },
    end: (name: string) => {
      const start = timers.get(name);
      if (start) {
        const duration = performance.now() - start;
        console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
        return duration;
      }
      return 0;
    },
    clear: () => {
      timers.clear();
    }
  };
}

// 主入口类
export class CajConverter {
  private converter: UnifiedCajConverter;
  
  constructor(options?: CajConverterOptions) {
    this.converter = createCajConverter(options);
  }
  
  async initialize(): Promise<void> {
    await this.converter.initialize();
  }
  
  async convertToPdf(file: File | Blob): Promise<CajConversionResult> {
    return await this.converter.convertToPdf(file);
  }
  
  async extractText(file: File | Blob): Promise<string> {
    return await this.converter.extractText(file);
  }
  
  async extractImages(file: File | Blob): Promise<ExtractedImage[]> {
    return await this.converter.extractImages(file);
  }
  
  async extractToc(file: File | Blob): Promise<TocEntry[]> {
    return await this.converter.extractToc(file);
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
    return await this.converter.getMetadata(file);
  }
  
  async detectFormat(file: File | Blob): Promise<string> {
    return await this.converter.detectFormat(file);
  }
  
  async batchConvert(files: File[]): Promise<CajConversionResult[]> {
    return await this.converter.batchConvert(files);
  }
  
  getWasmStatus(): { available: boolean; initialized: boolean } {
    return this.converter.getWasmStatus();
  }
  
  cleanup(): void {
    this.converter.cleanup();
  }
}

// 默认导出
export default CajConverter;
