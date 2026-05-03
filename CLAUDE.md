# Hermes Agent - AI Developer Guide

> **Important**: 本项目有完整的文档体系，AI开发者应阅读以下文档：
> - `README.md` - 项目总览和快速开始
> - `ARCHITECTURE.md` - 系统架构和数据流
> - `ALGORITHMS.md` - 核心算法详解
> - `PROJECT_MAP.md` - 子项目关系图谱

## 项目概述
Hermes Agent 是一个多功能的 AI 助手项目，包含知识库管理、PDF处理、OCR识别等多种能力。

## 子项目结构

```
d:\hermes agent\
├── hermes-agent-main/          # 核心Agent框架
├── wiki个人知识库/              # 知识库管理系统
│   └── MODULE.md              # Wiki模块详细说明
├── opendataloader-pdf-main/   # PDF解析处理
│   └── MODULE.md              # PDF模块详细说明
├── easyocr_model/             # OCR模型
├── docker/                    # Docker配置
└── .trae/skills/              # Agent技能
```

## 快速开始

### 启动知识库API
```bash
cd d:\hermes agent\wiki个人知识库
npm start
# 运行在 http://localhost:18090
```

### 测试PDF上传
```bash
node d:\hermes agent\wiki个人知识库\test-pdf.cjs
```

## 核心算法位置

| 算法 | 文件位置 |
|------|----------|
| PDF类型检测 | `opendataloader-pdf-main/scripts/pdf_dispatch.py::check_pdf_has_text()` |
| 文字型章节划分 | `wiki个人知识库/knowledge-api.js::splitByChapters()` |
| 扫描型章节划分 | `opendataloader-pdf-main/scripts/easyocr_chapter_scan.py::detect_chapters()` |
| PDF分发逻辑 | `opendataloader-pdf-main/scripts/pdf_dispatch.py::process_pdf()` |

## 架构要点

### PDF处理流程
1. `knowledge-api.js` 接收上传
2. 调用 `pdf_dispatch.py` 进行类型检测和分发
3. 文字型PDF → fitz提取 → `splitByChapters()` 章节划分
4. 扫描型PDF → EasyOCR识别 → `detect_chapters()` 章节划分

### 关键配置
- Python聊天环境: `D:\anaconda\envs\chatpdf\python.exe`
- Python Torch环境: `D:\anaconda\envs\torch310\python.exe`
- Java环境: `D:\JDK21_Final`
- EasyOCR模型路径: `d:\hermes agent\easyocr_model`

## 环境依赖

### Python 环境

| 环境名称 | Python版本 | 路径 | 用途 |
|----------|------------|------|------|
| hermes | Python 3.10 | `D:\anaconda\envs\hermes\` | Hermes Agent 运行时（专用） |
| torch310 | Python 3.10.20 | `D:\anaconda\envs\torch310\` | 扫描型PDF处理（OCR） |
| chatpdf | Python 3.8.20 | `D:\anaconda\envs\chatpdf\` | PDF文字型处理 |
| base | Python 3.9.23 | `D:\anaconda\` | 系统基础环境 |

### hermes 环境需要安装的库

需要安装的库：
```bash
pip install openai python-dotenv fire httpx rich tenacity prompt_toolkit pyyaml requests jinja2 pydantic>=2.0 PyJWT[crypto] debugpy firecrawl-py parallel-web>=0.4.2 fal-client edge-tts croniter python-telegram-bot[webhooks]>=22.6 discord.py>=2.0 aiohttp>=3.9.0
```

或使用 requirements.txt：
```bash
cd d:\hermes agent\hermes-agent-main\hermes-agent-main
pip install -r requirements.txt
```

### 快速启动 Hermes

```powershell
# 1. 激活环境
conda activate hermes

# 2. 设置环境变量
$env:HERMES_HOME = "d:\hermes agent\.hermes"
$env:PYTHONIOENCODING = "utf-8"
$env:CHCP = "65001"

# 3. 启动 Hermes
python -m hermes_cli.main chat --toolsets hermes-cli
```

---

## 创建 Hermes 专属环境

### 环境要求
- **Python 版本**: 3.10+
- **推荐环境名**: `hermes`

### 需要安装的库

```bash
openai python-dotenv fire httpx rich tenacity prompt_toolkit pyyaml requests jinja2 pydantic>=2.0 PyJWT[crypto] debugpy firecrawl-py parallel-web>=0.4.2 fal-client edge-tts croniter python-telegram-bot[webhooks]>=22.6 discord.py>=2.0 aiohttp>=3.9.0
```

### 创建命令

```powershell
# 1. 创建环境
conda create -n hermes python=3.10 -y

# 2. 激活并安装依赖
conda activate hermes
pip install openai python-dotenv fire httpx rich tenacity prompt_toolkit pyyaml requests jinja2 pydantic>=2.0 PyJWT[crypto] debugpy firecrawl-py parallel-web>=0.4.2 fal-client edge-tts croniter python-telegram-bot[webhooks]>=22.6 discord.py>=2.0 aiohttp>=3.9.0
```

## 开发约定

1. 修改 `pdf_dispatch.py` 后，PDF分发逻辑自动生效
2. 修改 `knowledge-api.js` 后需重启API服务
3. 修改Python脚本后无需重启，直接生效

## 调试

查看API日志:
```bash
# API运行在 terminal_id=4
```

测试PDF处理:
```bash
python d:\hermes agent\opendataloader-pdf-main\scripts\pdf_dispatch.py <pdf_path> <output_dir>
```
