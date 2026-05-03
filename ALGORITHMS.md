# Hermes Agent - 核心算法文档

## 算法概览

| 算法 | 文件位置 | 用途 |
|------|----------|------|
| PDF类型检测 | `opendataloader-pdf-main/scripts/pdf_dispatch.py::check_pdf_has_text()` | 判断PDF是文字型还是扫描型 |
| 文字型章节划分 | `wiki个人知识库/knowledge-api.js::splitByChapters()` | 文字型PDF的章节划分 |
| 扫描型章节划分 | `opendataloader-pdf-main/scripts/easyocr_chapter_scan.py::detect_chapters()` | 扫描型PDF的OCR+章节划分 |
| PDF分发逻辑 | `opendataloader-pdf-main/scripts/pdf_dispatch.py::process_pdf()` | 根据类型分发到不同处理器 |

---

## 1. PDF类型检测算法

**文件**: `opendataloader-pdf-main/scripts/pdf_dispatch.py`

**函数**: `check_pdf_has_text(pdf_path)`

### 算法逻辑
```python
def check_pdf_has_text(pdf_path):
    import fitz
    doc = fitz.open(pdf_path)
    total = len(doc)
    text_pages = 0
    for page in doc:
        if page.get_text().strip():  # 检查页面是否有文字
            text_pages += 1
    doc.close()
    # 判断标准: 文字页占比 > 50%
    return text_pages > total * 0.5
```

### 判断标准
- **文字型PDF**: 超过50%的页面包含可提取文字
- **扫描型PDF**: 大部分页面无文字，需要OCR识别

---

## 2. 文字型PDF章节划分算法

**文件**: `wiki个人知识库/knowledge-api.js`

**函数**: `splitByChapters(content, pdfId, filename, pdfFileName)`

### 支持的章节格式
- `第X章` - 标准章节
- `第X部分` - 部分划分
- `第X章 标题` - 带标题的章节
- 中文数字: 一、二、三、四...十

### 算法流程
```javascript
function splitByChapters(content, pdfId, filename, pdfFileName) {
    // 1. 预处理：使用正则分割内容
    const CHAPTER_SPLIT_REGEX = /(第[一二三四五六七八九十百千零\d]+章)/;
    const parts = processedContent.split(CHAPTER_SPLIT_REGEX);

    // 2. 检测章节标题模式
    const CHAPTER_HEADER_PATTERN = /^第[一二三四五六七八九十百千零\d]+章[\s　]+/;
    const CHAPTER_NUMBER_ONLY_PATTERN = /^第[一二三四五六七八九十百零\d]+章$/;
    const PART_PATTERN = /^第[一二三四五六七八九十百千零\d]+部分[\s　]+/;

    // 3. 识别章节边界
    for (let i = 0; i < lines.length; i++) {
        if (chapterMatch || partMatch) {
            // 记录章节开始位置
            currentChapter = chapterMatch[0];
            currentChapterStart = i;
        }
    }

    // 4. 提取章节内容
    // 最小章节长度: MIN_CHAPTER_LENGTH = 200字符
}
```

### 章节识别规则
1. 跳过封面、序言、前言等前导内容
2. 检测"第X章"或"第X部分"标题
3. 处理连续章节行（标题分多行）
4. 过滤目录页（TOC pattern: `1.1 `）
5. 最小章节内容: 5行或200字符

### OCR错误修正（用于章节号转换）
```javascript
OCR_ERROR_MAP = {
    '笫': '第',  // OCR识别错误
    '一': '1', '二': '2', ... '十': '10'
};
```

---

## 3. 扫描型PDF章节划分算法

**文件**: `opendataloader-pdf-main/scripts/easyocr_chapter_scan.py`

**函数**: `detect_chapters(results)`

### 算法流程
```python
def detect_chapters(results):
    chapters = []
    current_chapter = None
    current_chapter_num = None
    front_matter_pages = set()  # 前导页（序言、献词等）
    toc_pages = set()           # 目录页
    in_toc = False

    for r in results:
        page_text = r['text']
        first_line = page_text.split('\n')[0]

        # 1. 检测并跳过前导页
        if is_front_matter(page_text):
            front_matter_pages.add(r['page'])
            continue

        # 2. 检测并跳过目录页
        if is_toc(page_text):
            toc_pages.add(r['page'])
            in_toc = True
            continue

        # 3. 章节号识别
        chapter_num, chapter_title = find_chapter_info(first_line)

        # 4. 新章节检测
        if chapter_num and chapter_num != current_chapter_num:
            if current_chapter:
                chapters.append(current_chapter)
            current_chapter = {
                'number': chapter_num,
                'title': chapter_title,
                'start_page': r['page'],
                'content': []
            }
        elif current_chapter:
            # 追加到当前章节
            current_chapter['content'].append(page_text)
            current_chapter['end_page'] = r['page']
```

### 辅助函数
```python
def is_front_matter(text):
    # 检测: 出版者的话、致中国读者、序言、前言、导读
    patterns = [r'出版者的话', r'致中国读者', r'序\s*言', r'前\s*言', r'导\s*读']
    return any(re.search(p, text) for p in patterns)

def is_toc(text):
    # 检测目录: 目  录
    return bool(re.search(r'目\s*录', text))

def find_chapter_info(text):
    # 识别: 第X章 / 第X部
    match = re.search(r'第([一二三四五六七八九十百千\d]+)\s*[章部]', text)
    if match:
        num_str = match.group(1)
        arabic = chinese_to_arabic(num_str)
        return arabic, match.group(0)
    return None, None

def chinese_to_arabic(num_str):
    # 中文数字转阿拉伯数字: 一 → 1, 十 → 10
    mapping = {'一': '1', '二': '2', ..., '十': '10', '零': '0'}
```

---

## 4. PDF分发逻辑

**文件**: `opendataloader-pdf-main/scripts/pdf_dispatch.py`

**函数**: `process_pdf(pdf_path, notebook_path, pages='1-100')`

### 分发流程
```python
def process_pdf(pdf_path, notebook_path, pages='1-100'):
    print("检测 PDF 类型...")
    has_text = check_pdf_has_text(pdf_path)

    if has_text:
        # 文字型PDF → fitz直接提取
        process_pdf_with_fitz(pdf_path, notebook_path, pages)
    else:
        # 扫描型PDF → EasyOCR识别
        process_pdf_with_easyocr(pdf_path, notebook_path, pages)
```

---

## 5. 算法对比

| 维度 | 文字型 | 扫描型 |
|------|--------|--------|
| 文字提取 | fitz (PyMuPDF) | EasyOCR |
| 章节检测 | splitByChapters() | detect_chapters() |
| 处理位置 | knowledge-api.js | easyocr_chapter_scan.py |
| 输出格式 | temp-{pdf_name}.md | temp-{pdf_name}_chapter-{n}.md |
| 前导页处理 | 无 | is_front_matter() |
| 目录检测 | 无 | is_toc() |

---

## 6. 使用示例

### 测试PDF分发
```bash
python d:\hermes agent\opendataloader-pdf-main\scripts\pdf_dispatch.py <pdf_path> <output_dir>
```

### 测试章节检测
```python
# 文字型
python -c "
from opendataloader.pdf_dispatch import check_pdf_has_text
print(check_pdf_has_text('test.pdf'))
"

# 扫描型
python d:\hermes agent\opendataloader-pdf-main\scripts\easyocr_chapter_scan.py --pdf test.pdf --notebook output/
```
