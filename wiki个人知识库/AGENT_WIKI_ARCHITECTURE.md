# Agent + Wiki 架构协作文档

## 1. 整体架构图

```mermaid
flowchart TB
    subgraph Client["用户交互层"]
        USER[用户 / AI 对话]
    end

    subgraph Hermes["Hermes Agent 核心"]
        CLI[CLI 入口]
        AGENT[Agent Core<br/>max_turns 控制]
        MODEL[Model Backend<br/>豆包/Claude/GPT]
        REGISTRY[Tool Registry<br/>工具调度中心]
    end

    subgraph WikiTools["Wiki 工具层"]
        WT[wiki_tools.py<br/>10 个工具函数]
        HTTP[HTTP Client<br/>localhost:18090]
    end

    subgraph WikiServer["Wiki API 服务层"]
        KAPI[knowledge-api.js<br/>REST API 服务器]
        ROUTER[路由层]
        PERSIST[持久化层]
    end

    subgraph Knowledge["知识库存储层"]
        KB[knowledge/<br/>Markdown 文件]
        NOTE[笔记 .md]
        META[.meta.json]
    end

    USER <--> CLI
    CLI <--> AGENT
    AGENT <--> MODEL
    AGENT <--> REGISTRY
    REGISTRY --> WT
    WT --> HTTP
    HTTP --> KAPI
    KAPI --> ROUTER
    ROUTER --> PERSIST
    PERSIST --> KB

    style Hermes fill:#87CEEB,stroke:#333
    style WikiTools fill:#FFD700,stroke:#333
    style WikiServer fill:#90EE90,stroke:#333
    style Knowledge fill:#DDA0DD,stroke:#333
```

---

## 2. 工具调用时序图（问答场景）

```mermaid
sequenceDiagram
    participant U as 用户
    participant CLI as Hermes CLI
    participant AC as Agent Core
    participant REG as Tool Registry
    participant WT as Wiki Tools
    participant API as Wiki API
    participant FS as File System

    Note over U,FS: RAG 问答场景：用户问 "我报名了哪些挑战赛？"

    U->>CLI: "我报名了哪些挑战赛？"
    CLI->>AC: process_message("我报名了哪些挑战赛？")
    AC->>REG: dispatch("wiki_search_notes", {query: "挑战赛 报名"})
    REG->>WT: _handle_wiki_search_notes({query: "挑战赛 报名"})

    WT->>API: POST /api/search<br/>{query: "挑战赛 报名", limit: 10}
    API->>FS: readdir(knowledge/**/*.{md,json})
    FS-->>API: 文件列表
    API-->>WT: [{title, snippet, id}]

    Note over WT: Fallback: 直接扫描文件内容
    WT->>FS: _search_files_fallback()
    FS-->>WT: [{title: "2026年4月14日日记",<br/>snippet: "报名参加了solo挑战赛"}]

    WT-->>REG: ## Search Results for: 挑战赛 报名\n\n### 2026年4月14日日记\n```\n报名参加了solo挑战赛...\n```
    REG-->>AC: tool_result
    AC->>MODEL: 整合上下文生成回答
    MODEL-->>AC: "根据你的日记记录，你报名参加了 solo 挑战赛..."

    AC-->>CLI: "根据你的日记记录，你报名参加了 solo 挑战赛..."
    CLI-->>U: 显示回答

    Note over U,FS: 完整读取笔记场景

    U->>CLI: "查看4月14日的日记"
    CLI->>AC: process_message()
    AC->>REG: dispatch("wiki_read_note", {notebook_id, note_id})
    REG->>WT: _handle_wiki_read_note()
    WT->>API: GET /api/notes/{notebook_id}/{note_id}
    API->>FS: readFile(note.md)
    FS-->>API: # 2026年4月14日日记\n内容...
    API-->>WT: {id, title, content}
    WT-->>REG: # 2026年4月14日日记\n今天测试好了我的个人agent...
    REG-->>AC: tool_result
    AC-->>MODEL: 整合上下文
    MODEL-->>CLI: "你的4月14日日记写道：今天测试好了我的个人agent..."
    CLI-->>U: 显示完整日记
```

---

## 3. Wiki RAG 工作流程

```mermaid
flowchart LR
    subgraph Input["用户问题"]
        Q[问题：solo挑战赛是什么？]
    end

    subgraph Search["搜索阶段"]
        SW[wiki_search_notes]
        SF[fallback 扫描文件]
        KBE[知识库检索]
    end

    subgraph Context["上下文构建"]
        CB[组合片段]
        SYS[注入 system prompt]
    end

    subgraph LLM["大模型生成"]
        GEN[生成回答]
    end

    Q --> SW
    SW -->|404| SF
    SW -->|200| KBE
    SF --> KBE
    KBE --> CB
    CB --> SYS
    SYS --> GEN

    style RAG fill:#FFD700
    style LLM fill:#87CEEB
```

