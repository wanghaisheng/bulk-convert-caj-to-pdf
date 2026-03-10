// 强化的CAJ转换测试脚本
// 选择真实CAJ文件，输出PDF和TXT进行分析

import fs from 'fs';
import path from 'path';

// 模拟浏览器环境
global.window = global;
global.Blob = class Blob {
    constructor(data, options = {}) {
        this.data = data;
        this.type = options.type || '';
        this.size = Array.isArray(data) ? data.reduce((acc, item) => acc + (item.length || item.byteLength || 0), 0) : 0;
    }
    
    async arrayBuffer() {
        if (Array.isArray(this.data)) {
            const totalLength = this.data.reduce((acc, item) => acc + (item.length || item.byteLength || 0), 0);
            const buffer = new ArrayBuffer(totalLength);
            const uint8Array = new Uint8Array(buffer);
            let offset = 0;
            for (const item of this.data) {
                const itemArray = new Uint8Array(item.buffer || item);
                uint8Array.set(itemArray, offset);
                offset += itemArray.length;
            }
            return buffer;
        }
        return new ArrayBuffer(0);
    }
};

global.File = class File extends Blob {
    constructor(data, name, options = {}) {
        super(data, options);
        this.name = name;
        this.lastModified = Date.now();
        this.size = this.size || (Array.isArray(data) ? data.reduce((acc, item) => acc + (item.length || item.byteLength || 0), 0) : 0);
    }
    
    async arrayBuffer() {
        return super.arrayBuffer();
    }
};

