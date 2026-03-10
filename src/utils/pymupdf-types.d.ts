// 类型声明文件 - 解决模块导入问题
declare module '@bentopdf/pymupdf-wasm' {
  export class PyMuPDF {
    constructor(options?: { assetPath?: string; ghostscriptUrl?: string });
    load(): Promise<void>;
    open(input: Blob | File): Promise<PyMuPDFDocument>;
    create(): Promise<PyMuPDFDocument>;
    convertToPdf(file: Blob | File, options?: { filetype?: string }): Promise<Blob>;
    repairPdf(pdf: Blob | File): Promise<Blob>;
    merge(pdfs: (Blob | File)[]): Promise<Blob>;
    split(pdf: Blob | File, ranges: Array<{ start: number; end: number }>): Promise<Blob[]>;
    extractText(pdf: Blob | File): Promise<string>;
    pdfToImages(pdf: Blob | File, options?: { format?: 'png' | 'jpeg'; dpi?: number; pages?: number[] }): Promise<Uint8Array[]>;
    pdfToHtml(pdf: Blob | File): Promise<string>;
    pdfToJson(pdf: Blob | File): Promise<object[]>;
    pdfToMarkdown(pdf: Blob | File, options?: { pageBreaks?: boolean; includeImages?: boolean; pages?: number[] }): Promise<string>;
    pdfToLlmChunks(pdf: Blob | File): Promise<Array<{ text: string; metadata: { page?: number; heading?: string } }>>;
    textToPdf(text: string, options?: { fontName?: string; fontSize?: number; pageSize?: string }): Promise<Blob>;
    htmlToPdf(html: string, options?: { css?: string; pageSize?: string; margins?: number | { top: number; right: number; bottom: number; left: number } }): Promise<Blob>;
    compressPdf(pdf: Blob | File, options?: any): Promise<any>;
    rasterizePdf(pdf: Blob | File, options?: any): Promise<Blob>;
    deskewPdf(pdf: Blob | File, options?: any): Promise<{ pdf: Blob; result: any }>;
  }

  export interface PyMuPDFDocument {
    pageCount: number;
    pages(): PyMuPDFPage[];
    getPage(index: number): PyMuPDFPage;
    insertPdf(doc: PyMuPDFDocument, options?: any): void;
    close(): void;
    saveAsBlob(): Blob;
  }

  export interface PyMuPDFPage {
    getText(options?: string): string;
    toImage(options?: { dpi?: number }): Promise<Uint8Array>;
    toSvg(): string;
  }
}
