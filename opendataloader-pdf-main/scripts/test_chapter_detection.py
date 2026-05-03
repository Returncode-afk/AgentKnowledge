import re

OCR_ERROR_MAP = {
    '笫': '第',
    ' ]': '1',
    ']': '1',
    '卜': '1',
    '一': '1',
    '二': '2',
    '三': '3',
    '四': '4',
    '五': '5',
    '六': '6',
    '七': '7',
    '八': '8',
    '九': '9',
    '〇': '0',
    '零': '0',
    ' ': '',
}

def fix_ocr_text(text):
    result = text
    for wrong, correct in OCR_ERROR_MAP.items():
        result = result.replace(wrong, correct)
    return result

def count_chinese_chars(text):
    return len(re.findall(r'[\u4e00-\u9fff]', text))

def chinese_to_arabic(num_str):
    mapping = {'一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
              '六': '6', '七': '7', '八': '8', '九': '9', '十': '10', '零': '0'}
    result = ''
    for c in num_str:
        result += mapping.get(c, c)
    return result

def find_chapter_info(text):
    text = fix_ocr_text(text)

    chapter_match = re.search(r'第([一二三四五六七八九十百千\d]+)\s*[章部]', text)
    if chapter_match:
        num_str = chapter_match.group(1)
        arabic = chinese_to_arabic(num_str)
        chapter_title = chapter_match.group(0).replace(' ', '')
        return arabic, chapter_title
    return None, None

def is_chapter_start_line(line, current_ch_num):
    line = fix_ocr_text(line)
    line = line.strip()

    if not line:
        return False, None, None

    chapter_num, chapter_title = find_chapter_info(line)

    if not chapter_num:
        return False, None, None

    if chapter_num == current_ch_num:
        return False, chapter_num, chapter_title

    return True, chapter_num, chapter_title

def test_algorithm():
    test_cases = [
        ("笫1章\n富爸爸,穷爸爸", None, True, "第1章"),
        ("第1章\n蠹爸爸_穷爸爸", "1", False, None),
        ("第 ]章\n富爸爸_穷爸爸", "1", False, "第1章"),
        ("第 2章\n笫一课:", "1", True, "第2章"),
        ("第2章\n笫一课:", "1", True, "第2章"),
        ("窝爸;爸,穷爸爸", None, False, None),
        ("笫1章\n这是内容...", None, True, "第1章"),
        ("", None, False, None),
    ]

    print("测试 is_chapter_start_line 函数:")
    print("=" * 60)

    all_pass = True
    for text, current_ch, expected_is_start, expected_title in test_cases:
        lines = text.split('\n')
        first_line = lines[0] if lines else ""

        is_start, ch_num, ch_title = is_chapter_start_line(first_line, current_ch)

        passed = is_start == expected_is_start
        if expected_title:
            passed = passed and ch_title == expected_title

        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} text={repr(first_line[:20])} current={current_ch}")
        print(f"   is_start={is_start} ch_num={ch_num} ch_title={ch_title}")
        print(f"   expected: is_start={expected_is_start} title={expected_title}")

        if not passed:
            all_pass = False
        print()

    return all_pass

def test_full_detection():
    print("\n测试完整章节检测:")
    print("=" * 60)

    sample_pages = [
        {"page": 1, "text": "出版者的话\n..."},
        {"page": 2, "text": "致中国读者\n..."},
        {"page": 3, "text": "目  录\n第1章\n第2章\n第3章"},
        {"page": 4, "text": "第1章\n富爸爸,穷爸爸\n选择他们两位..."},
        {"page": 5, "text": "蠹爸爸_穷爸爸\n这是第一章节的正文内容..."},
        {"page": 6, "text": "第2章\n笫一课:\n富人不为钱工作"},
        {"page": 7, "text": "笫一课:\n怎样才能娈得富有?"},
        {"page": 8, "text": "第2章\n这是第二章节的正文内容..."},
    ]

    chapters = []
    current_chapter = None
    current_chapter_num = None

    for r in sample_pages:
        page_text = r['text']
        lines = page_text.split('\n')
        first_line = lines[0] if lines else ""

        is_start, ch_num, ch_title = is_chapter_start_line(first_line, current_chapter_num)

        if is_start:
            if current_chapter:
                chapters.append(current_chapter)

            current_chapter_num = ch_num
            current_chapter = {
                'title': ch_title,
                'start_page': r['page'],
                'content': [page_text]
            }
            print(f"发现章节: {ch_title} (页码 {r['page']})")
        elif current_chapter:
            current_chapter['content'].append(page_text)

    if current_chapter:
        chapters.append(current_chapter)

    print(f"\n检测到 {len(chapters)} 个章节")
    for ch in chapters:
        print(f"  - {ch['title']}: 页 {ch['start_page']}")

    expected = 2
    if len(chapters) == expected:
        print(f"[PASS] 测试通过! 期望{expected}个章节，实际{len(chapters)}个")
        return True
    else:
        print(f"[FAIL] 测试失败! 期望{expected}个章节，实际{len(chapters)}个")
        return False

if __name__ == "__main__":
    print("小样本测试 - 章节检测算法")
    print("=" * 60)

    result1 = test_algorithm()
    result2 = test_full_detection()

    if result1 and result2:
        print("\n" + "=" * 60)
        print("[PASS] 所有测试通过!")
    else:
        print("\n" + "=" * 60)
        print("❌ 部分测试失败!")