// 测试中文文本提取
import fs from 'fs';

const filePath = 'tests/caj/_1949-1965年甘肃省农业税研究.caj';
const data = fs.readFileSync(filePath);

console.log('文件大小:', data.length, 'bytes');

// 测试不同的编码方式
const encodings = ['utf-8', 'gb18030', 'gbk', 'gb2312'];

for (const encoding of encodings) {
    try {
        const decoder = new TextDecoder(encoding, { fatal: false });
        const text = decoder.decode(data);
        
        // 提取中文字符
        const chineseMatches = text.match(/[\u4e00-\u9fff]+/g);
        if (chineseMatches) {
            const chineseText = chineseMatches.join('');
            console.log(`\n${encoding} 编码:`);
            console.log(`  - 中文字符数: ${chineseText.length}`);
            console.log(`  - 前100字符: ${chineseText.substring(0, 100)}`);
            
            // 检查是否包含常见的中文字符
            const commonChars = ['的', '是', '在', '有', '和', '了', '不', '人', '一', '个'];
            const commonCount = commonChars.filter(char => chineseText.includes(char)).length;
            console.log(`  - 常见中文字符数: ${commonCount}/10`);
            
            if (commonCount >= 5) {
                console.log(`  ✅ ${encoding} 可能是正确的编码`);
                
                // 进一步清理
                const cleaned = chineseText
                    .replace(/[^\u4e00-\u9fff\s\w\.,;:!?()（）【】""''""—–\-\n\r\t]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                console.log(`  - 清理后长度: ${cleaned.length}`);
                console.log(`  - 清理后前100字符: ${cleaned.substring(0, 100)}`);
                
                // 保存测试结果
                fs.writeFileSync(`test_${encoding}.txt`, cleaned, 'utf8');
                console.log(`  - 已保存到: test_${encoding}.txt`);
            }
        }
    } catch (e) {
        console.log(`${encoding} 编码失败:`, e.message);
    }
}
