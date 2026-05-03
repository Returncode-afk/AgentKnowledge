# Hermes Agent - 整体架构

## 1. 系统分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     用户交互层                              │
│         (CLI / Web UI / API Client)                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Hermes Agent 核心                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   CLI       │  │  Agent Core │  │   Tool Registry     │  │
│  │   入口      │  │  对话管理    │  │   工具调度          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Wiki Tools    │  │ PDF Tools     │  │ Other Tools   │
│ wiki_tools.py │  │ (待集成)      │  │               │
└───────┬───────┘  └───────────────┘  └───────────────┘
        │                 │
        │                 │
        ▼                 ▼
┌───────────────┐  ┌───────────────────────────────────────┐
│ knowledge-api │  │ opendataloader-pdf-main              │
│ (端口18090)   │  │ pdf_dispatch.py                       │
│ - 笔记CRUD    │  │   ├── 文字型PDF → fitz + splitByChapters │
│ - PDF上传     │  │   └── 扫描型PDF → EasyOCR + detect_chapters │
│ - 搜索       │  │                                       │
└───────────────┘  └───────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                     知识库存储层                             │
│  knowledge/                                                 │
│  ├── Knowledge/[分类]/[笔记本]/notes/*.md                   │
│  ├── sources/ (原始文件)                                    │
│  └── wiki/ (概念文档)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 详细架构组件

### 2.1 Hermes Agent 核心 (hermes-agent-main/)

| 组件 | 路径 | 职责 |
|------|------|------|
| CLI入口 | `hermes_cli/main.py` | 命令行解析和主入口 |
| Agent Core | `agent/` | 对话管理、上下文控制 |
| Tool Registry | `tools/registry.py` | 工具注册和调度 |
| Wiki Tools | `tools/wiki_tools.py` | 10个Wiki操作工具 |
| ACP Adapter | `acp_adapter/` | MCP协议适配 |

### 2.2 Wiki 知识库 (wiki个人知识库/)

| 组件 | 路径 | 职责 |
|------|------|------|
| API服务 | `knowledge-api.js` | REST API服务器(端口18090) |
| 笔记存储 | `knowledge/` | Markdown文件存储 |
| PDF处理器 | - | 调用pdf_dispatch.py |

### 2.3 PDF处理引擎 (opendataloader-pdf-main/)

| 组件 | 路径 | 职责 |
|------|------|------|
| 分发器 | `scripts/pdf_dispatch.py` | PDF类型检测和路由 |
| 文字提取 | `scripts/pdf_dispatch.py::process_pdf_with_fitz()` | fitz提取文字 |
| OCR识别 | `scripts/easyocr_chapter_scan.py` | EasyOCR识别 |
| 章节检测 | `scripts/easyocr_chapter_scan.py::detect_chapters()` | 扫描型章节划分 |

---

## 3. 数据流

### 3.1 PDF上传处理流

```
用户上传PDF
    │
    ▼
knowledge-api.js::/api/upload-pdf
    │
    ▼
pdf_dispatch.py::process_pdf()
    │
    ▼
check_pdf_has_text()  ──►  文字页>50%?
    │
    ├──[YES]──► process_pdf_with_fitz()
    │                 │
    │                 ▼
    │            提取文字 → temp-{pdf_name}.md
    │                 │
    │                 ▼
    │            splitByChapters() 章节划分
    │                 │
    └──[NO]──► process_pdf_with_easyocr()
                    │
                    ▼
              easyocr_chapter_scan.py
                    │
                    ▼
              detect_chapters() 章节划分
```

### 3.2 问答搜索流

```
用户问: "xxx"
    │
    ▼
Hermes Agent Core
    │
    ▼
wiki_tools.py::_handle_wiki_search_notes()
    │
    ▼
knowledge-api.js::/api/search
    │
    ▼
扫描 knowledge/**/*.md 文件
    │
    ▼
返回匹配结果
```

---

## 4. 端口和服务

| 服务 | 端口 | 启动命令 |
|------|------|----------|
| knowledge-api | 18090 | `cd wiki个人知识库 && npm start` |
| hermes-agent | 3000(?) | `cd hermes-agent-main && python hermes` |

---

## 5. 相关文档

- [Wiki+Agent协作架构](wiki个人知识库/AGENT_WIKI_ARCHITECTURE.md)
- [项目关系图谱](PROJECT_MAP.md)
- [核心算法](ALGORITHMS.md)
- [CLAUDE.md](CLAUDE.md)
