import { CajFile, TopContextType } from '../Provider';

export class FileQueueManager {
  private context: TopContextType;
  private maxConcurrent: number = 3;
  private isProcessing: boolean = false;

  constructor(context: TopContextType) {
    this.context = context;
  }

  async startBatchConversion(): Promise<void> {
    if (this.isProcessing) {
      console.log('批量转换正在进行中...');
      return;
    }

    // 每次都获取最新的文件状态
    const allFiles = this.context.uploadCAJFiles;
    const pendingFiles = allFiles.filter(
      file => file.uploadStatus === 'pending'
    );

    console.log('FileQueueManager - 当前所有文件数量:', allFiles.length);
    console.log('FileQueueManager - 待处理文件数量:', pendingFiles.length);
    console.log('FileQueueManager - 当前文件状态:', allFiles.map(f => ({
        name: f.file.name,
        status: f.uploadStatus,
        selected: f.selected
    })));

    if (pendingFiles.length === 0) {
      console.log('没有待处理的文件');
      return;
    }

    this.isProcessing = true;
    console.log(`开始批量转换 ${pendingFiles.length} 个文件`);

    // 分批处理文件
    const chunks = this.chunkArray(pendingFiles, this.maxConcurrent);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(file => this.processFile(file)));
    }

    this.isProcessing = false;
    console.log('批量转换完成');
  }

  private async processFile(file: CajFile): Promise<void> {
    try {
      // 检测是否需要OCR
      const needsOcr = await this.detectOcrRequirement(file);
      this.context.setCajFileNeedsOcr(file.id, needsOcr);
      
      // 如果是TXT格式且需要OCR，直接标记为错误
      if (file.outputFormat === 'txt' && needsOcr) {
        this.context.setCajFileError(file.id, '扫描版文件需要OCR处理，暂不支持TXT输出');
        return;
      }
      
      this.context.setCajFileStatus(file.id, 'uploading');
      await this.simulateProgress(file.id, 0, 70, 2000);
      await this.uploadFile(file);
      this.context.setCajFileStatus(file.id, 'uploaded');
      await this.simulateProgress(file.id, 70, 100, 3000);
      this.context.setCajFileStatus(file.id, 'completed');
    } catch (error) {
      this.context.setCajFileError(file.id, error instanceof Error ? error.message : '未知错误');
    }
  }

  private async detectOcrRequirement(file: CajFile): Promise<boolean> {
    // 模拟OCR检测逻辑 - 实际项目中需要调用后端API
    // 这里简单根据文件名判断（实际需要更复杂的检测）
    const scannedKeywords = ['scan', '扫描', 'image', '图片'];
    const fileName = file.file.name.toLowerCase();
    
    return scannedKeywords.some(keyword => fileName.includes(keyword));
  }

  private async uploadFile(file: CajFile): Promise<void> {
    const formData = new FormData();
    formData.append('file', file.file, file.file.name);
    formData.append('format', file.outputFormat);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (file.outputFormat === 'pdf') {
        this.context.setCaJFileBlobUrl(file.id, url);
      } else {
        this.context.setCajFileTxtUrl(file.id, url);
      }
      
    } catch (error) {
      throw new Error(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async simulateProgress(fileId: string, startProgress: number, endProgress: number, duration: number): Promise<void> {
    const steps = 20;
    const stepDuration = duration / steps;
    const progressIncrement = (endProgress - startProgress) / steps;

    for (let i = 0; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, stepDuration));
      const currentProgress = Math.round(startProgress + (progressIncrement * i));
      this.context.setCajFileProgress(fileId, Math.min(currentProgress, 100));
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async retryFile(file: CajFile): Promise<void> {
    // 重置文件状态
    this.context.setCajFileStatus(file.id, 'pending');
    this.context.setCajFileProgress(file.id, 0);
    this.context.setCajFileError(file.id, '');
    
    // 重新处理
    await this.processFile(file);
  }

  async downloadFile(file: CajFile): Promise<void> {
    const url = file.outputFormat === 'pdf' ? file.blobUrl : file.txtUrl;
    
    if (!url) {
      throw new Error('文件尚未转换完成');
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const extension = file.outputFormat === 'pdf' ? '.pdf' : '.txt';
      a.download = file.file.name.replace('.caj', extension);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      throw new Error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async downloadBatch(files: CajFile[]): Promise<void> {
    const completedFiles = files.filter(file => {
      const hasValidUrl = file.outputFormat === 'pdf' ? file.blobUrl : file.txtUrl;
      return file.uploadStatus === 'completed' && hasValidUrl;
    });
    
    if (completedFiles.length === 0) {
      throw new Error('没有可下载的已完成文件');
    }

    // 逐个下载文件
    for (const file of completedFiles) {
      try {
        await this.downloadFile(file);
        // 添加小延迟避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`下载文件 ${file.file.name} 失败:`, error);
      }
    }
  }

  deleteFiles(files: CajFile[]): void {
    files.forEach((file: CajFile) => {
      // 清理blob URL
      if (file.blobUrl) {
        URL.revokeObjectURL(file.blobUrl);
      }
      if (file.txtUrl) {
        URL.revokeObjectURL(file.txtUrl);
      }
      // 从列表中移除
      this.context.removeCajFile(file.id);
    });
  }

  clearAll(): void {
    // 清理所有blob URL
    this.context.uploadCAJFiles.forEach(file => {
      if (file.blobUrl) {
        URL.revokeObjectURL(file.blobUrl);
      }
      if (file.txtUrl) {
        URL.revokeObjectURL(file.txtUrl);
      }
    });
    
    // 清空列表
    this.context.clearAllFiles();
  }

  getQueueStats(): {
    total: number;
    pending: number;
    uploading: number;
    converting: number;
    completed: number;
    error: number;
  } {
    const files = this.context.uploadCAJFiles;
    return {
      total: files.length,
      pending: files.filter((f: CajFile) => f.uploadStatus === 'pending').length,
      uploading: files.filter((f: CajFile) => f.uploadStatus === 'uploading').length,
      converting: files.filter((f: CajFile) => f.uploadStatus === 'converting').length,
      completed: files.filter((f: CajFile) => f.uploadStatus === 'completed').length,
      error: files.filter((f: CajFile) => f.uploadStatus === 'error').length,
    };
  }
}