### RAG 关键点

1. **搜索策略**：优先调用 Wiki API 的 `/api/search`，若返回 404 则使用 fallback 直接扫描文件
2. **上下文注入**：搜索结果以 Markdown 格式返回，直接拼入 prompt
3. **模型生成**：Agent Core 将 wiki 内容作为 context 传给 LLM 生成回答

---

## 4. 核心文件职责表

| 文件路径 | 职责 | 类型 |
|---------|------|------|
| `hermes-cli/` | CLI 入口、配置加载 | 核心 |
| `agent/` | Agent 逻辑、工具调度、max_turns | 核心 |
| `model_tools.py` | 工具注册发现机制 | 核心 |
| `tools/wiki_tools.py` | Wiki 工具封装（10个） | 工具层 |
| `toolsets.py` | 工具集定义 | 配置层 |
| `hermes_cli/tools_config.py` | 工具集可见性配置 | 配置层 |
| `wiki个人知识库/knowledge-api.js` | REST API 服务器（Node.js） | 服务层 |
| `wiki个人知识库/knowledge/` | Markdown 笔记存储 | 数据层 |

---

## 5. 10 个 Wiki 工具清单

| 工具名 | 功能 | API 端点 |
|--------|------|---------|
| `wiki_list_notebooks` | 列出所有笔记本 | GET /api/notebooks |
| `wiki_list_notes` | 列出笔记本下所有笔记 | GET /api/notebooks/{nb}/notes |
| `wiki_read_note` | 读取指定笔记内容 | GET /api/notes/{nb}/{noteId} |
| `wiki_write_note` | 创建新笔记 | POST /api/notebooks/{nb}/notes |
| `wiki_update_note` | 更新笔记内容 | PUT /api/notes/{nb}/{noteId} |
| `wiki_delete_note` | 删除笔记 | DELETE /api/notes/{nb}/{noteId} |
| `wiki_search_notes` | 全文搜索笔记 | POST /api/search |
| `wiki_get_categories` | 获取分类列表 | GET /api/categories |
| `wiki_compile` | 触发 Wiki 编译 | POST /api/compile |
| `wiki_sync` | 同步 Wiki 数据 | 内部逻辑 |

---

## 6. API 端点与文件映射

```mermaid
flowchart LR
    subgraph API["API 端点"]
        GET_NB["GET /api/notebooks"]
        GET_NOTES["GET /api/notebooks/{nb}/notes"]
        GET_NOTE["GET /api/notes/{nb}/{noteId}"]
        POST_NOTE["POST /api/notebooks/{nb}/notes"]
        PUT_NOTE["PUT /api/notes/{nb}/{noteId}"]
        DELETE_NOTE["DELETE /api/notes/{nb}/{noteId}"]
        SEARCH["POST /api/search"]
        COMPILE["POST /api/compile"]
    end

    subgraph FS["文件系统"]
        NB_DIR["knowledge/{category}/{subfolder}/{notebook}/"]
        NOTE_FILE["notes/{noteId}.md"]
        META[".meta.json"]
    end

    GET_NB --> NB_DIR
    GET_NOTES --> NOTE_FILE
    GET_NOTE --> NOTE_FILE
    POST_NOTE --> NOTE_FILE
    PUT_NOTE --> NOTE_FILE
    DELETE_NOTE --> NOTE_FILE
    SEARCH --> NB_DIR
    COMPILE --> NB_DIR

    style API fill:#90EE90
    style FS fill:#DDA0DD
```

---

## 7. 协作关键流程

### 7.1 Agent 启动阶段

```
1. hermes CLI 启动
2. model_tools.py 的 _discover_tools() 扫描 tools/ 目录
3. wiki_tools.py 被加载，10 个工具注册到 Tool Registry
4. hermes_cli/tools_config.py 中 wiki toolset 设为可见
5. Agent Ready
```

### 7.2 用户提问阶段

```
1. 用户: "我在 solo 挑战赛做了什么准备？"
2. Hermes Agent Core 收到消息
3. 判断需要调用 wiki_search_notes
4. Tool Registry 调度到 wiki_tools._handle_wiki_search_notes()
5. HTTP POST localhost:18090/api/search
6. Wiki API 扫描 knowledge/ 目录
7. 返回搜索结果（标题 + 内容片段）
8. 结果注入 LLM prompt 作为 context
9. LLM 生成回答
10. 返回给用户
```

