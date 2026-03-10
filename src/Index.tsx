import Logo from "./assets/Logo.svg";
import { useContext, useRef, useEffect, useState } from "react";
import { CajFile, TopContext } from "./Provider.tsx";
import { useNavigate } from "react-router-dom";
import BatchUpload from "./components/BatchUpload";
import FileList from "./components/FileList";
import BatchOperations from "./components/BatchOperations";
import FormatSelector from "./components/FormatSelector";
import { FileQueueManager } from "./utils/FileQueueManager";
import { cajConverter } from "./utils/CajConverter";

export default function Home() {
    const context = useContext(TopContext);
    const navigator = useNavigate();
    const queueManagerRef = useRef<FileQueueManager | null>(null);
    const [shouldAutoConvert, setShouldAutoConvert] = useState(false);
    const [showFormatSelector, setShowFormatSelector] = useState(false);
    const [formatSelectorFileIds, setFormatSelectorFileIds] = useState<string[]>([]);
    
    // 初始化队列管理器
    if (!queueManagerRef.current && context) {
        queueManagerRef.current = new FileQueueManager(context);
    }
    
    // 监听文件状态变化，实现自动转换
    useEffect(() => {
        if (shouldAutoConvert) {
            const selectedFiles = context.getSelectedFiles();
            console.log('useEffect - 检查自动转换，选中文件数量:', selectedFiles.length);
            
            if (selectedFiles.length > 0) {
                const pendingSelectedFiles = selectedFiles.filter(file => file.uploadStatus === 'pending');
                if (pendingSelectedFiles.length > 0) {
                    console.log('useEffect - 触发自动转换，文件数量:', pendingSelectedFiles.length);
                    
                    // 直接处理转换，不使用FileQueueManager
                    pendingSelectedFiles.forEach(async (file) => {
                        try {
                            context.setCajFileStatus(file.id, 'uploading');
                            await simulateUploadProgress(file.id, 0, 70, 2000);
                            await simulateActualUpload(file);
                            context.setCajFileStatus(file.id, 'uploaded');
                            await simulateUploadProgress(file.id, 70, 100, 3000);
                            context.setCajFileStatus(file.id, 'completed');
                        } catch (error) {
                            console.error('文件转换失败:', error);
                            context.setCajFileError(file.id, error instanceof Error ? error.message : '未知错误');
                        }
                    });
                    
                    setShouldAutoConvert(false);
                } else {
                    console.log('useEffect - 没有待处理的文件');
                    setShouldAutoConvert(false);
                }
            } else {
                console.log('useEffect - 没有选中的文件');
                setShouldAutoConvert(false);
            }
        }
    }, [shouldAutoConvert, context.uploadCAJFiles]);

    // 模拟上传进度
    const simulateUploadProgress = (fileId: string, startProgress: number, endProgress: number, duration: number): Promise<void> => {
        return new Promise(resolve => {
            const steps = 20;
            const stepDuration = duration / steps;
            const progressIncrement = (endProgress - startProgress) / steps;
            
            let currentStep = 0;
            const interval = setInterval(() => {
                currentStep++;
                const currentProgress = Math.round(startProgress + (progressIncrement * currentStep));
                context.setCajFileProgress(fileId, Math.min(currentProgress, 100));
                
                if (currentStep >= steps) {
                    clearInterval(interval);
                    resolve();
                }
            }, stepDuration);
        });
    };

    // 模拟实际上传
    const simulateActualUpload = async (file: CajFile): Promise<void> => {
        try {
            // 检测是否需要OCR
            const needsOcr = await cajConverter.detectOcrRequirement(file);
            context.setCajFileNeedsOcr(file.id, needsOcr);
            
            // 如果是TXT格式且需要OCR，直接标记错误
            if (file.outputFormat === 'txt' && needsOcr) {
                throw new Error('扫描版文件需要OCR处理，暂不支持TXT输出');
            }
            
            console.log('开始转换文件:', file.file.name, '格式:', file.outputFormat);
            
            // 使用CajConverter进行转换（内部会使用MuPDF）
            if (file.outputFormat === 'pdf') {
                const pdfBlob = await cajConverter.convertCajToPdf(file);
                const url = URL.createObjectURL(pdfBlob);
                context.setCaJFileBlobUrl(file.id, url);
                console.log('PDF转换完成:', url);
            } else if (file.outputFormat === 'txt') {
                const pdfBlob = await cajConverter.convertCajToPdf(file);
                const textContent = await cajConverter.convertPdfToText(pdfBlob, file);
                const textBlob = new Blob([textContent], { type: 'text/plain' });
                const url = URL.createObjectURL(textBlob);
                context.setCajFileTxtUrl(file.id, url);
                console.log('TXT转换完成:', url);
            }
            
        } catch (error) {
            console.error('文件转换失败:', error);
            throw error;
        }
    };

    const handleFilesAdded = (files: CajFile[]) => {
        context.appendUploadCAJFiles(files);
    };
    
    const handleSelectNewFiles = (fileIds: string[]) => {
        context.selectFilesByIds(fileIds);
    };
    
    const handleFileView = (file: CajFile) => {
        context.setViewCajFile(file);
        navigator("/view");
    };
    
    const handleFileDownload = async (file: CajFile) => {
        try {
            // 检查文件是否有有效的下载URL
            const url = file.outputFormat === 'pdf' ? file.blobUrl : file.txtUrl;
            
            if (!url) {
                alert('文件尚未转换完成，无法下载');
                return;
            }
            
            // 创建下载链接
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
            alert(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    };
    
    const handleFileDelete = (id: string) => {
        context.removeCajFile(id);
    };
    
    const handleFileRetry = async (file: CajFile) => {
        if (queueManagerRef.current) {
            try {
                await queueManagerRef.current.retryFile(file);
            } catch (error) {
                alert(`重试失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
    };
    
    const handleBatchDownload = async (files: CajFile[]) => {
        if (queueManagerRef.current) {
            try {
                await queueManagerRef.current.downloadBatch(files);
            } catch (error) {
                alert(`批量下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
    };
    
    const handleBatchDelete = (files: CajFile[]) => {
        if (queueManagerRef.current) {
            queueManagerRef.current.deleteFiles(files);
        }
    };
    
    const handleClearAll = () => {
        if (queueManagerRef.current) {
            queueManagerRef.current.clearAll();
        }
    };
    
    const handleFormatChange = (id: string, format: "pdf" | "txt") => {
        context.updateOutputFormat(id, format);
    };

    const handleShowFormatSelector = (fileIds: string[]) => {
        console.log('显示格式选择器，文件ID:', fileIds);
        setFormatSelectorFileIds(fileIds);
        setShowFormatSelector(true);
    };
    
    const handleFormatSelected = (fileIds: string[], format: 'pdf' | 'txt') => {
        console.log('选择格式:', format, '文件ID:', fileIds);
        
        // 更新所有文件的格式
        fileIds.forEach(id => {
            context.updateOutputFormat(id, format);
        });
        
        setShowFormatSelector(false);
        setFormatSelectorFileIds([]);
        
        // 设置自动转换标志
        setTimeout(() => {
            setShouldAutoConvert(true);
        }, 100);
    };
    
    const handleCancelFormatSelector = () => {
        setShowFormatSelector(false);
        setFormatSelectorFileIds([]);
    };

    const handleStartConversion = async () => {
        if (queueManagerRef.current) {
            try {
                // 检查是否有选中的文件
                const selectedFiles = context.getSelectedFiles();
                if (selectedFiles.length === 0) {
                    alert('请先选择要转换的文件');
                    return;
                }
                
                // 检查选中的文件是否都是待处理状态
                const pendingSelectedFiles = selectedFiles.filter(file => file.uploadStatus === 'pending');
                if (pendingSelectedFiles.length === 0) {
                    alert('选中的文件中没有待处理的文件，请检查文件状态');
                    return;
                }
                
                await queueManagerRef.current.startBatchConversion();
            } catch (error) {
                alert(`批量转换失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
    };

    return (
        <div className={"bg-white min-h-[100vh] box-border pb-[50px]"}>
            <div
                className={"h-[56px] border-b-[1px] justify-between flex items-center"}
            >
                <div
                    className={
                        "px-[16px] flex items-center sm:px-[32px] text-[22px] font-[700]"
                    }
                >
                    <img src={Logo} className={"mr-[10px]"} alt="" /> CAJ 批量转换
                </div>
                <div>
                    Visit our domain: <a href="https://caj2pdf.vercel.app">caj2pdf.vercel.app</a>
                </div>
                <div className={'pr-[16px] sm:pr-[32px] select-none'}>
                   <a href="mailto:alew88102@gmail.com">Contact us</a>
                </div>
            </div>
            
            <div className="px-[16px] sm:px-[32px] m-auto max-w-[1136px] w-full mt-[30px] sm:mt-[60px] space-y-6">
                {/* 上传区域 */}
                <BatchUpload 
                    onFilesAdded={handleFilesAdded} 
                    onSelectNewFiles={handleSelectNewFiles}
                    onShowFormatSelector={handleShowFormatSelector}
                />
                
                {/* 格式选择器 */}
                {showFormatSelector && (
                    <FormatSelector
                        fileIds={formatSelectorFileIds}
                        onFormatSelected={handleFormatSelected}
                        onCancel={handleCancelFormatSelector}
                    />
                )}
                
                {/* 批量操作 */}
                <BatchOperations 
                    onBatchDownload={handleBatchDownload}
                    onBatchDelete={handleBatchDelete}
                    onClearAll={handleClearAll}
                    onStartConversion={handleStartConversion}
                />
                
                {/* 文件列表 */}
                <FileList 
                    onFileView={handleFileView}
                    onFileDownload={handleFileDownload}
                    onFileDelete={handleFileDelete}
                    onFileRetry={handleFileRetry}
                    onFormatChange={handleFormatChange}
                />
                
                {/* 说明文字 */}
                <div className={"mt-[40px]"}>
                    <div
                        className={"flex  flex-[5] text-[14px] text-[rgb(26,26,26)]"}
                        style={{ fontSmooth: "antialiased" }}
                    >
                        CAJ是"中国学术期刊全文数据库"（China Academic
                        Journals）的英文缩写，同时也是"中国学术期刊全文数据库"中的一种文件格式。我们从CNKI（知网）下载的资料一般都是这种文件格式。
                    </div>
                </div>
                
                {/* 页脚 */}
                <div
                    style={{
                        position: "fixed",
                        left: 0,
                        right: 0,
                        bottom: "20px",
                        margin: "auto",
                        zIndex: 999,
                        textAlign: "center",
                    }}
                >
                    <a style={{ fontSize: "16px" }} href="https://beian.miit.gov.cn/">
                        京ICP备2023000087号-1
                    </a>
                </div>
            </div>
        </div>
    );
}
