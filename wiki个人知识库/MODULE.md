# Wiki个人知识库 - 模块说明

## 模块概述

知识库管理系统，提供笔记CRUD、PDF处理、搜索等API服务。

---

## 核心文件

| 文件 | 职责 |
|------|------|
| `knowledge-api.js` | 主API服务（端口18090） |
| `test-pdf.cjs` | PDF上传测试脚本 |
| `AGENT_WIKI_ARCHITECTURE.md` | Agent+Wiki协作架构 |
| `知识库架构.md` | 知识库运转架构详细文档 |

---

## API服务

**入口**: `knowledge-api.js`

**端口**: `18090`

**启动**: `npm start`

### 主要端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/upload-pdf` | POST | 上传PDF，自动章节划分 |
| `/api/notebooks` | GET | 获取笔记本列表 |
| `/api/notebooks/:id/notes` | GET/POST | 获取/创建笔记 |
| `/api/notes/:notebookId/:noteId` | GET/PUT/DELETE | 单个笔记操作（notebookId需包含完整路径） |
| `/api/search` | GET | 全文搜索 |
| `/api/compile/:notePath` | POST | LLM 编译笔记为 Wiki 概念 |
| `/api/compile-state/:noteId` | GET | 查询编译状态 |
| `/api/sources` | GET | 源文件管理 |
| `/api/categories` | GET | 分类信息 |

---

## 核心函数

### PDF处理

**文件**: `knowledge-api.js`

```javascript
// PDF上传处理 - 第248-287行
async function uploadPdf(notebookId, category, pdfPath, filename, options)
```

**流程**:
1. 接收PDF文件
2. 调用 `pdf_dispatch.py` 进行类型检测和分发
3. 文字型PDF → `splitByChapters()` 章节划分
4. 扫描型PDF → 直接使用OCR结果

### 章节划分算法

#### 1. splitByChapters.js - 文字型PDF章节检测

**文件**: `splitByChapters.js`

**用途**: 分析PDF提取的纯文本内容，使用正则匹配章节标题

**算法逻辑**:
1. 识别并跳过前页（版权页、目录等）
2. 使用正则 `/^第([一二三四五六七八九十百千零\d]+)章/` 匹配章节
3. 过滤目录条目（以句号结尾、或含"讲的是"等描述性文字）
4. 按章节边界切分内容

**关键函数**:
```javascript
function splitByChapters(content, pdfId, filename, pdfFileName)
function findChapterInfo(text)    // 提取章节号和标题
function isFrontMatter(text)      // 判断是否前页
function isToc(text)              // 判断是否目录页
function isTocEntry(line)         // 判断是否目录条目（需过滤）
function chineseToArabic(numStr)  // 中文数字转阿拉伯数字
```

#### 2. splitByChaptersFromJson.js - 扫描型PDF章节检测

**文件**: `splitByChaptersFromJson.js`

**用途**: 分析OCR输出的JSON结构，处理扫描件/PDF

**算法逻辑**:
1. 解析OCR生成的JSON文件
2. 提取JSON中的章节标题和层级结构
3. 按章节组织内容块
4. **Fallback机制**: 当无JSON文件时，自动调用 `splitByChapters()` 处理

**关键函数**:
```javascript
async function splitByChaptersFromJson(content, jsonStr, pdfId, filename, pdfFileName)
// jsonStr为null时自动fallback到splitByChapters()
```

---

## 文件分发逻辑

**knowledge-api.js 第269-276行**:

```javascript
const allFiles = fs.readdirSync(notesDir);
const outputFiles = allFiles.filter(f => f.startsWith('temp-') && f.endsWith('.md') && !f.endsWith('_full.md') && !/_chapter-/.test(f));
const fullMdFiles = allFiles.filter(f => f.endsWith('_full.md'));
const easyOcrChapterFiles = allFiles.filter(f => /[_-]chapter-\d+/i.test(f));
```

| 文件类型 | 匹配规则 | 处理方式 |
|----------|----------|----------|
| `temp-*.md` (非章节) | `startsWith('temp-')` 且不含 `_chapter-` | `splitByChapters()` |
| `*_full.md` | `endsWith('_full.md')` | `splitByChaptersFromJson()` |
| `*-chapter-*.md` / `*_chapter-*.md` | 匹配 `/[_-]chapter-\d+/i` | 直接使用章节文件 |

---

### 章节划分

**文件**: `knowledge-api.js`

