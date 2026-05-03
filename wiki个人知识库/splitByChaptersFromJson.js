export async function splitByChaptersFromJson(content, jsonStr, pdfId, filename, pdfFileName) {
  if (!jsonStr) {
    const { splitByChapters } = await import('./splitByChapters.js');
    return splitByChapters(content, pdfId, filename, pdfFileName);
  }

  try {
    const json = JSON.parse(jsonStr);
    const kids = json.kids || [];

    const pageBreaks = new Map();

    for (const item of kids) {
      const pageNum = item["page number"];
      if (pageNum && item.content) {
        if (!pageBreaks.has(pageNum)) {
          pageBreaks.set(pageNum, []);
        }
        if (item.type === "heading" || item.type === "title") {
          pageBreaks.get(pageNum).push({
            text: item.content,
            level: item["heading level"] || 1
          });
        }
      }
    }

    if (pageBreaks.size === 0) {
      const { splitByChapters } = await import('./splitByChapters.js');
      return splitByChapters(content, pdfId, filename, pdfFileName);
    }

    const lines = content.split('\n');
    const chapterBoundaries = [];
    let currentChapter = null;
    let currentChapterStart = 0;

    const CHAPTER_HEADER_PATTERN = /^第[一二三四五六七八九十百千零\d]+章[\s　]+/;
    const CHAPTER_NUMBER_ONLY_PATTERN = /^第[一二三四五六七八九十百千零\d]+章$/;
    const PART_PATTERN = /^第[一二三四五六七八九十百千零\d]+部分[\s　]+/;
    const TABLE_OF_CONTENTS_PATTERN = /^\d+\.\d+\s+/;
    const MIN_CHAPTER_CONTENT_LINES = 5;

    function isChapterTitleContinuation(nextNonEmptyLine, chapterNum) {
      if (!nextNonEmptyLine) return false;
      const numPart = chapterNum.replace(/[^第一二三四五六七八九十百千零\d]/g, '');
      const simplePattern = new RegExp(`^第${numPart}[^章]*$`);
      if (simplePattern.test(nextNonEmptyLine)) return true;
      if (nextNonEmptyLine.startsWith(chapterNum)) return true;
      return false;
    }

    function isConsecutiveChapterLine(currentLine, nextLine) {
      if (!currentLine || !nextLine) return false;
      const currentMatch = currentLine.match(/^第([一二三四五六七八九十百千零\d]+)章/);
      const nextMatch = nextLine.match(/^第([一二三四五六七八九十百千零\d]+)章/);
      if (!currentMatch || !nextMatch) return false;
      const currentNum = currentMatch[1];
      const nextNum = nextMatch[1];
      const chineseToNumber = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
      const currentVal = parseInt(currentNum) || chineseToNumber[currentNum] || parseInt(currentNum.replace(/[零九十]/g, m => ({ '零': '0', '九': '9', '十': '10' })[m]));
      const nextVal = parseInt(nextNum) || chineseToNumber[nextNum] || parseInt(nextNum.replace(/[零九十]/g, m => ({ '零': '0', '九': '9', '十': '10' })[m]));
      return nextVal > currentVal && nextVal <= currentVal + 1;
    }

    function findNextNonEmptyLine(startIndex) {
      for (let j = startIndex; j < lines.length; j++) {
        if (lines[j].trim().length > 0) {
          return { index: j, line: lines[j].trim() };
        }
      }
      return null;
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      const chapterMatch = trimmedLine.match(CHAPTER_HEADER_PATTERN);
      const partMatch = trimmedLine.match(PART_PATTERN);
      const chapterNumOnlyMatch = trimmedLine.match(CHAPTER_NUMBER_ONLY_PATTERN);

      if (chapterMatch || partMatch) {
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (chapterMatch && isConsecutiveChapterLine(trimmedLine, nextLine)) {
            continue;
          }
        }
        if (currentChapter !== null) {
          chapterBoundaries.push({
            title: currentChapter,
            startLine: currentChapterStart,
            endLine: i - 1
          });
        }
        currentChapter = (chapterMatch ? chapterMatch[0] : partMatch[0]).trim();
        currentChapterStart = i;
      } else if (chapterNumOnlyMatch) {
        const nextInfo = findNextNonEmptyLine(i + 1);

        if (nextInfo && isChapterTitleContinuation(nextInfo.line, chapterNumOnlyMatch[1])) {
          continue;
        }

        if (nextInfo && TABLE_OF_CONTENTS_PATTERN.test(nextInfo.line)) {
          continue;
        }

        if (currentChapter !== null) {
          const contentLength = i - currentChapterStart;
          if (contentLength >= MIN_CHAPTER_CONTENT_LINES) {
            chapterBoundaries.push({
              title: currentChapter,
              startLine: currentChapterStart,
              endLine: i - 1
            });
          }
        }

        currentChapter = chapterNumOnlyMatch[1];
        currentChapterStart = i;
      }
    }

    if (currentChapter !== null) {
      chapterBoundaries.push({
        title: currentChapter,
        startLine: currentChapterStart,
        endLine: lines.length - 1
      });
    }

    if (chapterBoundaries.length === 0) {
      chapterBoundaries.push({
        title: filename.replace(/\.pdf$/i, ""),
        startLine: 0,
        endLine: lines.length - 1
      });
    }

    const chapters = [];
    for (let i = 0; i < chapterBoundaries.length; i++) {
      const boundary = chapterBoundaries[i];
      const chapterLines = lines.slice(boundary.startLine, boundary.endLine + 1);
      const chapterText = `<!-- parent-pdf: ${pdfFileName} -->\n<!-- chapter: ${boundary.title} -->\n${chapterLines.join('\n').trim()}`;

      chapters.push({
        filename: `${pdfId}-chapter-${String(i + 1).padStart(3, "0")}.md`,
        title: boundary.title,
        chapter: i + 1,
        pdfFileName,
        content: chapterText
      });
    }

    return chapters;
  } catch (e) {
    console.error("Error parsing JSON for chapter split:", e.message);
    const { splitByChapters } = await import('./splitByChapters.js');
    return splitByChapters(content, pdfId, filename, pdfFileName);
  }
}