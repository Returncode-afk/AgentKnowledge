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
AgentKnowledge/
├── .hermes/                   # Hermes 配置目录
│   └── skills/                # 技能模块
├── hermes-agent-main/         # 核心Agent框架
├── wiki个人知识库/             # 知识库管理系统
├── opendataloader-pdf-main/   # PDF解析处理
└── easyocr_model/             # OCR模型（首次使用自动下载）
```

## 快速开始

### 启动知识库API
```bash
cd wiki个人知识库
npm install
npm start
# 运行在 http://localhost:18090
```

### PDF处理（命令行）
```bash
python opendataloader-pdf-main/scripts/pdf_dispatch.py <pdf_path> <output_dir>
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

## 环境依赖

### Python 环境

**要求**: Python 3.10+

```bash
# 创建虚拟环境
conda create -n hermes python=3.10 -y
conda activate hermes

# 安装依赖
pip install -r hermes-agent-main/hermes-agent-main/requirements.txt
```

### Node.js 环境

**要求**: Node.js 18+

```bash
cd wiki个人知识库
npm install
```

### 环境变量配置

复制环境变量模板并配置：

```bash
cp .hermes/.env.example .hermes/.env
```

编辑 `.hermes/.env`，填入必要的 API Key：

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | ✅ 必需 |
| `OPENAI_BASE_URL` | API 基础URL（兼容服务） | 可选 |

## 开发约定

1. 修改 `pdf_dispatch.py` 后，PDF分发逻辑自动生效
2. 修改 `knowledge-api.js` 后需重启API服务
3. 修改Python脚本后无需重启，直接生效

## 许可证

本项目基于 MIT 许可证开源。
