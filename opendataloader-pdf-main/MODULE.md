# opendataloader-pdf-main - 模块说明

## 模块概述

PDF解析处理引擎，支持文字型和扫描型PDF的解析与章节划分。

**与Wiki知识库集成**: 本模块被 `wiki个人知识库/knowledge-api.js` 调用，处理PDF的解析和分发。

---

## 核心脚本

| 脚本 | 功能 |
|------|------|
| `pdf_dispatch.py` | PDF类型检测和分发入口 |
| `easyocr_chapter_scan.py` | 扫描型PDF的OCR识别+章节检测 |

### pdf_dispatch.py

**职责**: PDF类型检测，文字型/扫描型分发

**函数**:
- `check_pdf_has_text(pdf_path)` - 判断PDF类型（>50%页有文字=文字型）
- `process_pdf(pdf_path, notebook_path, pages)` - 分发入口
- `process_pdf_with_fitz(pdf_path, notebook_path, pages)` - 文字型处理
- `process_pdf_with_easyocr(pdf_path, notebook_path, pages)` - 扫描型处理
- `process_pdf_with_opendataloader(pdf_path, notebook_path, pages)` - opendataloader处理

### easyocr_chapter_scan.py

**职责**: 扫描型PDF的OCR识别和章节检测

**参数**:
```
--pdf <pdf_path>       PDF文件路径
--notebook <output_dir> 输出目录
--pages <range>         页码范围，默认1-31
```

**函数**:
- `detect_chapters(results)` - 章节检测算法
- `is_front_matter(text)` - 前导页检测
- `is_toc(text)` - 目录检测
- `find_chapter_info(text)` - 章节号识别

---

## 环境依赖

### Python 环境

| 环境名称 | Python版本 | 路径 | 用途 |
|----------|------------|------|------|
| chatpdf | Python 3.8.20 | `D:\anaconda\envs\chatpdf\` | 文字型PDF处理（opendataloader） |
| torch310 | Python 3.10.20 | `D:\anaconda\envs\torch310\` | 扫描型PDF处理（EasyOCR） |

### 库依赖

#### chatpdf 环境（文字型PDF处理）

需要安装的库：
```bash
pip install opendataloader-pdf>=1.4.0
```

#### torch310 环境（扫描型PDF处理 - OCR）

需要安装的库：
```bash
pip install easyocr torch pillow
```

### 模型文件

| 模型 | 路径 | 用途 |
|------|------|------|
| EasyOCR模型 | `d:\hermes agent\easyocr_model\` | OCR识别 |

### 快速安装

```powershell
# 文字型PDF处理环境
conda activate chatpdf
pip install opendataloader-pdf>=1.4.0

# 扫描型PDF处理环境（OCR）
conda activate torch310
pip install easyocr torch pillow
```

---

## 使用示例

### 命令行测试PDF分发
```bash
# 激活环境
conda activate chatpdf

# 运行分发脚本
python d:\hermes agent\opendataloader-pdf-main\scripts\pdf_dispatch.py <pdf_path> <output_dir>
```

### 单独运行OCR章节检测
```bash
# 激活OCR环境
conda activate torch310

# 运行OCR脚本
python d:\hermes agent\opendataloader-pdf-main\scripts\easyocr_chapter_scan.py --pdf test.pdf --notebook output/ --pages 1-50
```

---

## 相关文档

- [整体架构](../../ARCHITECTURE.md)
- [核心算法](../../ALGORITHMS.md)
- [项目关系图谱](../../PROJECT_MAP.md)
- [Wiki知识库模块](../../wiki个人知识库/MODULE.md)
