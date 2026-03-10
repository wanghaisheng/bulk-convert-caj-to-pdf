import * as pdfjsLib from 'pdfjs-dist';
import { CajFile } from '../Provider';
import { muPDFConverter } from './MuPDFConverter';

// 配置PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '//unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs';

export class CajConverter {
  private static instance: CajConverter;
  
  private constructor() {}
  
  public static getInstance(): CajConverter {
    if (!CajConverter.instance) {
      CajConverter.instance = new CajConverter();
    }
    return CajConverter.instance;
  }

  /**
   * 将CAJ文件转换为PDF
   * @param cajFile CAJ文件对象
   * @returns Promise<Blob> PDF文件内容
   */
  public async convertCajToPdf(cajFile: CajFile): Promise<Blob> {
    try {
      console.log('开始转换CAJ到PDF:', cajFile.file.name);
      
      // 检查文件扩展名
      const fileName = cajFile.file.name.toLowerCase();
      
      if (fileName.endsWith('.caj')) {
        // 使用MuPDF转换CAJ文件
        return await muPDFConverter.convertCajToPdf(cajFile);
      } else if (fileName.endsWith('.pdf')) {
        // 如果已经是PDF文件，直接返回
        return cajFile.file;
      } else {
        // 其他格式，生成模拟PDF
        const mockPdfContent = this.generateMockPdfContent(cajFile.file.name);
        return new Blob([mockPdfContent], { type: 'application/pdf' });
      }
      
    } catch (error) {
      console.error('CAJ转PDF失败:', error);
      // 降级到模拟内容
      const mockPdfContent = this.generateMockPdfContent(cajFile.file.name);
      return new Blob([mockPdfContent], { type: 'application/pdf' });
    }
  }

  /**
   * 生成模拟PDF内容
   */
  private generateMockPdfContent(fileName: string): string {
    const content = `
文件: ${fileName}
转换时间: ${new Date().toLocaleString()}
这是CAJ文件的PDF转换结果。

注意：这是演示版本，实际应用中需要：
1. 使用专门的CAJ解析库
2. 或通过浏览器打开CAJ文件后打印为PDF
3. 或使用后端CAJ转换服务

内容区域：
这里是CAJ文件的文档内容，应该包含：
- 标题
- 作者信息
- 摘要
- 正文内容
- 参考文献
    `.trim();
    
    return content;
  }

  /**
   * 将PDF转换为TXT文本
   * @param pdfBlob PDF文件内容
   * @param cajFile CAJ文件对象（用于文件名）
   * @returns Promise<string> 提取的文本内容
   */
  public async convertPdfToText(pdfBlob: Blob, cajFile: CajFile): Promise<string> {
    try {
      console.log('开始提取PDF文本:', cajFile.file.name);
      
      // 如果原文件是CAJ，直接从CAJ提取文本
      if (cajFile.file.name.toLowerCase().endsWith('.caj')) {
        try {
          return await muPDFConverter.extractTextFromCaj(cajFile);
        } catch (error) {
          console.warn('直接从CAJ提取文本失败，尝试从PDF提取:', error);
        }
      }
      
      // 将Blob转换为ArrayBuffer
      const arrayBuffer = await pdfBlob.arrayBuffer();
      
      // 使用PDF.js加载PDF文档
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      // 提取所有页面的文本
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      console.log('文本提取完成，长度:', fullText.length);
      return fullText.trim();
      
    } catch (error) {
      console.error('PDF文本提取失败:', error);
      throw error;
    }
  }

  /**
   * 使用虚拟打印生成PDF
   * @param content 要打印的内容
   * @param fileName 文件名
   * @returns Promise<Blob> 生成的PDF
   */
  public async generatePdfFromContent(content: string, fileName: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        // 创建隐藏的iframe用于打印
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-9999px';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          reject(new Error('无法创建iframe文档'));
          return;
        }
        
        // 设置打印内容
        iframeDoc.body.innerHTML = `
          <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
            <h1>${fileName}</h1>
            <pre style="white-space: pre-wrap; font-family: monospace;">${content}</pre>
          </div>
        `;
        
        // 使用打印API生成PDF
        iframe.contentWindow?.print();
        
        // 监听打印完成
        iframe.contentWindow?.addEventListener('afterprint', () => {
          document.body.removeChild(iframe);
          
          // 这里需要实际的PDF生成逻辑
          // 由于浏览器限制，虚拟打印需要用户交互
          // 建议使用专门的PDF生成库如jsPDF
          this.generatePdfWithJsPdf(content)
            .then(resolve)
            .catch(reject);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 使用jsPDF生成PDF（需要安装jsPDF）
   */
  private async generatePdfWithJsPdf(content: string): Promise<Blob> {
    // 动态导入jsPDF（如果已安装）
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      
      // 设置字体和内容
      doc.setFont('helvetica');
      doc.setFontSize(12);
      
      // 分页处理长文本
      const lines = doc.splitTextToSize(content, 180);
      doc.text(lines, 15, 15);
      
      return new Blob([doc.output('blob')], { type: 'application/pdf' });
      
    } catch (error) {
      console.error('jsPDF不可用，使用备用方案:', error);
      // 备用方案：返回包含文本的简单PDF
      return new Blob([content], { type: 'application/pdf' });
    }
  }

  /**
   * 检测文件是否需要OCR
   * @param cajFile CAJ文件对象
   * @returns Promise<boolean> 是否需要OCR
   */
  public async detectOcrRequirement(cajFile: CajFile): Promise<boolean> {
    try {
      console.log('检测OCR需求:', cajFile.file.name);
      
      // 如果是CAJ文件，使用MuPDF检查是否包含文本
      if (cajFile.file.name.toLowerCase().endsWith('.caj')) {
        try {
          const text = await muPDFConverter.extractTextFromCaj(cajFile);
          const textLength = text.replace(/\s/g, '').length;
          console.log('CAJ文本长度:', textLength);
          
          // 如果提取的文本少于100个字符，可能是扫描版
          return textLength < 100;
        } catch (error) {
          console.warn('CAJ文本提取失败，假设需要OCR:', error);
          return true;
        }
      }
      
      // 对于非CAJ文件，检查文件名中的关键词
      const fileName = cajFile.file.name.toLowerCase();
      const ocrKeywords = ['scan', '扫描', 'image', '图片', 'ocr'];
      
      const needsOcr = ocrKeywords.some(keyword => fileName.includes(keyword));
      console.log('OCR检测结果:', fileName, '需要OCR:', needsOcr);
      
      return needsOcr;
      
    } catch (error) {
      console.error('OCR检测失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const cajConverter = CajConverter.getInstance();
