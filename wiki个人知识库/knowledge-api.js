#!/usr/bin/env node

import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { splitByChapters } from './splitByChapters.js';
import { splitByChaptersFromJson } from './splitByChaptersFromJson.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 18090;
const KNOWLEDGE_BASE_DIR = process.env.KNOWLEDGE_BASE_DIR || path.join(__dirname, "knowledge");
const SOURCES_DIR = `${KNOWLEDGE_BASE_DIR}/sources`;
const WIKI_DIR = `${KNOWLEDGE_BASE_DIR}/wiki`;
const WIKI_SYNC_DIR = `${WIKI_DIR}/sync`;
const PDF_CONTENT_DIR = `${KNOWLEDGE_BASE_DIR}/.pdf-content`;

const API_KEY = process.env.API_KEY || "hiclaw-knowledge-api";

const CATEGORIES = [
  { id: "knowledge", name: "Knowledge", label: "知识层", icon: "📚" },
  { id: "software", name: "Software", label: "技能层", icon: "💻" },
  { id: "lifeos", name: "LifeOS", label: "行动层", icon: "📋" },
  { id: "writing", name: "Writing", label: "产出层", icon: "✍️" },
  { id: "notes", name: "Notes", label: "收集箱", icon: "📝" }
];

const CATEGORY_SUBFOLDERS = {
  knowledge: ["管理与领导力", "创业", "个人成长", "教育与回忆"],
  software: ["AI工具经验", "Claude Code", "OpenClaw配置"],
  lifeos: ["投资与财经", "生活管理"],
  writing: ["内容素材"],
  notes: ["Inbox"]
};

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function checkAuth(req) {
  const auth = req.headers.authorization;
  return auth === `Bearer ${API_KEY}`;
}

function jsonResponse(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getCategories() {
  return CATEGORIES.map(cat => ({
    ...cat,
    subfolders: CATEGORY_SUBFOLDERS[cat.id] || []
  }));
}

function getCategoryPath(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId || c.id === categoryId.toLowerCase());
  if (!cat) return null;
  return path.join(KNOWLEDGE_BASE_DIR, cat.name);
}

function getSubfolderPath(categoryId, subfolder) {
  const basePath = getCategoryPath(categoryId);
  if (!basePath) return null;
  return path.join(basePath, subfolder);
}

function getNotebooksInSubfolder(categoryId, subfolder) {
  const subfolderPath = getSubfolderPath(categoryId, subfolder);
  if (!subfolderPath || !existsSync(subfolderPath)) return [];

  ensureDir(subfolderPath);
  const items = fs.readdirSync(subfolderPath, { withFileTypes: true });
  return items
    .filter(d => d.isDirectory())
    .map(d => {
      const metaPath = path.join(subfolderPath, d.name, ".meta.json");
      let meta = {
        id: `${categoryId}/${subfolder}/${d.name}`,
        name: d.name,
        category: categoryId,
        subfolder: subfolder,
        created: d.birthtime,
        path: `${categoryId}/${subfolder}/${d.name}`
      };
      if (existsSync(metaPath)) {
        try {
          meta = { ...meta, ...JSON.parse(readFileSync(metaPath, "utf8")) };
        } catch (e) {}
      }
      return meta;
    });
}

function getAllNotebooks() {
  const notebooks = [];
  for (const cat of CATEGORIES) {
    const catPath = getCategoryPath(cat.id);
    if (!catPath || !existsSync(catPath)) continue;
    for (const subfolder of CATEGORY_SUBFOLDERS[cat.id] || []) {
      notebooks.push(...getNotebooksInSubfolder(cat.id, subfolder));
    }
  }
  return notebooks;
}

function getNotebookPath(notebookId) {
  const parts = notebookId.split("/");
  if (parts.length !== 3) return null;
  const [category, subfolder, ...rest] = parts;
  const notebookName = rest.join("/");
  const basePath = getSubfolderPath(category, subfolder);
  if (!basePath) return null;
  return path.join(basePath, notebookName);
}

