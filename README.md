# Hermes Agent

个人AI助手系统，包含知识库管理、PDF处理、Agent框架等模块。

## 文档索引

| 文档 | 用途 | 阅读顺序 |
|------|------|----------|
| [CLAUDE.md](CLAUDE.md) | AI开发者指南（面向AI的提示） | ⭐ 首选 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统架构和数据流 | 🔍 架构师 |
| [PROJECT_MAP.md](PROJECT_MAP.md) | 子项目依赖关系 | 🗺️ 项目概览 |
| [ALGORITHMS.md](ALGORITHMS.md) | 核心算法详解 | 💻 开发者 |

## 子项目文档

| 模块 | 文档 |
|------|------|
| Wiki知识库 | [wiki个人知识库/MODULE.md](wiki个人知识库/MODULE.md) |
| PDF处理 | [opendataloader-pdf-main/MODULE.md](opendataloader-pdf-main/MODULE.md) |

## 快速开始

### 1. 环境配置

```bash
# 复制环境变量模板
cp .hermes/.env.example .hermes/.env

# 编辑 .hermes/.env，填入您的 API Key
# OPENAI_API_KEY=your-api-key-here
```

### 2. 安装依赖

```powershell
# Windows 用户
.\install.ps1

# 或手动安装
pip install -r hermes-agent-main/hermes-agent-main/requirements.txt
```

### 3. OCR 模型配置（可选）

PDF OCR 功能需要 EasyOCR 模型，首次使用时会自动下载到 `easyocr_model/` 目录。

如需手动配置：

```bash
# 设置模型存储路径（可选，默认为项目根目录下的 easyocr_model/）
# Windows
set EASYOCR_MODULE_PATH=d:\hermes agent\easyocr_model

# Linux/macOS
export EASYOCR_MODULE_PATH=/path/to/easyocr_model
```

模型文件约 **500MB**，包含：
- 中文简体 (`ch_sim`)
- 英文 (`en`)

### 启动Wiki知识库API
```bash
cd wiki个人知识库
npm install
npm start
# http://localhost:18090
```

### PDF处理（命令行）
```bash
python opendataloader-pdf-main/scripts/pdf_dispatch.py <pdf_path> <output_dir>
```

## 项目结构

```
hermes-agent/
├── .hermes/                    # Hermes 配置目录
│   ├── .env.example            # 环境变量模板
│   └── skills/                 # 技能模块
├── hermes-agent-main/          # Agent框架
├── wiki个人知识库/              # 知识库API
├── opendataloader-pdf-main/    # PDF处理引擎
├── easyocr_model/              # OCR模型（首次使用自动下载）
└── .trae/skills/               # Agent技能
```

## 环境变量说明

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | ✅ 必需 |
| `OPENAI_BASE_URL` | API 基础URL（兼容OpenAI的服务） | 可选 |
| `HERMES_MAX_ITERATIONS` | Agent最大迭代次数 | 可选，默认90 |
| `EASYOCR_MODULE_PATH` | OCR模型存储路径 | 可选，默认 `./easyocr_model` |
| `PYTHON_EXE` | Python解释器路径 | 可选，默认 `python` |
| `WIKI_API_URL` | Wiki API 地址 | 可选，默认 `http://localhost:18090` |
| `WIKI_BASE_DIR` | Wiki知识库目录 | 可选，默认 `./wiki个人知识库/knowledge` |

## 常见问题

### OCR 模型下载慢？

EasyOCR 模型托管在 GitHub，国内下载可能较慢。可以：
1. 使用代理下载
2. 手动下载模型文件到 `easyocr_model/` 目录

### PDF 处理失败？

确保已安装依赖：
```bash
pip install easyocr pymupdf
```

### Wiki API 启动失败？

确保已安装 Node.js 依赖：
```bash
cd wiki个人知识库
npm install
```
