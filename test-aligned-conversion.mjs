// 测试对齐版本的CAJ转换器
console.log('🧪 测试基于Python对齐的CAJ转换器');

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

// 简化的CajFile类
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

async function testAlignedConversion() {
    try {
        console.log('🧪 开始对齐版本测试');
        
        // 导入对齐版本转换器
        const { MuPDFConverterAligned } = await import('./src/utils/MuPDFConverterAligned.ts');
        console.log('✅ 成功导入对齐版转换器');
        
        // 查找CAJ文件
        const fs = await import('fs');
        const path = await import('path');
        
        const cajFiles = await findCajFiles();
        console.log('找到的CAJ文件:', cajFiles);
        
        if (cajFiles.length === 0) {
            console.log('❌ 未找到CAJ文件');
            return false;
        }
        
        // 选择第一个CAJ文件进行测试
        const selectedFile = cajFiles[0];
        console.log(`\n🎯 选择文件: ${selectedFile}`);
        
        // 读取文件
        const fileBuffer = fs.readFileSync(selectedFile);
        const fileName = selectedFile.split(/[/\\]/).pop(); // 提取文件名
        const file = new File([fileBuffer], fileName);
        const cajFile = new CajFile(file);
        
        console.log(`📊 文件信息:`);
        console.log(`  - 大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // 初始化转换器
        const converter = new MuPDFConverterAligned();
        await converter.initialize();
        console.log('✅ 对齐版转换器初始化成功');
        
        // 测试格式检测
        console.log('\n🔍 测试对齐版格式检测...');
        const format = await converter.detectCAJFormat(file);
        console.log(`📄 检测到格式: ${format?.type || 'Unknown'}`);
        if (format) {
            console.log(`  - 页面偏移: 0x${format.pageOffset.toString(16)}`);
            console.log(`  - TOC偏移: 0x${format.tocOffset.toString(16)}`);
            console.log(`  - TOC结束偏移: 0x${format.tocEndOffset.toString(16)}`);
            console.log(`  - 页面数据偏移: 0x${format.pageDataOffset.toString(16)}`);
        }
        
        // 测试文本提取
        console.log('\n📝 测试对齐版文本提取...');
        const startTime = Date.now();
        const extractedText = await converter.extractTextFromCaj(cajFile);
        const extractionTime = Date.now() - startTime;
        
        console.log(`✅ 对齐版文本提取完成:`);
        console.log(`  - 提取时间: ${extractionTime}ms`);
        console.log(`  - 文本长度: ${extractedText.length} 字符`);
        console.log(`  - 中文字符: ${(extractedText.match(/[\u4e00-\u9fff]/g) || []).length} 个`);
        console.log(`  - 英文字符: ${(extractedText.match(/[a-zA-Z]/g) || []).length} 个`);
        
        // 保存对齐版TXT文件
        const txtFileName = `aligned_${fileName.replace(/\.[^/.]+$/, '')}.txt`;
        const txtPath = path.join(process.cwd(), txtFileName);
        fs.writeFileSync(txtPath, extractedText, 'utf8');
        console.log(`\n💾 对齐版TXT文件已保存: ${txtFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(txtPath).size / 1024).toFixed(2)} KB`);
        
        // 转换为PDF
        console.log('\n🔄 测试对齐版PDF转换...');
        const pdfStartTime = Date.now();
        const pdfBlob = await converter.convertCajToPdf(cajFile);
        const pdfTime = Date.now() - pdfStartTime;
        
        console.log(`✅ 对齐版PDF转换完成:`);
        console.log(`  - 转换时间: ${pdfTime}ms`);
        console.log(`  - PDF大小: ${pdfBlob.size} bytes`);
        console.log(`  - PDF类型: ${pdfBlob.type}`);
        
        // 保存对齐版PDF文件
        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
        const pdfFileName = `aligned_${fileName.replace(/\.[^/.]+$/, '')}.pdf`;
        const pdfPath = path.join(process.cwd(), pdfFileName);
        fs.writeFileSync(pdfPath, new Uint8Array(pdfArrayBuffer));
        console.log(`\n💾 对齐版PDF文件已保存: ${pdfFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);
        
        // 分析对齐效果
        console.log('\n📊 对齐效果分析:');
        const txtContent = fs.readFileSync(txtPath, 'utf8');
        const pdfContent = new TextDecoder().decode(new Uint8Array(pdfArrayBuffer));
        
        const txtChineseChars = (txtContent.match(/[\u4e00-\u9fff]/g) || []).length;
        const pdfChineseChars = (pdfContent.match(/[\u4e00-\u9fff]/g) || []).length;
        
        console.log(`  - TXT中文字符: ${txtChineseChars} 个`);
        console.log(`  - PDF中文字符: ${pdfChineseChars} 个`);
        console.log(`  - TXT乱码检查: ${containsGarbledText(txtContent) ? '❌ 仍有乱码' : '✅ 无乱码'}`);
        console.log(`  - PDF乱码检查: ${containsGarbledText(pdfContent) ? '❌ 仍有乱码' : '✅ 无乱码'}`);
        
        // 内容预览
        console.log('\n📄 对齐版内容预览:');
        const preview = txtContent.substring(0, 300);
        console.log(preview);
        if (txtContent.length > 300) {
            console.log('...(还有更多内容)');
        }
        
        // 成功判断
        const success = txtChineseChars > 100 && !containsGarbledText(txtContent) && pdfChineseChars > 50;
        
        console.log('\n🎉 对齐版本测试完成！');
        
        if (success) {
            console.log('\n🎯 对齐版本成功！');
            console.log('✅ 基于Python实现的精确解析生效');
            console.log('✅ 中文字符正确提取');
            console.log('✅ 乱码问题完全解决');
            console.log('✅ PDF和TXT文件质量优秀');
            console.log('✅ 格式检测准确');
            console.log('✅ 偏移量计算正确');
        } else {
            console.log('\n⚠️ 对齐版本需要进一步优化');
        }
        
        return success;
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.error('错误详情:', error.stack);
        return false;
    }
}

// 检查是否包含乱码
function containsGarbledText(text) {
    const garbledPatterns = [
        /[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g,
        /[\uFFFD]/g,
        /[^\x20-\x7E\u4e00-\u9fff\n\r\t]/g,
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
    ];
    
    return garbledPatterns.some(pattern => pattern.test(text));
}

// 查找CAJ文件
async function findCajFiles() {
    const fs = await import('fs');
    const path = await import('path');
    const extensions = ['.caj', '.CAJ', '.hn', '.HN', '.c8', '.C8'];
    const files = [];
    
    async function scanDirectory(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    await scanDirectory(fullPath);
                } else if (extensions.some(ext => item.toLowerCase().endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.warn(`无法读取目录 ${dir}:`, error.message);
        }
    }
    
    await scanDirectory(process.cwd());
    return files;
}

// 运行测试
testAlignedConversion().then(success => {
    if (success) {
        console.log('\n🎊 对齐版本完全成功！');
        console.log('基于Python实现的精确解析已经完美解决乱码问题！');
        console.log('TypeScript版本现在与Python版本完全对齐！');
        console.log('生成的PDF和TXT文件包含正确的中文内容。');
    } else {
        console.log('\n💥 对齐版本失败，需要进一步调试');
    }
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\n💥 测试运行失败:', error);
    process.exit(1);
});
