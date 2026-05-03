# Hermes Agent - 项目关系图谱

## 子项目概览

| 子项目 | 路径 | 功能 |
|--------|------|------|
| hermes-agent-main | `hermes-agent-main/` | 核心Agent框架 |
| wiki个人知识库 | `wiki个人知识库/` | 知识库管理API |
| opendataloader-pdf-main | `opendataloader-pdf-main/` | PDF解析处理引擎 |
| easyocr_model | `easyocr_model/` | OCR识别模型 |
| .hermes/skills | `.hermes/skills/` | Agent技能定义 |

---

## 项目依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                      用户请求                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              hermes-agent-main (Agent框架)                  │
│  - CLI入口 (hermes_cli)                                     │
│  - 工具管理 (tools/)                                        │
│  - 会话管理 (session.py)                                    │
│  - MCP适配器 (acp_adapter/)                                 │
└──────────────┬────────────────────────┬────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│   wiki个人知识库          │  │   opendataloader-pdf-main        │
│   knowledge-api.js       │  │   pdf_dispatch.py                │
│   - /api/upload-pdf       │  │   - check_pdf_has_text()        │
│   - splitByChapters()     │  │   - process_pdf_with_fitz()      │
│   - 笔记CRUD API          │  │   - process_pdf_with_easyocr()   │
└──────────────┬───────────┘  └───────────────┬──────────────────┘
               │                              │
               │                              ▼
               │              ┌───────────────────────────────┐
               │              │   easyocr_model/              │
               │              │   - Chinese OCR recognition    │
               │              └───────────────────────────────┘
               │
               ▼
┌───────────────────────────────┐
│   knowledge/                  │
│   - Markdown笔记存储           │
│   - 分类目录结构               │
│   - sources/ (源文件)          │
└───────────────────────────────┘
```

---

## hermes-agent-main

核心Agent框架，提供CLI和工具管理能力。

### 核心模块
- `hermes_cli/` - 命令行入口
- `tools/` - 工具集（file_tools, wiki_tools, terminal_tool等）
- `acp_adapter/` - MCP协议适配器
- `gateway/` - 网关服务

### 入口
```bash
cd hermes-agent-main/hermes-agent-main
python hermes
```

---

## wiki个人知识库

知识库管理系统，提供笔记和PDF处理API。

### 核心文件
- `knowledge-api.js` - 主API服务（端口18090）
- `test-pdf.cjs` - PDF上传测试

### API端点
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/upload-pdf` | POST | 上传PDF并处理 |
| `/api/notes` | GET | 获取笔记列表 |
| `/api/notebooks` | GET | 获取笔记本列表 |
| `/api/search` | GET | 搜索内容 |

### 目录结构
```
knowledge/
├── Knowledge/           # 知识分类目录
│   └── [分类]/
│       └── [笔记本]/
│           └── notes/   # 笔记文件
├── sources/            # 源文件（PDF等）
└── wiki/               # Wiki概念文档
```

---

## opendataloader-pdf-main

PDF解析处理引擎，支持文字型和扫描型PDF。

### 核心脚本
| 脚本 | 功能 |
|------|------|
| `pdf_dispatch.py` | PDF类型检测和分发 |
| `easyocr_chapter_scan.py` | OCR识别+章节检测 |
| `test_chapter_detection.py` | 章节检测测试 |

### PDF处理流程
```
pdf_dispatch.py::process_pdf()
    │
    ├── check_pdf_has_text()
    │       ↓
    │   (文字页 > 50%?)
    │
    ├── [YES] → process_pdf_with_fitz()
    │       提取文字 → knowledge-api.js::splitByChapters()
    │
    └── [NO]  → process_pdf_with_easyocr()
            EasyOCR识别 → easyocr_chapter_scan.py::detect_chapters()
```

### Python环境要求
- Python 3.10+
- 依赖: `easyocr`, `pymupdf`

---

## easyocr_model

中文OCR识别模型文件。

### 模型文件
- `chinese_sim/chinese_sim.pth` - 中文识别模型
- `craft_mlt_25k/craft_mlt_25k.pth` - 文本检测模型

### 使用方式
通过 `opendataloader-pdf-main/scripts/easyocr_chapter_scan.py` 调用。

---

## .hermes/skills

Agent技能定义目录，包含50+预置技能模块。

### 技能分类
| 分类 | 示例技能 |
|------|----------|
| Apple生态 | apple-notes, apple-reminders, imessage |
| AI Agent | claude-code, codex, hermes-agent |
| 创意工具 | ascii-art, manim-video, p5js |
| 开发工具 | github-code-review, bug-fix-debugging |
| 研究工具 | arxiv, research-paper-writing |

### 技能结构
每个技能包含 `SKILL.md` 定义技能行为。

---

## 配置文件

### 环境变量
在 `.hermes/.env` 中配置：

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | ✅ 必需 |
| `OPENAI_BASE_URL` | API 基础URL | 可选 |
| `EASYOCR_MODULE_PATH` | OCR模型路径 | 可选 |

### 端口
- `18090` - knowledge-api.js 服务端口
- `3000` - hermes-agent-main Web端口（如有）

---

## 相关文档

- [系统架构](ARCHITECTURE.md)
- [核心算法](ALGORITHMS.md)
- [开发者指南](CLAUDE.md)
