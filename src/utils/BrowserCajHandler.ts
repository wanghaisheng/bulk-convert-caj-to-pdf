import { CajFile } from '../Provider';

export class BrowserCajHandler {
  private currentFileSize: number = 0;
  
  /**
   * 自动将CAJ文件转换为PDF（隐式流程）
   * @param cajFile CAJ文件对象
   * @param onPdfGenerated PDF生成完成后的回调
   */
  public async autoConvertCajToPdf(cajFile: CajFile, onPdfGenerated: (pdfBlob: Blob) => void): Promise<void> {
    try {
      console.log('开始自动转换CAJ到PDF:', cajFile.file.name);
      
      // 保存文件大小
      this.currentFileSize = cajFile.file.size;
      
      // 创建隐藏的iframe
      const iframe = this.createHiddenIframe();
      
      // 在iframe中加载CAJ文件
      await this.loadCajInIframe(iframe, cajFile);
      
      // 等待文件加载完成
      await this.waitForFileLoad(iframe);
      
      // 自动触发打印
      const pdfBlob = await this.autoPrintToPdf(iframe, cajFile.file.name);
      
      // 清理资源
      document.body.removeChild(iframe);
      
      // 回调返回PDF Blob
      onPdfGenerated(pdfBlob);
      
    } catch (error) {
      console.error('自动转换CAJ到PDF失败:', error);
      throw error;
    }
  }

  /**
   * 创建隐藏的iframe
   */
  private createHiddenIframe(): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '800px';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    return iframe;
  }

  /**
   * 在iframe中加载CAJ文件
   */
  private async loadCajInIframe(iframe: HTMLIFrameElement, cajFile: CajFile): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const fileUrl = URL.createObjectURL(cajFile.file);
        
        iframe.onload = () => {
          console.log('CAJ文件在iframe中加载完成');
          URL.revokeObjectURL(fileUrl);
          resolve();
        };
        
        iframe.onerror = () => {
          URL.revokeObjectURL(fileUrl);
          reject(new Error('加载CAJ文件失败'));
        };
        
        iframe.src = fileUrl;
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 等待文件内容加载完成
   */
  private async waitForFileLoad(iframe: HTMLIFrameElement): Promise<void> {
    return new Promise((resolve) => {
      // 等待一段时间确保内容渲染完成
      setTimeout(() => {
        console.log('文件加载等待完成');
        resolve();
      }, 2000);
    });
  }

  /**
   * 自动打印为PDF
   */
  private async autoPrintToPdf(iframe: HTMLIFrameElement, fileName: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        // 获取iframe的document
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        
        if (!iframeDoc) {
          reject(new Error('无法访问iframe文档'));
          return;
        }

        // 使用window.print()的Promise版本
        const originalPrint = iframe.contentWindow?.print;
        
        if (!originalPrint) {
          reject(new Error('浏览器不支持打印功能'));
          return;
        }

        // 模拟打印并生成PDF
        this.simulatePrintToPdf(iframeDoc, fileName)
          .then(resolve)
          .catch(reject);
          
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 模拟打印生成PDF
   */
  private async simulatePrintToPdf(doc: Document, fileName: string): Promise<Blob> {
    try {
      // 获取文档内容
      let content = '';
      
      // 尝试多种方式获取内容
      if (doc.body) {
        content = doc.body.innerText || doc.body.textContent || doc.body.innerHTML;
      }
      
      if (!content || content.trim().length < 10) {
        content = doc.documentElement.innerText || doc.documentElement.textContent || doc.documentElement.outerHTML;
      }
      
      // 如果内容仍然很少，可能是二进制文件，提供说明
      if (!content || content.trim().length < 50) {
        content = `
CAJ文件: ${fileName}
文件大小: ${(this.currentFileSize / 1024 / 1024).toFixed(2)} MB
转换时间: ${new Date().toLocaleString()}

注意：CAJ文件是二进制格式，浏览器无法直接解析其文本内容。

建议解决方案：
1. 使用专业的CAJ解析软件（如CAJViewer）
2. 安装浏览器CAJ插件
3. 使用后端CAJ转换服务
4. 将CAJ文件另存为PDF后再处理

当前显示的是文件的二进制数据，不是真实的文档内容。
        `.trim();
      }
      
      // 使用jsPDF生成PDF
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF();
      
      // 设置字体
      pdf.setFont('helvetica');
      pdf.setFontSize(12);
      
      // 添加文件名作为标题
      pdf.setFontSize(16);
      pdf.text(fileName, 20, 20);
      
      // 添加内容
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(content, 170);
      pdf.text(lines, 20, 30);
      
      // 生成PDF Blob
      const pdfBlob = pdf.output('blob');
      
      console.log('PDF生成完成，内容长度:', content.length);
      return pdfBlob;
      
    } catch (error) {
      console.error('模拟打印失败:', error);
      // 降级方案：生成简单的文本PDF
      return this.generateFallbackPdf(fileName);
    }
  }

  /**
   * 降级方案：生成简单的PDF
   */
  private generateFallbackPdf(fileName: string): Blob {
    const content = `
文件: ${fileName}
生成时间: ${new Date().toLocaleString()}
来源: CAJ文件自动转换

注意：这是降级生成的PDF内容。
实际应用中需要：
1. 专门的CAJ解析库
2. 或支持CAJ格式的浏览器插件
3. 或后端转换服务

原始内容无法直接提取，请使用其他方法处理CAJ文件。
    `.trim();
    
    return new Blob([content], { type: 'text/plain' });
  }

  /**
   * 手动打开CAJ文件（备用方案）
   */
  public openCajInBrowser(cajFile: CajFile): void {
    const fileUrl = URL.createObjectURL(cajFile.file);
    const newWindow = window.open(fileUrl, '_blank');
    
    if (newWindow) {
      newWindow.addEventListener('beforeunload', () => {
        URL.revokeObjectURL(fileUrl);
      });
    } else {
      console.error('无法打开新窗口，请检查浏览器弹窗设置');
      URL.revokeObjectURL(fileUrl);
    }
  }

  /**
   * 显示打印说明（备用方案）
   */
  public promptPrintToPdf(cajFile: CajFile): void {
    const message = `
请按以下步骤将CAJ文件转换为PDF：

1. 点击"在浏览器中打开"按钮
2. 在新窗口中，按 Ctrl+P (Windows) 或 Cmd+P (Mac) 打开打印对话框
3. 在打印目标中选择"另存为PDF"或"打印到PDF"
4. 点击保存，选择保存位置
5. 保存后的PDF文件可以上传进行TXT转换

文件名: ${cajFile.file.name}
    `.trim();
    
    alert(message);
  }
}

export const browserCajHandler = new BrowserCajHandler();