// 本地定义CajFile类
class CajFile {
    constructor(file, uploadStatus = "pending", outputFormat = "pdf") {
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

async function testCompleteConversion() {
    try {
        console.log('🧪 开始强化CAJ转换测试');
        
        // 导入MuPDFConverter
        const { MuPDFConverter } = await import('./src/utils/MuPDFConverter.ts');
        console.log('✅ 成功导入MuPDFConverter');
        
        // 查找CAJ文件
        const cajFiles = findCajFiles();
        if (cajFiles.length === 0) {
            console.log('❌ 未找到CAJ文件');
            return false;
        }
        
        console.log(`📂 找到 ${cajFiles.length} 个CAJ文件:`);
        cajFiles.forEach((file, index) => {
            const size = fs.statSync(file).size;
            console.log(`  ${index + 1}. ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        });
        
        // 选择第一个CAJ文件进行测试
        const selectedFile = cajFiles[0];
        console.log(`\n🎯 选择文件: ${path.basename(selectedFile)}`);
        
        // 读取文件
        const fileBuffer = fs.readFileSync(selectedFile);
        const file = new File([fileBuffer], path.basename(selectedFile));
        const cajFile = new CajFile(file);
        
        console.log(`📊 文件信息:`);
        console.log(`  - 大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  - 类型: ${path.extname(selectedFile)}`);
        
        // 初始化转换器
        const converter = new MuPDFConverter();
        await converter.initialize();
        console.log('✅ 转换器初始化成功');
        
        // 检测格式
        console.log('\n🔍 检测文件格式...');
        const format = await converter.detectCAJFormat(file);
        console.log(`📄 检测到格式: ${format?.type || 'Unknown'}`);
        
        // 提取文本
        console.log('\n📝 提取文本内容...');
        const startTime = Date.now();
        const extractedText = await converter.extractTextFromCaj(cajFile);
        const extractionTime = Date.now() - startTime;
        
        console.log(`✅ 文本提取完成:`);
        console.log(`  - 提取时间: ${extractionTime}ms`);
        console.log(`  - 文本长度: ${extractedText.length} 字符`);
        console.log(`  - 中文字符: ${(extractedText.match(/[\u4e00-\u9fff]/g) || []).length} 个`);
        console.log(`  - 英文字符: ${(extractedText.match(/[a-zA-Z]/g) || []).length} 个`);
        
        // 保存TXT文件
        const txtFileName = `output_${path.basename(selectedFile, path.extname(selectedFile))}.txt`;
        const txtPath = path.join(process.cwd(), txtFileName);
        fs.writeFileSync(txtPath, extractedText, 'utf8');
        console.log(`\n💾 TXT文件已保存: ${txtFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(txtPath).size / 1024).toFixed(2)} KB`);
        
        // 转换为PDF
        console.log('\n🔄 转换为PDF...');
        const pdfStartTime = Date.now();
        const pdfBlob = await converter.convertCajToPdf(cajFile);
        const pdfTime = Date.now() - pdfStartTime;
        
        console.log(`✅ PDF转换完成:`);
        console.log(`  - 转换时间: ${pdfTime}ms`);
        console.log(`  - PDF大小: ${pdfBlob.size} bytes`);
        console.log(`  - PDF类型: ${pdfBlob.type}`);
        
        // 保存PDF文件
        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
        const pdfFileName = `output_${path.basename(selectedFile, path.extname(selectedFile))}.pdf`;
        const pdfPath = path.join(process.cwd(), pdfFileName);
        fs.writeFileSync(pdfPath, new Uint8Array(pdfArrayBuffer));
        console.log(`\n💾 PDF文件已保存: ${pdfFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);
        
        // 分析PDF内容
        console.log('\n📊 分析PDF内容...');
        const pdfText = new TextDecoder().decode(new Uint8Array(pdfArrayBuffer));
        
        const pdfPageMatches = pdfText.match(/\/Type \/Page/g);
        const pageCount = pdfPageMatches ? pdfPageMatches.length : 0;
        
        console.log(`  - PDF页数: ${pageCount}`);
        console.log(`  - PDF格式正确: ${pdfText.startsWith('%PDF') ? '是' : '否'}`);
        console.log(`  - 包含中文: ${/[\u4e00-\u9fff]/. test(pdfText) ? '是' : '否'}`);
        console.log(`  - PDF字符数: ${pdfText.length}`);
        
        // 质量分析
        console.log('\n📈 转换质量分析:');
        const originalSize = fileBuffer.length;
        const txtSize = fs.statSync(txtPath).size;
        const pdfSize = fs.statSync(pdfPath).size;
        
        console.log(`  - 原始文件: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  - TXT文件: ${(txtSize / 1024).toFixed(2)} KB (${((txtSize / originalSize) * 100).toFixed(1)}%)`);
        console.log(`  - PDF文件: ${(pdfSize / 1024).toFixed(2)} KB (${((pdfSize / originalSize) * 100).toFixed(1)}%)`);
        console.log(`  - 内容保留率: ${((extractedText.length / 1000).toFixed(1))} 字符/KB`);
        
        // 成功指标
        console.log('\n✅ 成功指标:');
        const successMetrics = {
            textExtraction: extractedText.length > 100,
            chineseContent: (extractedText.match(/[\u4e00-\u9fff]/g) || []).length > 50,
            pdfGeneration: pdfSize > 1000,
            pdfFormat: pdfText.startsWith('%PDF'),
            multiPage: pageCount > 1,
            reasonableSize: pdfSize < originalSize / 10
        };
        
        Object.entries(successMetrics).forEach(([metric, success]) => {
            console.log(`  - ${metric}: ${success ? '✅ 成功' : '❌ 失败'}`);
        });
        
        const allSuccess = Object.values(successMetrics).every(Boolean);
        
        // 内容预览
        console.log('\n📄 内容预览:');
        const preview = extractedText.substring(0, 500);
        console.log(preview);
        if (extractedText.length > 500) {
            console.log('...(还有更多内容)');
        }
        
        console.log('\n🎉 强化测试完成！');
        
        if (allSuccess) {
            console.log('\n🎯 结论: CAJ转换系统完全成功！');
            console.log('✅ 所有指标都达到预期水平');
            console.log('✅ 可以正常处理真实CAJ文件');
            console.log('✅ 文本提取质量优秀');
            console.log('✅ PDF生成功能正常');
        } else {
            console.log('\n⚠️ 结论: 部分功能需要进一步优化');
        }
        
        return allSuccess;
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.error('错误详情:', error.stack);
        return false;
    }
}

// 查找CAJ文件
function findCajFiles() {
    const extensions = ['.caj', '.CAJ', '.hn', '.HN', '.c8', '.C8'];
    const files = [];
    
    function scanDirectory(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (extensions.some(ext => item.toLowerCase().endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.warn(`无法读取目录 ${dir}:`, error.message);
        }
    }
    
    scanDirectory(process.cwd());
    return files;
}

// 运行测试
testCompleteConversion().then(success => {
    if (success) {
        console.log('\n🎊 强化测试完全成功！');
        console.log('系统已经可以完美处理真实的CAJ文件转换！');
        console.log('生成的PDF和TXT文件已保存在当前目录中。');
    } else {
        console.log('\n💥 强化测试失败，需要进一步调试');
    }
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\n💥 测试运行失败:', error);
    process.exit(1);
});
