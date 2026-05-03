import os
import re
import shutil
import tempfile
import argparse
from pathlib import Path

EASYOCR_MODEL_PATH = os.environ.get(
    'EASYOCR_MODULE_PATH',
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'easyocr_model')
)
os.environ['EASYOCR_MODULE_PATH'] = EASYOCR_MODEL_PATH

import easyocr
import fitz

def scan_images_for_chapters(image_dir, max_pages=None):
    temp_dir = tempfile.mkdtemp(prefix='ocr_')
    temp_image_dir = Path(temp_dir) / 'images'
    temp_image_dir.mkdir()

    image_dir = Path(image_dir)
    image_files = sorted(image_dir.glob('*.png'),
                        key=lambda x: int(re.search(r'(\d+)', x.name).group(1)))

    if max_pages:
        image_files = image_files[:max_pages]

    print(f'复制 {len(image_files)} 图片...')
    for i, img_path in enumerate(image_files):
        shutil.copy2(img_path, temp_image_dir / f'page_{i:04d}.png')

    page_files = sorted(temp_image_dir.glob('page_*.png'),
                       key=lambda x: int(x.stem.split('_')[1]))

    reader = easyocr.Reader(['ch_sim', 'en'], gpu=True)
    print(f'找到 {len(page_files)} 张图片, 使用GPU加速')

    all_results = []
    for i, img_path in enumerate(page_files):
        if i % 30 == 0:
            print(f'识别进度: {i+1}/{len(page_files)}', flush=True)

        result = reader.readtext(str(img_path), detail=0)
        text = '\n'.join(result)
        all_results.append({
            'page': i + 1,
            'file': img_path.name,
            'text': text
        })

    shutil.rmtree(temp_dir, ignore_errors=True)
    return all_results

def process_pdf_pages(pdf_path, pages='1-10'):
    temp_dir = tempfile.mkdtemp(prefix='ocr_')
    temp_image_dir = Path(temp_dir) / 'images'
    temp_image_dir.mkdir()

    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        page_range = parse_page_range(pages, total_pages)

        print(f'复制 {len(page_range)} 图片...')
        for page_num in page_range:
            page = doc[page_num]
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img_path = temp_image_dir / f'page_{page_num:04d}.png'
            pix.save(str(img_path))

        doc.close()

        page_files = sorted(temp_image_dir.glob('page_*.png'),
                          key=lambda x: int(x.stem.split('_')[1]))

        reader = easyocr.Reader(['ch_sim', 'en'], gpu=True)
        print(f'找到 {len(page_files)} 张图片, 使用GPU加速')

        all_results = []
        for i, img_path in enumerate(page_files):
            if i % 30 == 0:
                print(f'识别进度: {i+1}/{len(page_files)}', flush=True)

            result = reader.readtext(str(img_path), detail=0)
            text = '\n'.join(result)
            all_results.append({
                'page': i + 1,
                'file': img_path.name,
                'text': text
            })

        return all_results

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def parse_page_range(pages_str, total_pages):
    if pages_str == 'all':
        return list(range(total_pages))

    result = []
    parts = pages_str.split(',')
    for part in parts:
        part = part.strip()
        if '-' in part:
            start, end = part.split('-')
            start = int(start) - 1
            end = int(end)
            result.extend(range(start, min(end, total_pages)))
        else:
            result.append(int(part) - 1)

    return sorted(set(result))

def count_chinese_chars(text):
    return len(re.findall(r'[\u4e00-\u9fff]', text))

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
    for wrong, correct in OCR_ERROR_MAP.items():
        text = text.replace(wrong, correct)
    return text

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

def is_front_matter(text):
    patterns = [
        r'出版者的话',
        r'致中国读者',
        r'献给全世界的父母',
        r'序\s*言',
        r'前\s*言',
        r'导\s*读',
    ]
    for p in patterns:
        if re.search(p, text):
            return True
    return False

def is_toc(text):
    if re.search(r'目\s*录', text):
        return True
    return False

