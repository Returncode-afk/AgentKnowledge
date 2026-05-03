import os
import sys
import glob
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent

EASYOCR_CHAPTER_SCRIPT = str(SCRIPT_DIR / 'easyocr_chapter_scan.py')
EASYOCR_MODULE_PATH = os.environ.get(
    'EASYOCR_MODULE_PATH',
    str(PROJECT_ROOT / 'easyocr_model')
)

PYTHON_TORCH = os.environ.get('PYTHON_TORCH', sys.executable)
PYTHON_CHATPDF = os.environ.get('PYTHON_CHATPDF', sys.executable)

def check_pdf_has_text(pdf_path):
    import fitz
    doc = fitz.open(pdf_path)
    total = len(doc)
    text_pages = 0
    for page in doc:
        if page.get_text().strip():
            text_pages += 1
    doc.close()
    print(f"  总页数: {total}, 有文字页: {text_pages}")
    return text_pages > total * 0.5

def process_pdf_with_easyocr(pdf_path, notebook_path, pages=None):
    import fitz
    if pages is None:
        total = len(fitz.open(pdf_path))
        pages = f'1-{total}'
    print("\n→ 分发到 EasyOCR")
    cmd = [PYTHON_TORCH, EASYOCR_CHAPTER_SCRIPT, '--pdf', pdf_path, '--notebook', notebook_path, '--pages', pages]
    env = os.environ.copy()
    env['EASYOCR_MODULE_PATH'] = EASYOCR_MODULE_PATH
    subprocess.run(cmd, env=env)

def process_pdf_with_fitz(pdf_path, notebook_path, pages=None):
    import fitz
    print("\n→ 直接用 fitz 提取文字")
    doc = fitz.open(pdf_path)
    total = len(doc)
    
    if pages:
        page_range = pages.split('-')
        start_page = int(page_range[0]) - 1 if len(page_range) > 0 else 0
        end_page = int(page_range[1]) if len(page_range) > 1 else total
    else:
        start_page = 0
        end_page = total

    all_text = []
    for page_num in range(start_page, min(end_page, total)):
        page = doc[page_num]
        text = page.get_text()
        all_text.append(text)

    doc.close()

    if all_text:
        content = "\n\n".join(all_text)
        pdf_name = os.path.basename(pdf_path).replace('.pdf', '')
        output_file = os.path.join(notebook_path, f"temp-{pdf_name}.md")
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"保存: {output_file}")
    else:
        print("未提取到文字内容")

def process_pdf_with_opendataloader(pdf_path, notebook_path, pages='1-10'):
    print("\n→ 分发到 opendataloader")
    os.makedirs(notebook_path, exist_ok=True)
    temp_dir = os.path.join(os.path.dirname(pdf_path), "temp_opendata")
    os.makedirs(temp_dir, exist_ok=True)
    cmd = f'set "JAVA_HOME=D:\\JDK21_Final" && set "PATH=D:\\JDK21_Final\\bin;%PATH%" && "{PYTHON_CHATPDF}" -c "import opendataloader_pdf; opendataloader_pdf.convert(input_path=[\'{pdf_path}\'], output_dir=\'{temp_dir}\', format=\'markdown\', pages=\'{pages}\')"'
    subprocess.run(cmd, shell=True, timeout=120)
    md_files = glob.glob(os.path.join(temp_dir, "*.md"))
    if md_files:
        final_md = os.path.join(notebook_path, os.path.basename(md_files[0]))
        with open(md_files[0], 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        with open(final_md, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"保存: {final_md}")

def process_pdf(pdf_path, notebook_path, pages=None):
    print("=" * 50)
    print("PDF 处理分发系统")
    print("=" * 50)
    print(f"PDF: {pdf_path}")
    print(f"输出: {notebook_path}")

    print("\n检测 PDF 类型...")
    has_text = check_pdf_has_text(pdf_path)

    if has_text:
        process_pdf_with_fitz(pdf_path, notebook_path, pages)
    else:
        process_pdf_with_easyocr(pdf_path, notebook_path, pages)

    print("\n处理完成!")

def main():
    if len(sys.argv) >= 2:
        process_pdf(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(sys.argv[1]))
    else:
        print("用法: python pdf_dispatch.py <pdf_path> [output_dir] [pages]")
        print("示例: python pdf_dispatch.py document.pdf ./output 1-10")

if __name__ == "__main__":
    main()