```javascript
// 文字型PDF章节划分 - 第300行+
function splitByChapters(content, pdfId, filename, pdfFileName)
```

**支持格式**:
- `第X章` - 标准章节
- `第X部分` - 部分划分
- 中文数字: 一、二、三...十

**关键配置**:
```javascript
const MIN_CHAPTER_LENGTH = 200;  // 最小章节长度
const CHAPTER_SPLIT_REGEX = /(第[一二三四五六七八九十百千零\d]+章)/;
```

---

## 目录结构

```
wiki个人知识库/
├── knowledge/              # 知识库存储根目录
│   ├── Knowledge/          # 知识分类
│   │   └── [分类]/
│   │       └── [笔记本]/
│   │           ├── .meta.json
│   │           └── notes/
│   │               └── *.md
│   ├── sources/            # 源文件(PDF等)
│   └── wiki/               # Wiki概念文档
├── docs/
│   └── api.txt             # API文档
├── knowledge-api.js        # 主API服务
└── test-pdf.cjs           # PDF测试脚本
```

---

## 环境依赖

### Node.js 环境

**Node.js版本**: 任意现代版本

**需要安装的库**:
```bash
cd d:\hermes agent\wiki个人知识库
npm install
```

**库依赖**（仅 `pdf-parse`）:
```bash
npm install pdf-parse
```

### Python 环境

| 环境名称 | Python版本 | 路径 | 用途 |
|----------|------------|------|------|
| chatpdf | Python 3.8.20 | `D:\anaconda\envs\chatpdf\` | 文字型PDF处理 |
| torch310 | Python 3.10.20 | `D:\anaconda\envs\torch310\` | 扫描型PDF处理（OCR） |

### 库依赖

#### chatpdf 环境（文字型PDF处理）

```bash
pip install opendataloader-pdf>=1.4.0
```

#### torch310 环境（扫描型PDF处理 - OCR）

```bash
pip install easyocr torch pillow
```

### 模型文件

| 模型 | 路径 | 用途 |
|------|------|------|
| EasyOCR模型 | `d:\hermes agent\easyocr_model\` | OCR识别 |

### 快速启动 Wiki API

```powershell
# 1. 安装 Node.js 依赖
cd d:\hermes agent\wiki个人知识库
npm install

# 2. 启动 API 服务
npm start

# 服务运行在 http://localhost:18090
```

---

## 配置

**端口**: `18090`

**知识库目录**: `D:\hermes agent\wiki个人知识库\knowledge`

**认证**: Bearer Token (`hiclaw-knowledge-api`)

**CORS**: 支持跨域，预检请求自动处理

**URL编码**: API会自动解码URL编码的路径参数

**Python路径**:
- chatpdf: `D:\anaconda\envs\chatpdf\python.exe`
- torch: `D:\anaconda\envs\torch310\python.exe`

**EasyOCR默认扫描页数**: `1-50` (在 `pdf_dispatch.py` 中配置)

---

## LLM 编译

### 编译流程

```
用户点击编译 → POST /api/compile/{notePath}
            → findNoteById() 查找笔记
            → 写入 llm-wiki-compiler-main/sources/
            → spawn compile_with_llm.py
            → LLM 提取概念
            → 生成 wiki/concepts/*.md
```

### 核心文件

| 文件 | 作用 |
|------|------|
| `knowledge-api.js` | API 入口 (`/api/compile/*`) |
| `compile_with_llm.py` | LLM 编译主脚本 |
| `llm-wiki-compiler-main/` | Wiki 编译器子项目 |
| `llm-wiki-compiler-main/sources/` | 待编译源文件 |
| `llm-wiki-compiler-main/wiki/concepts/` | 生成的概念文件 |

### API Key 配置

**位置**: `~/.hermes/.env`

```bash
OPENAI_API_KEY=火山引擎 API Key
```

**注意**: compile_with_llm.py 优先从 `~/.hermes/.env` 读取，不使用环境变量 `OPENAI_API_KEY`。

### 路径大小写

`getCategoryPath()` 支持大小写不敏感匹配：
- `Knowledge/...`、`knowledge/...`、`KNOWLEDGE/...` 都可以正确匹配

---

## 相关文档

- [整体架构](../../ARCHITECTURE.md)
- [核心算法](../../ALGORITHMS.md)
- [Agent+Wiki协作](../../wiki个人知识库/AGENT_WIKI_ARCHITECTURE.md)
- [知识库运转架构](../../wiki个人知识库/知识库架构.md)
