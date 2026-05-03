const fs = require('fs');

const content = fs.readFileSync('temp_full_test/temp-生意的本质：商业模式动态升级的底层逻辑(1).md', 'utf8');
const lines = content.split('\n');

function chineseToArabic(numStr) {
    const mapping = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10', '零': '0' };
    let result = '';
    for (const c of numStr) { result += mapping[c] || c; }
    if (result === '10') return '10';
    return result.replace(/^0+/, '') || '0';
}

function findChapterInfo(text) {
    const match = text.match(/^第([一二三四五六七八九十百千零\d]+)章/);
    if (match) {
      const numStr = match[1];
      const arabic = /^\d+$/.test(numStr) ? numStr : chineseToArabic(numStr);
      return [parseInt(arabic), match[0]];
    }
    return [null, null];
}

const chapters = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const result = findChapterInfo(line);
    if (result && result[0]) {
        chapters.push({
            lineIndex: i,
            chapterNum: result[0],
            title: line
        });
    }
}

console.log('Total chapter occurrences:', chapters.length);
chapters.forEach((ch, i) => {
    console.log(`[${ch.lineIndex}] Chapter ${ch.chapterNum}: "${ch.title.substring(0, 80)}"`);
});