### 7.3 写日记阶段

```
1. 用户: "帮我写日记：今天报名了 solo 挑战赛"
2. Hermes 解析为 wiki_write_note 工具调用
3. Tool Registry 调度到 wiki_tools._handle_wiki_write_note()
4. HTTP POST localhost:18090/api/notebooks/{nb}/notes
5. Wiki API 创建 notes/note-{timestamp}.md
6. 返回 {id: "note-xxx", success: true}
7. Agent 确认写入成功
8. 返回给用户
```

---

## 8. 错误处理与 Fallback

```mermaid
flowchart TB
    START[调用 wiki_search_notes] --> API_CALL{API /api/search}

    API_CALL -->|200 OK| SUCCESS[返回搜索结果]
    API_CALL -->|404 Not Found| FALLBACK[使用 _search_files_fallback]
    FALLBACK --> FS_SCAN[扫描 knowledge/ 目录]
    FS_SCAN --> MATCH[匹配关键词]
    MATCH -->|有结果| SUCCESS
    MATCH -->|无结果| EMPTY[返回空结果]

    SUCCESS --> RETURN[返回 Markdown 格式结果]
    EMPTY --> RETURN

    style FALLBACK fill:#FFD700
    style RETURN fill:#90EE90
```

---

## 9. 整体数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户 / AI 对话                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hermes Agent Core                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. 接收用户问题                                            │  │
│  │ 2. 判断是否需要调用 Wiki 工具                               │  │
│  │ 3. 调度 Tool Registry                                      │  │
│  │ 4. 整合工具返回结果作为 context                             │  │
│  │ 5. 调用 LLM 生成回答                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Registry                                │
│  wiki_list_notebooks / wiki_search_notes / wiki_read_note / ... │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    wiki_tools.py                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ - 参数校验                                                 │  │
│  │ - 构造 HTTP 请求                                           │  │
│  │ - 错误处理 / Fallback                                      │  │
│  │ - 结果格式化（Markdown）                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    knowledge-api.js                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ REST API (:18090)                                          │  │
│  │ - GET/POST/PUT/DELETE /api/*                               │  │
│  │ - 文件系统读写                                              │  │
│  │ - LLM 编译（/api/compile）                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    knowledge/ 目录                               │
│  Knowledge/ 个人成长/ 日记/ notes/ note-xxx.md                   │
│  Software/ ...                                                   │
│  LifeOS/ ...                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. PDF 处理与章节划分

### 9.1 PDF处理流程

```mermaid
flowchart TB
    subgraph Upload["PDF上传"]
        PDF[PDF文件]
        NOTEBOOK[笔记本ID]
    end

    subgraph Dispatch["类型分发"]
        PY[pdf_dispatch.py]
        CHECK[类型检测]
    end

    subgraph TextPDF["文字型PDF"]
        SPLIT1[splitByChapters.js]
        CHAPTERS1[章节划分]
    end

    subgraph ScanPDF["扫描型PDF"]
        OCR[EasyOCR]
        SPLIT2[splitByChaptersFromJson.js]
        CHAPTERS2[章节划分]
    end

    PDF --> PY
    NOTEBOOK --> PY
    PY --> CHECK
    CHECK -->|文字型| SPLIT1
    CHECK -->|扫描型| OCR
    OCR --> SPLIT2
    SPLIT1 --> CHAPTERS1
    SPLIT2 --> CHAPTERS2
```

### 9.2 章节划分算法

| 算法 | 文件 | 适用场景 |
|------|------|----------|
| 文字型章节检测 | `splitByChapters.js` | 可提取文本的PDF |
| 扫描型章节检测 | `splitByChaptersFromJson.js` | OCR处理的扫描件 |

**splitByChapters.js 核心逻辑**:
1. 识别前页（版权、目录）
2. 正则匹配 `第X章` 标题
3. 过滤目录条目（以句号结尾）
4. 按章节边界切分

**splitByChaptersFromJson.js 核心逻辑**:
1. 解析OCR生成的JSON文件
2. 提取章节标题和层级
3. 当无JSON时，**自动fallback**到 `splitByChapters()`

### 9.3 文件分发逻辑

knowledge-api.js 根据文件名前缀分发到不同处理函数：

| 文件类型 | 匹配规则 | 处理函数 |
|----------|----------|----------|
| `temp-*.md` (非章节) | `startsWith('temp-')` 且不含 `_chapter-` | `splitByChapters()` |
| `*_full.md` | `endsWith('_full.md')` | `splitByChaptersFromJson()` |
| `*-chapter-*.md` / `*_chapter-*.md` | 匹配 `/[_-]chapter-\d+/i` | 直接使用 |

### 9.4 EasyOCR配置

- **默认扫描页数**: `1-50` (在 `pdf_dispatch.py` 中配置)
- **检测阈值**: 文字页超过50%走fitz，否则走EasyOCR

### 9.3 API端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/upload-pdf` | POST | 上传PDF并自动章节划分 |

---

## 10. 关键配置

### hermes_cli/tools_config.py
```python
CONFIGURABLE_TOOLSETS = [
    # ...
    ("wiki", "📚 Wiki Knowledge", "list_notebooks, list_notes, read_note, search_notes, write_note, update_note, delete_note"),
]
```

### wiki_tools.py 环境变量
```python
WIKI_API_URL = "http://localhost:18090"
WIKI_API_KEY = "hiclaw-knowledge-api"
```

---

## 11. LLM 编译流程

### 11.1 编译触发方式

**方式一：前端 UI**
```
打开 http://localhost:18090/ui.html
→ 选择笔记本和笔记
→ 点击"编译"按钮
→ 调用 POST /api/compile/{notePath}
```

**方式二：API 直接调用**
```bash
curl -X POST "http://localhost:18090/api/compile/{notePath}" \
  -H "Authorization: Bearer hiclaw-knowledge-api"
```

### 11.2 编译完整数据流

```mermaid
flowchart TB
    subgraph Frontend["前端 UI"]
        CLICK[点击编译]
        NOTE_PATH[notePath: category/subfolder/notebook/noteId]
    end

    subgraph API["knowledge-api.js"]
        ROUTE[/api/compile/{notePath}]
        FIND[findNoteById]
        WRITE[写入 sources/]
        SPAWN[spawn Python]
    end

    subgraph Python["compile_with_llm.py"]
        SCAN[扫描 sources/*.md]
        EXTRACT[LLM 概念提取]
        GEN[生成 wiki/concepts/*.md]
        UPDATE[index.md 更新]
    end

    subgraph LLM["火山引擎 API"]
        MODEL[doubao-seed-2-0-lite-260215]
    end

    CLICK --> ROUTE
    ROUTE --> FIND
    FIND --> WRITE
    WRITE --> SPAWN
    SPAWN --> SCAN
    SCAN --> EXTRACT
    EXTRACT --> MODEL
    MODEL --> GEN
    GEN --> UPDATE
```

### 11.3 核心文件

| 文件 | 作用 |
|------|------|
| `knowledge-api.js` | API 入口，路由 `/api/compile/*` |
| `compile_with_llm.py` | LLM 编译主脚本 |
| `llm-wiki-compiler-main/` | Wiki 编译器子项目 |
| `llm-wiki-compiler-main/sources/` | 待编译源文件 |
| `llm-wiki-compiler-main/wiki/concepts/` | 生成的概念文件 |

### 11.4 API Key 配置

**配置文件**: `~/.hermes/.env`

```bash
OPENAI_API_KEY=火山引擎 API Key
```

**配置来源优先级**:
1. `~/.hermes/.env` 文件（优先使用）
2. 环境变量 `OPENAI_API_KEY`

**错误排查**:
- 如果遇到 `401 AuthenticationError: API key format incorrect`，说明 key 无效
- 确认使用的是 `~/.hermes/.env` 中的 key，不是系统环境变量中的 key

### 11.5 路径大小写注意

`getCategoryPath()` 函数支持大小写不敏感匹配：

```javascript
// CATEGORIES 定义
{ id: "knowledge", name: "Knowledge" }

// 可以匹配
- "knowledge/..."
- "Knowledge/..."
- "KNOWLEDGE/..."
```

### 11.6 编译输出示例

编译成功后会在 `llm-wiki-compiler-main/wiki/concepts/` 生成：

```
concepts/
├── index.md                          # 概念索引
├── 原生家庭理财观念.md                # 概念页面
├── 学校理财教育缺失.md
├── 积极致富思维.md
├── 贫富金钱观对立.md
└── 自住房负债论.md
```

**概念文件格式**:
```markdown
# 概念名称

概念定义

## 来源

来自: [[源笔记标题]]

## 相关概念

[[相关概念A]] [[相关概念B]]

---
*由Wiki编译器自动生成*
```

---

## 总结

Agent 与 Wiki 的协作核心是 **RAG（Retrieval-Augmented Generation）** 模式：

1. **用户提问** → Agent 解析意图
2. **检索** → Wiki 工具搜索相关笔记
3. **增强** → 搜索结果作为上下文注入 prompt
4. **生成** → LLM 基于上下文生成回答

整个流程对用户透明，用户感受到的是"Agent 能读懂我的 Wiki 并回答相关问题"。
