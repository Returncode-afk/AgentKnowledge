function splitByChapters(content, pdfId, filename, pdfFileName) {
  const chapters = [];
  const MIN_CHAPTER_LENGTH = 200;

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

  function isFrontMatter(text) {
    const patterns = ['版权信息', '出版者的话', '致中国读者', '献给', '鸣\\s*谢'];
    return patterns.some(p => new RegExp(p).test(text));
  }

  function isToc(text) {
    return /^目\s*录\s*$/.test(text) || /^目  录\s*$/.test(text);
  }

  function isTocEntry(line) {
    const trimmed = line.trim();
    if (trimmed.endsWith('。')) return true;
    if (/^第[一二三四五六七八九十百千零\d]+章.{10,}[\u4e00-\u9fa5]$/.test(trimmed)) return true;
    if (/^第[一二三四五六七八九十百零\d]+章[^a-zA-Z0-9\u4e00-\u9fa5]*[，。；,;]/.test(trimmed)) return true;
    if (/^第[一二三四五六七八九十百零\d]+章.{0,30}(?:讲的是|介绍的是|说明的是|探讨的是|讲述的是)/.test(trimmed)) return true;
    return false;
  }

  const lines = content.split('\n');
  const chapterBoundaries = [];
  let inFrontMatter = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (inFrontMatter && isFrontMatter(line)) {
      continue;
    }

    if (inFrontMatter && isToc(line)) {
      inFrontMatter = false;
      continue;
    }

    if (isToc(line)) {
      continue;
    }

    inFrontMatter = false;

    const result = findChapterInfo(line);
    if (result && result[0]) {
      if (isTocEntry(line)) continue;
      chapterBoundaries.push({
        lineIndex: i,
        chapterNum: result[0],
        title: line
      });
    }
  }

  if (chapterBoundaries.length === 0) {
    return [{
      filename: `${pdfId}-chapter-001.md`,
      title: filename.replace(/\.pdf$/i, ''),
      chapter: 1,
      pdfFileName,
      content: `<!-- parent-pdf: ${pdfFileName} -->\n<!-- chapter: untitled -->\n${content}`
    }];
  }

  for (let i = 0; i < chapterBoundaries.length; i++) {
    const start = chapterBoundaries[i];
    const end = chapterBoundaries[i + 1];
    const startLine = start.lineIndex;
    const endLine = end ? end.lineIndex : lines.length;

    let chapterContent = lines.slice(startLine + 1, endLine).join('\n').trim();

    for (let j = 0; j < chapterBoundaries.length; j++) {
      if (j === i) continue;
      chapterContent = chapterContent.replace(new RegExp(`^第[一二三四五六七八九十百千零\\d]+章\\s*`, 'gm'), '');
    }

    if (chapterContent.length >= MIN_CHAPTER_LENGTH) {
      chapters.push({
        filename: `${pdfId}-chapter-${String(i + 1).padStart(3, '0')}.md`,
        title: start.title,
        chapter: i + 1,
        pdfFileName,
        content: `<!-- parent-pdf: ${pdfFileName} -->\n<!-- chapter: ${start.title} -->\n${chapterContent}`
      });
    }
  }

  if (chapters.length === 0) {
    return [{
      filename: `${pdfId}-chapter-001.md`,
      title: filename.replace(/\.pdf$/i, ''),
      chapter: 1,
      pdfFileName,
      content: `<!-- parent-pdf: ${pdfFileName} -->\n<!-- chapter: untitled -->\n${content}`
    }];
  }

  return chapters;
}

export { splitByChapters };