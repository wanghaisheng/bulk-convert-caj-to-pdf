import React, {ReactNode} from "react";

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

export interface TopContextType {
    viewCajFile?: CajFile;
    setViewCajFile: (cajFiles: CajFile) => void;
    uploadCAJFiles: Array<CajFile>
    appendUploadCAJFiles: (cajFiles: CajFile[]) => void;
    removeCajFile: (id: string) => void;
    setCajFileStatus: (id: string, status: "pending" | "uploading" | "uploaded" | "converting" | "completed" | "error") => void;
    setCaJFileBlobUrl: (id: string, blobUrl: string) => void;
    setCajFileTxtUrl: (id: string, txtUrl: string) => void;
    setCajFileProgress: (id: string, progress: number) => void;
    setCajFileError: (id: string, errorMessage: string) => void;
    setCajFileNeedsOcr: (id: string, needsOcr: boolean) => void;
    toggleFileSelection: (id: string) => void;
    selectAllFiles: (selected: boolean) => void;
    clearAllFiles: () => void;
    getSelectedFiles: () => CajFile[];
    getTotalProgress: () => number;
    updateOutputFormat: (id: string, format: "pdf" | "txt") => void;
    selectFilesByIds: (ids: string[]) => void;
}

export const TopContext = React.createContext({} as TopContextType);

export const TopProvider = ({ children }: {children: ReactNode}) => {
    const [viewCajFile, setViewCajFile] = React.useState<CajFile>();
    const [uploadCAJFiles, setUploadCAJFiles] = React.useState<CajFile[]>([]);
    
    const appendUploadCAJFiles = (cajFiles: CajFile[]) => {
        setUploadCAJFiles(prevState => [...prevState, ...cajFiles]);
    };
    
    const removeCajFile = (id: string) => {
        setUploadCAJFiles(prevState => prevState.filter(file => file.id !== id));
    };
    
    const setCajFileStatus = (id: string, status: "pending" | "uploading" | "uploaded" | "converting" | "completed" | "error") => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, uploadStatus: status } : file)
        );
    };
    
    const setCaJFileBlobUrl = (id: string, blobUrl: string) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, blobUrl } : file)
        );
    };
    
    const setCajFileTxtUrl = (id: string, txtUrl: string) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, txtUrl } : file)
        );
    };
    
    const setCajFileNeedsOcr = (id: string, needsOcr: boolean) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, needsOcr } : file)
        );
    };
    
    const updateOutputFormat = (id: string, format: "pdf" | "txt") => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, outputFormat: format } : file)
        );
    };
    
    const selectFilesByIds = (ids: string[]) => {
        console.log('Provider - 选择文件ID:', ids);
        setUploadCAJFiles(prevState => {
            const updatedState = prevState.map(file => ({ 
                ...file, 
                selected: ids.includes(file.id) 
            }));
            console.log('Provider - 更新后的文件状态:', updatedState.map(f => ({
                id: f.id,
                name: f.file.name,
                selected: f.selected
            })));
            return updatedState;
        });
    };
    
    const setCajFileProgress = (id: string, progress: number) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, progress } : file)
        );
    };
    
    const setCajFileError = (id: string, errorMessage: string) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, errorMessage, uploadStatus: 'error' } : file)
        );
    };
    
    const toggleFileSelection = (id: string) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => file.id === id ? { ...file, selected: !file.selected } : file)
        );
    };
    
    const selectAllFiles = (selected: boolean) => {
        setUploadCAJFiles(prevState => 
            prevState.map(file => ({ ...file, selected }))
        );
    };
    
    const clearAllFiles = () => {
        setUploadCAJFiles([]);
    };
    
    const getSelectedFiles = () => {
        return uploadCAJFiles.filter(file => file.selected);
    };
    
    const getTotalProgress = () => {
        if (uploadCAJFiles.length === 0) return 0;
        const totalProgress = uploadCAJFiles.reduce((sum, file) => sum + file.progress, 0);
        return Math.round(totalProgress / uploadCAJFiles.length);
    };
    
    return <TopContext.Provider value={{
        viewCajFile,
        setViewCajFile,
        uploadCAJFiles,
        appendUploadCAJFiles,
        removeCajFile,
        setCajFileStatus,
        setCaJFileBlobUrl,
        setCajFileTxtUrl,
        setCajFileProgress,
        setCajFileError,
        setCajFileNeedsOcr,
        toggleFileSelection,
        selectAllFiles,
        clearAllFiles,
        getSelectedFiles,
        getTotalProgress,
        updateOutputFormat,
        selectFilesByIds
    }}>{children}</TopContext.Provider>;
}
