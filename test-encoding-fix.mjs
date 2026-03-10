// 测试编码修复效果
console.log('🧪 测试基于Python实现的编码修复');

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

async function testEncodingFix() {
    try {
        console.log('🧪 开始编码修复测试');
        
        // 导入MuPDFConverter
        const { MuPDFConverter } = await import('./src/utils/MuPDFConverter.ts');
        console.log('✅ 成功导入MuPDFConverter');
        
        // 查找CAJ文件
        const fs = await import('fs');
        const path = await import('path');
        
        const cajFiles = findCajFiles();
        if (cajFiles.length === 0) {
            console.log('❌ 未找到CAJ文件');
            return false;
        }
        
        // 选择第一个CAJ文件进行测试
        const selectedFile = cajFiles[0];
        console.log(`\n🎯 选择文件: ${path.basename(selectedFile)}`);
        
        // 读取文件
        const fileBuffer = fs.readFileSync(selectedFile);
        const file = new File([fileBuffer], path.basename(selectedFile));
        const cajFile = new CajFile(file);
        
        console.log(`📊 文件信息:`);
        console.log(`  - 大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // 初始化转换器
        const converter = new MuPDFConverter();
        await converter.initialize();
        console.log('✅ 转换器初始化成功');
        
        // 测试文本提取
        console.log('\n📝 测试修复后的文本提取...');
        const startTime = Date.now();
        const extractedText = await converter.extractTextFromCaj(cajFile);
        const extractionTime = Date.now() - startTime;
        
        console.log(`✅ 文本提取完成:`);
        console.log(`  - 提取时间: ${extractionTime}ms`);
        console.log(`  - 文本长度: ${extractedText.length} 字符`);
        console.log(`  - 中文字符: ${(extractedText.match(/[\u4e00-\u9fff]/g) || []).length} 个`);
        
        // 保存修复后的TXT文件
        const txtFileName = `fixed_${path.basename(selectedFile, path.extname(selectedFile))}.txt`;
        const txtPath = path.join(process.cwd(), txtFileName);
        fs.writeFileSync(txtPath, extractedText, 'utf8');
        console.log(`\n💾 修复后的TXT文件已保存: ${txtFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(txtPath).size / 1024).toFixed(2)} KB`);
        
        // 转换为PDF
        console.log('\n🔄 转换为PDF...');
        const pdfBlob = await converter.convertCajToPdf(cajFile);
        
        // 保存PDF文件
        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
        const pdfFileName = `fixed_${path.basename(selectedFile, path.extname(selectedFile))}.pdf`;
        const pdfPath = path.join(process.cwd(), pdfFileName);
        fs.writeFileSync(pdfPath, new Uint8Array(pdfArrayBuffer));
        console.log(`💾 修复后的PDF文件已保存: ${pdfFileName}`);
        console.log(`  - 文件大小: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);
        
        // 分析修复效果
        console.log('\n📊 修复效果分析:');
        const txtContent = fs.readFileSync(txtPath, 'utf8');
        const pdfContent = new TextDecoder().decode(new Uint8Array(pdfArrayBuffer));
        
        const txtChineseChars = (txtContent.match(/[\u4e00-\u9fff]/g) || []).length;
        const pdfChineseChars = (pdfContent.match(/[\u4e00-\u9fff]/g) || []).length;
        
        console.log(`  - TXT中文字符: ${txtChineseChars} 个`);
        console.log(`  - PDF中文字符: ${pdfChineseChars} 个`);
        console.log(`  - TXT乱码检查: ${containsGarbledText(txtContent) ? '❌ 仍有乱码' : '✅ 无乱码'}`);
        console.log(`  - PDF乱码检查: ${containsGarbledText(pdfContent) ? '❌ 仍有乱码' : '✅ 无乱码'}`);
        
        // 内容预览
        console.log('\n📄 修复后内容预览:');
        const preview = txtContent.substring(0, 200);
        console.log(preview);
        if (txtContent.length > 200) {
            console.log('...(还有更多内容)');
        }
        
        // 成功判断
        const success = txtChineseChars > 100 && !containsGarbledText(txtContent) && pdfChineseChars > 50;
        
        console.log('\n🎉 编码修复测试完成！');
        
        if (success) {
            console.log('\n🎯 编码修复成功！');
            console.log('✅ 基于Python实现的精确解析生效');
            console.log('✅ 中文字符正确提取');
            console.log('✅ 乱码问题完全解决');
            console.log('✅ PDF和TXT文件质量优秀');
        } else {
            console.log('\n⚠️ 编码修复需要进一步优化');
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
    // 检查常见的乱码字符模式
    const garbledPatterns = [
        /[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g, // 非法字符
        /[\uFFFD]/g, // 替换字符
        /[^\x20-\x7E\u4e00-\u9fff\n\r\t]/g, // 非ASCII和非中文字符
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // 控制字符
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
testEncodingFix().then(success => {
    if (success) {
        console.log('\n🎊 编码修复完全成功！');
        console.log('基于Python实现的精确解析已经解决了乱码问题！');
        console.log('生成的PDF和TXT文件现在包含正确的中文内容。');
    } else {
        console.log('\n💥 编码修复失败，需要进一步调试');
    }
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\n💥 测试运行失败:', error);
    process.exit(1);
});
