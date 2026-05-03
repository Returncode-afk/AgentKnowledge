import os
import sys
import glob

EASYOCR_MODEL_PATH = os.environ.get(
    'EASYOCR_MODULE_PATH',
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'easyocr_model')
)
os.environ['EASYOCR_MODULE_PATH'] = EASYOCR_MODEL_PATH

import fitz
import easyocr

def process_pdf_easyocr(pdf_path, output_dir, pages='1-10'):
    """使用 EasyOCR 处理 PDF"""
    print("=" * 50)
    print("EasyOCR 处理模块")
    print("=" * 50)
    print(f"PDF: {pdf_path}")
    print(f"输出目录: {output_dir}")
    print(f"处理页数: {pages}")

    os.makedirs(output_dir, exist_ok=True)

    reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    print("EasyOCR 模型加载完成")

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    print(f"PDF 总页数: {total_pages}")

    page_range = parse_page_range(pages, total_pages)
    print(f"将处理页数: {page_range}")

    all_text = []
    for i, page_num in enumerate(page_range):
        if (i + 1) % 10 == 0 or i == 0:
            print(f"处理中... ({i + 1}/{len(page_range)})", flush=True)

        page = doc[page_num]
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img_path = os.path.join(output_dir, f"page_{page_num}.png")
        pix.save(img_path)

        result = reader.readtext(img_path, detail=0)
        page_text = "\n".join(result)

        img_size = os.path.getsize(img_path)
        print(f"  页 {page_num + 1}: {len(result)} 文本块, 图片 {img_size} bytes")

        os.remove(img_path)

        all_text.append(f"## Page {page_num + 1}\n\n{page_text}")

    doc.close()

    content = "\n\n".join(all_text)

    md_file = os.path.join(output_dir, "easyocr_result.md")
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n完成! 输出: {md_file}")
    print(f"总字符数: {len(content)}")

    return content, md_file

def parse_page_range(pages_str, total_pages):
    """解析页数字符串，如 '1-10' -> [0,1,2,...,9]"""
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

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='EasyOCR PDF Processor')
    parser.add_argument('pdf_path', nargs='?', help='PDF file path')
    parser.add_argument('--output', '-o', default='./output', help='Output directory')
    parser.add_argument('--pages', '-p', default='1-10', help='Page range, e.g. 1-10 or all')
    
    args = parser.parse_args()
    
    if args.pdf_path:
        content, md_file = process_pdf_easyocr(args.pdf_path, args.output, args.pages)
        print("\n" + "=" * 50)
        print("内容预览 (前500字):")
        print("=" * 50)
        print(content[:500])
    else:
        parser.print_help()