def detect_chapters(results):
    chapters = []
    current_chapter = None
    current_chapter_num = None

    front_matter_pages = set()
    toc_pages = set()
    in_toc = False

    for r in results:
        page_text = r['text']
        lines = page_text.split('\n')
        first_line = lines[0] if lines else ""

        if not front_matter_pages and is_front_matter(page_text):
            front_matter_pages.add(r['page'])
            continue

        if not toc_pages and is_toc(page_text):
            toc_pages.add(r['page'])
            in_toc = True
            continue

        if r['page'] in front_matter_pages:
            continue

        if in_toc:
            if count_chinese_chars(page_text) > 200:
                in_toc = False
            continue

        if r['page'] in toc_pages:
            continue

        chapter_num, chapter_title = find_chapter_info(first_line)

        if chapter_num and chapter_num != current_chapter_num:
            if current_chapter:
                chapters.append(current_chapter)

            current_chapter_num = chapter_num
            current_chapter = {
                'number': chapter_num,
                'title': chapter_title,
                'start_page': r['page'],
                'end_page': r['page'],
                'content': [{'page': r['page'], 'text': page_text}]
            }
            print(f"  发现章节: {chapter_title} (页码 {r['page']})")
        elif current_chapter:
            current_chapter['end_page'] = r['page']
            current_chapter['content'].append({'page': r['page'], 'text': page_text})

    if current_chapter:
        chapters.append(current_chapter)

    return chapters

def main():
    parser = argparse.ArgumentParser(description='EasyOCR Chapter Detection')
    parser.add_argument('--pdf', type=str, help='PDF file path')
    parser.add_argument('--notebook', type=str, help='Notebook output directory')
    parser.add_argument('--pages', type=str, default='1-10', help='Page range, e.g. 1-10 or 1,3,5')
    parser.add_argument('--images', type=str, help='Image directory path (alternative to PDF)')

    args = parser.parse_args()

    if args.pdf:
        pdf_path = args.pdf
        notebook_path = args.notebook
        pages = args.pages

        print("=" * 50)
        print("EasyOCR 章节检测")
        print("=" * 50)
        print(f"PDF: {pdf_path}")
        print(f"笔记本目录: {notebook_path}")
        print(f"页数: {pages}")

        print("\nStep 1: 识别图片...")
        results = process_pdf_pages(pdf_path, pages)
        print(f"\n共识别 {len(results)} 页")

        print("\nStep 2: 检测章节...")
        chapters = detect_chapters(results)
        print(f"发现 {len(chapters)} 个章节")

        if notebook_path:
            target_dir = notebook_path
        else:
            target_dir = os.path.dirname(pdf_path)

        os.makedirs(target_dir, exist_ok=True)

        pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]

        print("\nStep 3: 输出章节...")
        if chapters:
            for i, ch in enumerate(chapters):
                safe_title = re.sub(r'[<>:"/\\|?*]', '_', ch['title'])
                ch_file = os.path.join(target_dir, f"{pdf_basename}_chapter-{i+1:03d}_{safe_title}.md")

                full_text = '\n'.join([p['text'] for p in ch['content']])

                with open(ch_file, 'w', encoding='utf-8') as f:
                    f.write(f"# {ch['title']}\n\n")
                    f.write(f"**页码**: {ch['start_page']} - {ch['end_page']}\n\n")
                    f.write(full_text)

                print(f"保存: {ch_file}")
        else:
            md_file = os.path.join(target_dir, f"{pdf_basename}_full.md")
            all_text = '\n\n'.join([p['text'] for p in results])
            with open(md_file, 'w', encoding='utf-8') as f:
                f.write(f"# {pdf_basename}\n\n")
                f.write(all_text)
            print(f"保存: {md_file}")

        print(f"\n输出目录: {target_dir}")

    elif args.images:
        image_dir = args.images
        print("=" * 50)
        print("EasyOCR 章节检测 (图片模式)")
        print("=" * 50)

        print("\nStep 1: 识别图片...")
        results = scan_images_for_chapters(image_dir)
        print(f"\n共识别 {len(results)} 页")

        print("\nStep 2: 检测章节...")
        chapters = detect_chapters(results)
        print(f"发现 {len(chapters)} 个章节")

    else:
        parser.print_help()

if __name__ == "__main__":
    main()