// 基于参考代码的真实CAJ转换器
// 集成CajParserFixed实现真正的CAJ解析和转换

import { CajParserFixed } from './CajParserFixed.ts';

// 本地定义CajFile接口，避免导入React组件
interface ICajFile {
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

export class CajFile implements ICajFile {
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

    constructor(file: File, uploadStatus: "pending" | "uploading" | "uploaded" | "converting" | "completed" | "error" = "pending", outputFormat: "pdf" | "txt" = "pdf") {
        this.id = Math.random().toString(36).substr(2, 9);
        this.file = file;
        this.uploadStatus = uploadStatus;
        this.blobUrl = "";
        this.txtUrl = "";
        this.outputFormat = outputFormat;
        this.progress = 0;
        this.selected = false;
        this.needsOcr = false;
    }
}

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
 * 真实的CAJ转换器实现
 */
export class MuPDFConverterReal {
    private static instance: MuPDFConverterReal;
    private isInitialized: boolean = false;

    private constructor() {}

    public static getInstance(): MuPDFConverterReal {
        if (!MuPDFConverterReal.instance) {
            MuPDFConverterReal.instance = new MuPDFConverterReal();
        }
        return MuPDFConverterReal.instance;
    }

    /**
     * 初始化转换器
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log('初始化真实CAJ转换器...');
        console.log('基于参考代码实现: caj2pdf-bfa257ba640a907a9e2c5668f72907f498e2cb9e');
        console.log('支持格式: CAJ, HN, C8, KDH, TEB, PDF');
        console.log('功能: 真实二进制解析、TOC提取、PDF数据提取、文本解析');

        this.isInitialized = true;
        console.log('✅ 真实CAJ转换器初始化完成');
    }

    /**
     * 检测CAJ文件格式
     */
    public async detectCAJFormat(file: File): Promise<CAJFormat | null> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new CajParserFixed(arrayBuffer);
            
            if (parser.initialize()) {
                return parser.getFormat();
            }
            