function getNotes(notebookId) {
  const notebookPath = getNotebookPath(notebookId);
  if (!notebookPath) return { notes: [] };

  const notesDir = path.join(notebookPath, "notes");
  if (!existsSync(notesDir)) {
    return { notes: [] };
  }

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith(".md"));
  const notes = files.map(f => {
    const filePath = path.join(notesDir, f);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const id = f.replace(/\.md$/, "");
    const titleMatch = content.match(/^#\s+(.+)/);
    const title = titleMatch ? titleMatch[1] : id;
    const parentPdfMatch = content.match(/<!-- parent-pdf:\s*(.+?) -->/);
    const chapterMatch = content.match(/<!-- chapter:\s*(.+?) -->/);

    return {
      id,
      title,
      filename: f,
      created: stat.birthtime,
      modified: stat.mtime,
      parentPdf: parentPdfMatch ? parentPdfMatch[1] : null,
      chapter: chapterMatch ? chapterMatch[1] : null
    };
  });

  return { notes };
}

async function processWithEasyOCR(pdfPath, pdfBuffer, notesDir, filename, notebookId, options = {}) {
  const { maxChapters } = options;
  const timestamp = Date.now();
  const outputDir = path.join(notesDir, `pdf-temp-${timestamp}`);
  ensureDir(outputDir);
  const tempPdfPath = path.join(notesDir, `temp-easyocr-${timestamp}-${filename}`);
  fs.writeFileSync(tempPdfPath, pdfBuffer);
  const pdfId = `pdf-${timestamp}`;
  const isWindows = process.platform === "win32";
  const pythonExe = process.env.PYTHON_EXE || (isWindows ? "python" : "python");
  const projectRoot = path.resolve(__dirname, '..');
  const easyocrScript = process.env.EASYOCR_SCRIPT || path.join(projectRoot, "opendataloader-pdf-main", "scripts", "easyocr_chapter_scan.py");
  const easyocrModelPath = process.env.EASYOCR_MODULE_PATH || path.join(projectRoot, "easyocr_model");

  console.log("Processing with EasyOCR → EasyOCR");

  const easyocrResult = await new Promise((resolve, reject) => {
    const child = spawn(pythonExe, [
      easyocrScript,
      "--pdf", tempPdfPath,
      "--notebook", outputDir,
      "--pages", "1-100"
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EASYOCR_MODULE_PATH: easyocrModelPath }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.on("error", reject);
  });

  const pages = [];
  const pdfContentDir = notesDir;
  ensureDir(pdfContentDir);

  const outputFiles = fs.readdirSync(outputDir);
  for (const file of outputFiles) {
    if (file.endsWith(".md")) {
      const filePath = path.join(outputDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const chapterMatch = content.match(/^#\s+(.+)/);
      const chapterTitle = chapterMatch ? chapterMatch[1] : file.replace(".md", "");
      const chapterFileName = `${pdfId}-chapter-${String(pages.length + 1).padStart(3, "0")}.md`;
      const chapterPath = path.join(pdfContentDir, chapterFileName);
      const pageText = `<!-- parent-pdf: ${filename} -->\n<!-- chapter: ${chapterTitle} -->\n${content}`;
      fs.writeFileSync(chapterPath, pageText);
      pages.push({ filename: chapterFileName, chapter: chapterTitle, pdfFileName: filename });
    }
  }

  fs.unlinkSync(tempPdfPath);
  fs.rmSync(outputDir, { recursive: true, force: true });

  return {
    success: true,
    pdf: { filename, path: pdfPath, pageCount: pages.length },
    pages,
    totalPages: pages.length,
    notebookId
  };
}

async function uploadPdfToNotebook(notebookId, pdfBase64, filename, options = {}) {
  try {
    const { maxChapters } = options;
    const notebookPath = getNotebookPath(notebookId);
    if (!notebookPath) {
      return { success: false, error: "Notebook not found" };
    }

    const notesDir = path.join(notebookPath, "notes");
    ensureDir(notesDir);

    const pdfFileName = filename;
    const pdfPath = path.join(notesDir, pdfFileName);
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    fs.writeFileSync(pdfPath, pdfBuffer);

    const timestamp = Date.now();
    const tempPdfPath = path.join(notesDir, `temp-${timestamp}-${pdfFileName}`);
    fs.writeFileSync(tempPdfPath, pdfBuffer);

    const isWindows = process.platform === "win32";
    const pythonExe = process.env.PYTHON_EXE || (isWindows ? "python" : "python");
    const projectRoot = path.resolve(__dirname, '..');
    const pdfDispatchScript = process.env.PDF_DISPATCH_SCRIPT || path.join(projectRoot, "opendataloader-pdf-main", "scripts", "pdf_dispatch.py");

    console.log("Using pdf_dispatch.py for PDF processing...");

    const dispatchResult = await new Promise((resolve, reject) => {
      const child = spawn(pythonExe, [pdfDispatchScript, tempPdfPath, notesDir], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", d => stdout += d);
      child.stderr.on("data", d => stderr += d);
      child.on("close", code => resolve({ code, stdout, stderr }));
      child.on("error", reject);
    });

    console.log("Dispatch result:", dispatchResult.stdout);
    if (dispatchResult.stderr) {
      console.log("Dispatch stderr:", dispatchResult.stderr);
    }

    fs.unlinkSync(tempPdfPath);

    const allFiles = fs.readdirSync(notesDir);
    const outputFiles = allFiles.filter(f => f.startsWith('temp-') && f.endsWith('.md') && !f.endsWith('_full.md') && !/_chapter-/.test(f));
    const fullMdFiles = allFiles.filter(f => f.endsWith('_full.md'));
    const easyOcrChapterFiles = allFiles.filter(f => /[_-]chapter-\d+/i.test(f));
    console.log('DEBUG: allFiles count:', allFiles.length);
    console.log('DEBUG: outputFiles:', outputFiles);
    console.log('DEBUG: fullMdFiles:', fullMdFiles);
    console.log('DEBUG: easyOcrChapterFiles:', easyOcrChapterFiles);
    const pages = [];

    for (const file of outputFiles) {
      const srcPath = path.join(notesDir, file);
      const content = fs.readFileSync(srcPath, 'utf8');
      const pdfId = `pdf-${timestamp}`;
      const chapters = splitByChapters(content, pdfId, filename, filename);
      for (const ch of chapters) {
        const destPath = path.join(notesDir, ch.filename);
        fs.writeFileSync(destPath, ch.content);
        pages.push({ filename: ch.filename, chapter: ch.title || ch.chapter, pdfFileName: filename });
      }
      fs.unlinkSync(srcPath);
    }

    for (const file of easyOcrChapterFiles) {
      const srcPath = path.join(notesDir, file);
      const content = fs.readFileSync(srcPath, 'utf8');
      const chapterMatch = content.match(/^#\s+(.+?)\n/);
      const chapterTitle = chapterMatch ? chapterMatch[1] : file;
      pages.push({ filename: file, chapter: chapterTitle, pdfFileName: filename });
    }

    for (const file of fullMdFiles) {
      const srcPath = path.join(notesDir, file);
      const jsonPath = srcPath.replace('_full.md', '_toc.json');
      let jsonStr = null;
      if (fs.existsSync(jsonPath)) {
        jsonStr = fs.readFileSync(jsonPath, 'utf8');
      }
      const content = fs.readFileSync(srcPath, 'utf8');
      const pdfId = `pdf-${timestamp}`;
      const chapters = await splitByChaptersFromJson(content, jsonStr, pdfId, filename, filename);
      for (const ch of chapters) {
        const destPath = path.join(notesDir, ch.filename);
        fs.writeFileSync(destPath, ch.content);
        pages.push({ filename: ch.filename, chapter: ch.title || ch.chapter, pdfFileName: filename });
      }
      fs.unlinkSync(srcPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    }

    return {
      success: true,
      pdf: { filename, path: pdfPath, pageCount: pages.length },
      pages,
      totalPages: pages.length,
      notebookId
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getAllNotes() {
  const allNotes = [];
  const notebooks = getAllNotebooks();

  for (const nb of notebooks) {
    const result = getNotes(nb.id);
    for (const note of result.notes) {
      allNotes.push({
        ...note,
        notebook: nb
      });
    }
  }

  return allNotes;
}

function findNoteById(noteId) {
  const parts = noteId.split('/');
  const noteFileName = parts.pop();
  const notebookId = parts.join('/');
  const notebookPath = getNotebookPath(notebookId);
  if (!notebookPath) return null;
  const notePath = path.join(notebookPath, "notes", noteFileName + ".md");
  if (!existsSync(notePath)) return null;
  const content = fs.readFileSync(notePath, "utf8");
  const titleMatch = content.match(/^#\s+(.+)/);
  const nb = getAllNotebooks().find(n => n.id === notebookId);
  return {
    id: noteFileName,
    title: titleMatch ? titleMatch[1] : noteFileName,
    content: content,
    filename: noteFileName + ".md",
    notebook: nb || { id: notebookId, name: notebookId.split('/').pop() }
  };
}

function getNoteCompileState(noteId) {
  const lastSlash = noteId.lastIndexOf('/');
  const notebookId = noteId.substring(0, lastSlash);
  const noteFileName = noteId.substring(lastSlash + 1);
  const notebookPath = getNotebookPath(notebookId);
  if (!notebookPath) return null;
  const metaPath = path.join(notebookPath, "notes", noteFileName + ".meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (e) {
    return null;
  }
}

function setNoteCompileState(noteId, data) {
  const lastSlash = noteId.lastIndexOf('/');
  const notebookId = noteId.substring(0, lastSlash);
  const noteFileName = noteId.substring(lastSlash + 1);
  const notebookPath = getNotebookPath(notebookId);
  if (!notebookPath) return false;
  const metaPath = path.join(notebookPath, "notes", noteFileName + ".meta.json");
  try {
    fs.writeFileSync(metaPath, JSON.stringify(data), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === "/api/categories" && req.method === "GET") {
    jsonResponse(res, 200, getCategories());
    return;
  }

  if (pathname === "/api/notebooks" && req.method === "GET") {
    const notebooks = getAllNotebooks();
    jsonResponse(res, 200, notebooks);
    return;
  }

  if (pathname === "/api/notebooks" && req.method === "POST") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        if (!checkAuth(req)) { jsonResponse(res, 401, { error: "Unauthorized" }); return; }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { name, category, subfolder } = body;
        if (!name || !category || !subfolder) {
          jsonResponse(res, 400, { error: "Missing name, category or subfolder" });
          return;
        }
        const notebookId = `${category}/${subfolder}/${name}`;
        const notebookPath = getNotebookPath(notebookId);
        if (!notebookPath) {
          jsonResponse(res, 400, { error: "Invalid notebookId format" });
          return;
        }
        if (existsSync(notebookPath)) {
          jsonResponse(res, 409, { error: "Notebook already exists" });
          return;
        }
        ensureDir(notebookPath);
        const notesDir = path.join(notebookPath, "notes");
        ensureDir(notesDir);
        const metaPath = path.join(notebookPath, ".meta.json");
        const meta = { name, category, subfolder, created: new Date().toISOString() };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        jsonResponse(res, 201, { success: true, notebookId });
      } catch (e) { jsonResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  if (pathname.startsWith("/api/notebooks/") && pathname.endsWith("/notes") && req.method === "GET") {
    const pathStr = pathname.slice("/api/notebooks/".length, -"/notes".length);
    const notebookId = pathStr.split('/').map(p => decodeURIComponent(p)).join('/');
    const result = getNotes(notebookId);
    jsonResponse(res, 200, result);
    return;
  }

  if (pathname.startsWith("/api/notebooks/") && !pathname.endsWith("/notes") && req.method === "GET") {
    const pathStr = pathname.replace("/api/notebooks/", "");
    const notebookId = pathStr.split('/').map(p => decodeURIComponent(p)).join('/');
    const result = getNotes(notebookId);
    jsonResponse(res, 200, result);
    return;
  }

  if (pathname === "/api/all-notes" && req.method === "GET") {
    const notes = getAllNotes().filter(n => {
      if (n.chapter !== null) return false;
      if (/_chapter-\d+/i.test(n.id)) return false;
      return true;
    });
    jsonResponse(res, 200, notes);
    return;
  }

  if (pathname.startsWith("/api/compile-state/") && req.method === "GET") {
    console.log('DEBUG: compile-state called, pathname:', pathname);
    const noteId = decodeURIComponent(pathname.replace("/api/compile-state/", ""));
    console.log('DEBUG: noteId after decode:', noteId);
    const meta = getNoteCompileState(noteId);
    if (meta) {
      jsonResponse(res, 200, { compiled: true, compiledAt: meta.compiledAt });
    } else {
      jsonResponse(res, 200, { compiled: false });
    }
    return;
  }

  if (pathname.startsWith("/api/compile/") && req.method === "POST") {
    if (!checkAuth(req)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return;
    }
    const noteId = decodeURIComponent(pathname.replace("/api/compile/", ""));

    const note = findNoteById(noteId);
    if (!note) {
      jsonResponse(res, 404, { error: "Note not found" });
      return;
    }

    const content = note.content || "";
    const timestamp = new Date().toISOString();

    const llmWikiDir = path.join(__dirname, "llm-wiki-compiler-main");
    const sourcesDir = path.join(llmWikiDir, "sources");
    const wikiDir = path.join(llmWikiDir, "wiki");
    ensureDir(sourcesDir);
    ensureDir(wikiDir);

    const sourceFileName = noteId.split('/').pop() + ".md";
    const sourceFilePath = path.join(sourcesDir, sourceFileName);
    fs.writeFileSync(sourceFilePath, content, "utf8");

    setNoteCompileState(noteId, { compiledAt: timestamp });

    const compileScript = path.join(__dirname, "compile_with_llm.py");
    if (!existsSync(compileScript)) {
      setNoteCompileState(noteId, { compiledAt: timestamp, error: "Compile script not found" });
      jsonResponse(res, 200, { success: true, compiledAt: timestamp, warning: "Compile script not found" });
      return;
    }

    const hermesAgentDir = path.join(__dirname, "..", "hermes-agent-main", "hermes-agent-main");
    const venvPython = path.join(hermesAgentDir, "venv", "Scripts", "python.exe");
    const pythonExe = existsSync(venvPython) ? venvPython : "python";
    const env = { ...process.env };
    const child = spawn(pythonExe, [compileScript], {
      cwd: __dirname,
      env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("close", code => {
      if (code === 0) {
        setNoteCompileState(noteId, { compiledAt: timestamp });
        jsonResponse(res, 200, { success: true, compiledAt: timestamp });
      } else {
        setNoteCompileState(noteId, { compiledAt: timestamp, error: stderr || `Exit code ${code}` });
        jsonResponse(res, 200, { success: true, compiledAt: timestamp, warning: "LLM compilation failed: " + (stderr || `Exit code ${code}`) });
      }
    });
    child.on("error", err => {
      setNoteCompileState(noteId, { compiledAt: timestamp, error: err.message });
      jsonResponse(res, 200, { success: true, compiledAt: timestamp, warning: "LLM compilation failed: " + err.message });
    });
    return;
  }

  if (pathname === "/api/sync" && req.method === "POST") {
    if (!checkAuth(req)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return;
    }
    const result = { success: true, message: "Sync placeholder" };
    jsonResponse(res, 200, result);
    return;
  }

  if (pathname === "/api/upload-pdf" && req.method === "POST") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { notebookId, pdfBase64, filename } = body;

        if (!notebookId || !pdfBase64) {
          jsonResponse(res, 400, { error: "Missing notebookId or pdfBase64" });
          return;
        }

        const result = await uploadPdfToNotebook(notebookId, pdfBase64, filename || "document.pdf");
        jsonResponse(res, result.success ? 200 : 500, result);
      } catch (e) {
        jsonResponse(res, 500, { error: e.message });
      }
    });
    return;
  }

  if (pathname === "/api/notes/move" && req.method === "POST") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        if (!checkAuth(req)) { jsonResponse(res, 401, { error: "Unauthorized" }); return; }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { noteId, fromNotebookId, toNotebookId } = body;
        if (!noteId || !fromNotebookId || !toNotebookId) { jsonResponse(res, 400, { error: "Missing parameters" }); return; }
        const fromPath = path.join(getNotebookPath(fromNotebookId), "notes", noteId + ".md");
        const toPath = path.join(getNotebookPath(toNotebookId), "notes", noteId + ".md");
        if (!existsSync(fromPath)) { jsonResponse(res, 404, { error: "Note not found" }); return; }
        ensureDir(path.dirname(toPath));
        fs.renameSync(fromPath, toPath);
        jsonResponse(res, 200, { success: true });
      } catch (e) { jsonResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  const notebooksNotesPostMatch = pathname.match(/^\/api\/notebooks\/(.+)\/notes$/);
  if (notebooksNotesPostMatch && req.method === "POST") {
    const notebookId = decodeURIComponent(notebooksNotesPostMatch[1]);
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        if (!checkAuth(req)) { jsonResponse(res, 401, { error: "Unauthorized" }); return; }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { title, content } = body;
        if (!title) { jsonResponse(res, 400, { error: "Missing title" }); return; }
        const notesDir = path.join(getNotebookPath(notebookId), "notes");
        ensureDir(notesDir);
        const noteId = `${Date.now()}-${title.replace(/[^\w\u4e00-\u9fff]/g, '_')}`;
        const notePath = path.join(notesDir, noteId + ".md");
        fs.writeFileSync(notePath, content || '# ' + title + '\n\n');
        jsonResponse(res, 201, { id: noteId, title, filename: noteId + ".md" });
      } catch (e) { jsonResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  const notesMatch = decodeURIComponent(pathname).match(/^\/api\/notes\/([^\/]+\/.+)\/(.+)$/);
  if (notesMatch && req.method === "GET") {
    const notebookId = decodeURIComponent(notesMatch[1]);
    const noteId = notesMatch[2];
    console.log('GET /api/notes/: notebookId:', notebookId, 'noteId:', noteId);
    const nb = getAllNotebooks().find(n => n.id === notebookId);
    if (!nb) { jsonResponse(res, 404, { error: "Note not found" }); return; }
    const notePath = path.join(getNotebookPath(nb.id), "notes", noteId + ".md");
    if (!existsSync(notePath)) { jsonResponse(res, 404, { error: "Note not found" }); return; }
    const content = fs.readFileSync(notePath, "utf8");
    jsonResponse(res, 200, { id: noteId, content });
    return;
  }

  if (notesMatch && req.method === "PUT") {
    const notebookId = decodeURIComponent(notesMatch[1]);
    const noteId = notesMatch[2];
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        if (!checkAuth(req)) { jsonResponse(res, 401, { error: "Unauthorized" }); return; }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const nb = getAllNotebooks().find(n => n.id === notebookId);
        if (!nb) { jsonResponse(res, 404, { error: "Note not found" }); return; }
        const notePath = path.join(getNotebookPath(nb.id), "notes", noteId + ".md");
        if (!existsSync(notePath)) { jsonResponse(res, 404, { error: "Note not found" }); return; }
        fs.writeFileSync(notePath, body.content || "");
        jsonResponse(res, 200, { success: true });
      } catch (e) { jsonResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  if (notesMatch && req.method === "DELETE") {
    const notebookId = decodeURIComponent(notesMatch[1]);
    const noteId = notesMatch[2];
    try {
      if (!checkAuth(req)) { jsonResponse(res, 401, { error: "Unauthorized" }); return; }
      const nb = getAllNotebooks().find(n => n.id === notebookId);
      if (!nb) { jsonResponse(res, 404, { error: "Note not found" }); return; }
      const notePath = path.join(getNotebookPath(nb.id), "notes", noteId + ".md");
      if (!existsSync(notePath)) { jsonResponse(res, 404, { error: "Note not found" }); return; }
      fs.unlinkSync(notePath);
      jsonResponse(res, 200, { success: true });
    } catch (e) { jsonResponse(res, 500, { error: e.message }); }
    return;
  }

  if (pathname === "/" || pathname === "/ui.html") {
    const uiPath = path.join(__dirname, "ui.html");
    if (existsSync(uiPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(uiPath));
      return;
    }
  }

  if (pathname.startsWith("/ui/")) {
    const filePath = path.join(__dirname, pathname);
    if (existsSync(filePath)) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json"
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  jsonResponse(res, 404, { error: "Not found" });
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Knowledge API running on port ${PORT}`);
  console.log(`Knowledge base directory: ${KNOWLEDGE_BASE_DIR}`);
  console.log(`Categories: ${CATEGORIES.map(c => c.name).join(", ")}`);
});