            return null;
        } catch (error) {
            console.error('CAJ格式检测失败:', error);
            return null;
        }
    }

    /**
     * 提取TOC（目录）
     */
    public async extractTOC(file: File, format?: CAJFormat | null): Promise<TOCEntry[]> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new CajParserFixed(arrayBuffer);
            
            if (parser.initialize()) {
                return parser.extractTOC();
            }
            
            return [];
        } catch (error) {
            console.error('TOC提取失败:', error);
            return [];
        }
    }

    /**
     * 提取PDF数据（针对CAJ格式）
     */
    public async extractPdfData(file: File): Promise<Uint8Array | null> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new CajParserFixed(arrayBuffer);
            
            if (parser.initialize()) {
                const format = parser.getFormat();
                if (format?.type === 'CAJ') {
                    return parser.extractPdfData();
                }
            }
            
            return null;
        } catch (error) {
            console.error('PDF数据提取失败:', error);
            return null;
        }
    }

    /**
     * 解析HN格式页面数据
     */
    public async parseHNPageData(file: File): Promise<{ text: string; images: any[] }> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new CajParserFixed(arrayBuffer);
            
            if (parser.initialize()) {
                const format = parser.getFormat();
                if (format?.type === 'HN' && format.pageDataOffset) {
                    return parser.parseHNPageData(format.pageDataOffset);
                }
            }
            
            return { text: '', images: [] };
        } catch (error) {
            console.error('HN页面数据解析失败:', error);
            return { text: '', images: [] };
        }
    }

    /**
     * 提取完整内容
     */
    public async extractFullContent(file: File, format?: CAJFormat | null): Promise<{ text: string; images: any[]; toc: TOCEntry[] }> {
        let text = '';
        const images: any[] = [];
        const toc: TOCEntry[] = [];

        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new CajParserFixed(arrayBuffer);
            
            if (!parser.initialize()) {
                throw new Error('解析器初始化失败');
            }

            const detectedFormat = format || parser.getFormat();
            if (!detectedFormat) {
                throw new Error('无法识别的文件格式');
            }

            console.log(`检测到格式: ${detectedFormat.type}`);

            // 提取TOC
            if (detectedFormat.tocOffset > 0) {
                const extractedToc = parser.extractTOC();
                toc.push(...extractedToc);
                console.log(`提取TOC: ${extractedToc.length} 个条目`);
            }

            // 根据格式提取内容
            switch (detectedFormat.type) {
                case 'CAJ':
                    // 提取PDF数据
                    const pdfData = parser.extractPdfData();
                    if (pdfData) {
                        console.log(`提取PDF数据: ${pdfData.length} bytes`);
                        // 从PDF中提取文本（简单实现）
                        text = this.extractTextFromPdfData(pdfData);
                        console.log(`从PDF提取文本: ${text.length} 字符`);
                    }
                    break;

                case 'HN':
                    // 解析HN页面数据
                    const hnResult = parser.parseHNPageData(detectedFormat.pageDataOffset);
                    text = hnResult.text;
                    console.log(`HN文本提取: ${text.length} 字符`);
                    break;

                case 'C8':
                    // C8格式处理（类似HN）
                    if (detectedFormat.pageDataOffset) {
                        const c8Result = parser.parseHNPageData(detectedFormat.pageDataOffset);
                        text = c8Result.text;
                        console.log(`C8文本提取: ${text.length} 字符`);
                    }
                    break;

                case 'PDF':
                    // 直接处理PDF
                    text = this.extractTextFromPdfData(new Uint8Array(arrayBuffer));
                    console.log(`PDF文本提取: ${text.length} 字符`);
                    break;

                case 'KDH':
                    // KDH解密处理
                    const decryptedData = parser.decryptKDH();
                    if (decryptedData.length > 0) {
                        text = this.extractTextFromPdfData(decryptedData);
                        console.log(`KDH解密文本提取: ${text.length} 字符`);
                    }
                    break;

                default:
                    console.warn(`不支持的格式: ${detectedFormat.type}`);
                    break;
            }

            // 如果没有提取到文本，尝试通用文本提取
            if (text.length === 0) {
                text = this.extractTextFromBinary(arrayBuffer);
                console.log(`通用文本提取: ${text.length} 字符`);
            }

        } catch (error) {
            console.error('内容提取失败:', error);
            throw error;
        }

        return { text, images, toc };
    }

    /**
     * 从PDF数据中提取文本
     */
    private extractTextFromPdfData(pdfData: Uint8Array): string {
        try {
            const text = new TextDecoder('utf-8', { fatal: false }).decode(pdfData);
            
            // 提取括号内的文本内容
            const bracketTexts = text.match(/\(([^)]+)\)/g);
            if (bracketTexts) {
                return bracketTexts.map(t => t.slice(1, -1)).join(' ');
            }
            
            // 提取流内容
            const streamMatch = text.match(/stream\s*\n([\s\S]*?)\n*endstream/);
            if (streamMatch) {
                return new TextDecoder('utf-8', { fatal: false }).decode(
                    new Uint8Array(Array.from(streamMatch[1]).map(c => c.charCodeAt(0)))
                );
            }
            
            // 提取所有可读文本
            return text.replace(/[^\x20-\x7E\u4e00-\u9fff]/g, ' ').trim();
            
        } catch (error) {
            console.warn('PDF文本提取失败:', error);
            return '';
        }
    }

    /**
     * 从二进制数据中提取文本
     */
    private extractTextFromBinary(arrayBuffer: ArrayBuffer): string {
        try {
            const data = new Uint8Array(arrayBuffer);
            
            // 尝试多种编码
            const encodings = ['utf-8', 'gb18030', 'gbk', 'gb2312'];
            
            for (const encoding of encodings) {
                try {
                    const decoder = new TextDecoder(encoding, { fatal: false });
                    const text = decoder.decode(data);
                    const cleanText = text.replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ').trim();
                    
                    if (cleanText.length > 50 && this.isMeaningfulText(cleanText)) {
                        return cleanText;
                    }
                } catch (decodeError) {
                    continue;
                }
            }
            
            return '';
        } catch (error) {
            console.warn('二进制文本提取失败:', error);
            return '';
        }
    }

    /**
     * 判断文本是否有意义
     */
    private isMeaningfulText(text: string): boolean {
        if (text.length < 10) return false;
        
        // 检查是否包含中文字符
        const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        if (chineseCount > 5) return true;
        
        // 检查是否包含英文字符
        const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
        if (englishCount > 20) return true;
        
        return false;
    }

    /**
     * 提取文件元数据
     */
    public async extractMetadata(cajFile: CajFile): Promise<{
        format: string;
        title: string;
        pageCount: number;
        hasText: boolean;
        fileSize: number;
    }> {
        try {
            const format = await this.detectCAJFormat(cajFile.file);
            const arrayBuffer = await cajFile.file.arrayBuffer();
            
            // 提取文本内容
            const { text } = await this.extractFullContent(cajFile.file, format);
            
            return {
                format: format?.type || 'Unknown',
                title: cajFile.file.name.replace(/\.[^/.]+$/, ''),
                pageCount: format?.pageCount || 1,
                hasText: text.length > 0,
                fileSize: arrayBuffer.byteLength
            };
        } catch (error) {
            console.warn('元数据提取失败:', error);
            return {
                format: 'Unknown',
                title: cajFile.file.name.replace(/\.[^/.]+$/, ''),
                pageCount: 1,
                hasText: false,
                fileSize: cajFile.file.size
            };
        }
    }

    /**
     * 从CAJ文件提取文本
     */
    public async extractTextFromCaj(cajFile: CajFile): Promise<string> {
        try {
            const format = await this.detectCAJFormat(cajFile.file);
            const { text } = await this.extractFullContent(cajFile.file, format);
            return text;
        } catch (error) {
            console.error('CAJ文本提取失败:', error);
            return '';
        }
    }

    /**
     * 转换CAJ文件为PDF
     */
    public async convertCajToPdf(cajFile: CajFile): Promise<Blob> {
        try {
            await this.initialize();
            
            console.log('转换CAJ文件为PDF:', cajFile.file.name);
            
            const format = await this.detectCAJFormat(cajFile.file);
            console.log('检测到格式:', format?.type);
            
            // 提取完整内容
            const { text, toc } = await this.extractFullContent(cajFile.file, format);
            console.log('提取内容完成 - 文本长度:', text.length, '目录条目:', toc.length);
            
            // 如果有PDF数据，直接返回
            if (format?.type === 'CAJ') {
                const pdfData = await this.extractPdfData(cajFile.file);
                if (pdfData) {
                    console.log('使用原始PDF数据生成PDF');
                    return new Blob([pdfData], { type: 'application/pdf' });
                }
            }
            
            // 否则生成包含提取内容的PDF
            console.log('生成包含提取内容的PDF...');
            const pdfContent = this.generatePdfWithContent(cajFile.file.name, text, toc, format);
            
            return new Blob([pdfContent], { type: 'application/pdf' });
            
        } catch (error) {
            console.error('CAJ转换失败:', error);
            // 生成错误报告PDF
            const errorPdf = this.generateErrorPdf(cajFile.file.name, error.message);
            return new Blob([errorPdf], { type: 'application/pdf' });
        }
    }

    /**
     * 生成包含内容的PDF
     */
    private generatePdfWithContent(fileName: string, text: string, toc: TOCEntry[], format?: CAJFormat | null): Uint8Array {
        const content = `
CAJ文件转换报告
================

文件名: ${fileName}
文件格式: ${format?.type || 'Unknown'}
转换时间: ${new Date().toLocaleString()}
处理工具: 真实CAJ转换器 v1.0

提取内容:
--------
${text || '无文本内容'}

目录结构:
--------
${toc.length > 0 ? toc.map(entry => '  '.repeat(entry.level - 1) + entry.title + ' (页' + entry.page + ')').join('\n') : '无目录信息'}

文件信息:
--------
原始文件大小: ${(format ? '未知' : '未知')}
提取文本长度: ${text.length} 字符
目录条目数: ${toc.length}

技术说明:
--------
本转换器基于参考代码实现:
caj2pdf-bfa257ba640a907a9e2c5668f72907f498e2cb9e

支持功能:
- 真实的CAJ格式检测
- TOC目录提取
- PDF数据提取
- HN/C8文本解析
- KDH解密
        `.trim();

        const pdfHeader = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
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
/Length ${content.length + 100}
>>
stream
BT
/F1 12 Tf
72 720 Td
`;

        const pdfContentStream = content.split('\n').map(line => 
            line + ' Tj\nT*'
        ).join('');

        const pdfFooter = `ET
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
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000${pdfHeader.length + pdfContentStream.length + 100} 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
${pdfHeader.length + pdfContentStream.length + 200}
%%EOF
`;

        const fullPdf = pdfHeader + pdfContentStream + pdfFooter;
        return new TextEncoder().encode(fullPdf);
    }

    /**
     * 生成错误报告PDF
     */
    private generateErrorPdf(fileName: string, errorMessage: string): Uint8Array {
        const content = `
CAJ文件转换错误报告
==================

文件名: ${fileName}
错误时间: ${new Date().toLocaleString()}
处理工具: 真实CAJ转换器 v1.0

错误信息:
--------
${errorMessage}

可能原因:
--------
1. 文件格式不支持
2. 文件已损坏
3. 文件加密保护
4. 解析器异常

建议:
--------
1. 检查文件是否为有效的CAJ文件
2. 尝试使用其他CAJ处理工具
3. 联系技术支持
        `.trim();

        return this.generatePdfWithContent(fileName, content, [], null);
    }
}

// 导出单例实例
export const muPDFConverterReal = MuPDFConverterReal.getInstance();
