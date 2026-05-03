#!/usr/bin/env python3
"""Wiki Tools Module - Hermes Agent tools for interacting with HiClaw Wiki."""

import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from tools.registry import registry

logger = logging.getLogger(__name__)

WIKI_API_URL = os.environ.get("WIKI_API_URL", "http://localhost:18090")
WIKI_API_KEY = os.environ.get("WIKI_API_KEY", "hiclaw-knowledge-api")

_default_wiki_dir = Path(__file__).parent.parent.parent.parent / "wiki个人知识库" / "knowledge"
WIKI_BASE_DIR = os.environ.get("WIKI_BASE_DIR", str(_default_wiki_dir))


def _check_wiki_api():
    return True


def _make_request(method: str, endpoint: str, data: Optional[dict] = None) -> dict:
    import urllib.request
    import urllib.error
    import urllib.parse

    url = f"{WIKI_API_URL}{endpoint}"
    if any(ord(c) > 127 for c in endpoint):
        url = f"{WIKI_API_URL}{urllib.parse.quote(endpoint, safe='/')}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {WIKI_API_KEY}"
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers=headers,
        method=method
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.reason}"}
    except urllib.error.URLError as e:
        return {"error": f"Connection error: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def _read_file_content(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"


def _list_files_recursive(directory: str, pattern: str = "*.md") -> list:
    from pathlib import Path
    files = []
    try:
        for p in Path(directory).rglob(pattern):
            files.append(str(p))
    except Exception as e:
        logger.error(f"Error listing files in {directory}: {e}")
    return files


WIKI_LIST_NOTES_SCHEMA = {
    "name": "wiki_list_notes",
    "description": (
        "List all notes in the wiki. Use this to see what notes exist.\n\n"
        "Args:\n"
        "- notebook_id (optional): List notes in a specific notebook only.\n"
        "  Format: 'categoryId/subfolder/notebookName', e.g., 'knowledge/个人成长/test'\n\n"
        "Returns a formatted list of notes with titles and notebook names."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "notebook_id": {
                "type": "string",
                "description": "Optional notebook ID in format 'categoryId/subfolder/notebookName'"
            }
        }
    }
}


def _handle_wiki_list_notes(args, **kw):
    notebook_id = args.get("notebook_id") if args else None
    if notebook_id:
        result = _make_request("GET", f"/api/notebooks/{notebook_id}/notes")
    else:
        result = _make_request("GET", "/api/all-notes")

    if "error" in result:
        return f"Error: {result['error']}"

    notes = result if isinstance(result, list) else result.get("notes", [])

    if not notes:
        return "No notes found"

    output = ["## Notes\n"]
    for note in notes[:20]:
        title = note.get("title", note.get("id", "Untitled"))
        nb_name = note.get("notebookName", note.get("notebook_id", ""))
        output.append(f"- **{title}** ({nb_name})")
        output.append(f"  - ID: {note.get('id')}")

    if len(notes) > 20:
        output.append(f"\n... and {len(notes) - 20} more notes")

    return "\n".join(output)


WIKI_LIST_NOTEBOOKS_SCHEMA = {
    "name": "wiki_list_notebooks",
    "description": (
        "List all notebooks in the wiki, organized by category and subfolder.\n\n"
        "Use this to understand the wiki structure before creating or searching notes.\n"
        "Returns categories with their subfolders and notebooks."
    ),
    "parameters": {
        "type": "object",
        "properties": {}
    }
}


def _handle_wiki_list_notebooks(args, **kw):
    result = _make_request("GET", "/api/categories")

    if "error" in result:
        return f"Error: {result['error']}"

    categories = result if isinstance(result, list) else result.get("categories", [])

    output = ["## Notebooks\n"]
    for cat in categories:
        cat_name = cat.get("label", cat.get("name", ""))
        cat_id = cat.get("id", "")
        output.append(f"\n### {cat_name} ({cat_id})")
        for subfolder in cat.get("subfolders", []):
            output.append(f"\n#### {subfolder}")

    return "\n".join(output)


WIKI_READ_NOTE_SCHEMA = {
    "name": "wiki_read_note",
    "description": (
        "Read the full content of a specific note.\n\n"
        "Args:\n"
        "- notebook_id: The notebook ID, e.g., 'knowledge/个人成长/test'\n"
        "- note_id: The note ID, e.g., 'note-1775826187528'\n\n"
        "Returns the full markdown content of the note."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "notebook_id": {
                "type": "string",
                "description": "The notebook ID, e.g., 'knowledge/个人成长/test'"
            },
            "note_id": {
                "type": "string",
                "description": "The note ID, e.g., 'note-1775826187528'"
            }
        },
        "required": ["notebook_id", "note_id"]
    }
}


def _handle_wiki_read_note(args, **kw):
    notebook_id = args.get("notebook_id", "")
    note_id = args.get("note_id", "")

    result = _make_request("GET", f"/api/notes/{notebook_id}/{note_id}")
    if "error" not in result and result:
        content = result.get("content", "")
        title = result.get("title", note_id)
        return f"# {title}\n\n{content}"

    wiki_path = os.path.join(WIKI_BASE_DIR, "wiki", "concepts", f"{note_id}.md")
    if os.path.exists(wiki_path):
        with open(wiki_path, "r", encoding="utf-8") as f:
            content = f.read()
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        title = title_match.group(1) if title_match else note_id
        return f"# {title}\n\n{content}"

    index_path = os.path.join(WIKI_BASE_DIR, "wiki", "index.md")
    if note_id == "index" and os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        return f"# Knowledge Wiki Index\n\n{content}"

    if "error" in result:
        return f"Error: {result['error']}"
    return "Note not found"


WIKI_SEARCH_NOTES_SCHEMA = {
    "name": "wiki_search_notes",
    "description": (
        "Search notes by keyword. Returns matching notes with content snippets.\n\n"
        "Args:\n"
        "- query: The search keyword to find in notes\n"
        "- max_results (optional): Maximum number of results, default 10\n\n"
        "Use this when user asks to find something in the wiki."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query/keyword"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (default: 10)",
                "default": 10
            }
        },
        "required": ["query"]
    }
}


def _handle_wiki_search_notes(args, **kw):
    query = args.get("query", "") if args else ""
    max_results = args.get("max_results", 10) if args else 10
    result = _make_request("POST", "/api/search", {"query": query, "limit": max_results})

    if "error" in result:
        return _search_files_fallback(WIKI_BASE_DIR, query, max_results)

    results = result if isinstance(result, list) else result.get("results", [])

    if not results:
        return _search_files_fallback(WIKI_BASE_DIR, query, max_results)

    output = [f"## Search Results for: {query}\n"]
    for r in results[:max_results]:
        title = r.get("title", r.get("id", "Untitled"))
        snippet = r.get("snippet", r.get("content", ""))[:150]
        output.append(f"\n### {title}")
        output.append(f"```\n{snippet}...\n```")

    return "\n".join(output)


def _search_files_fallback(directory: str, query: str, max_results: int) -> str:
    files = _list_files_recursive(directory, "*.md")
    query_lower = query.lower()
    results = []

    for file_path in files:
        try:
            content = _read_file_content(file_path)
            if query_lower in content.lower():
                rel_path = os.path.relpath(file_path, directory)
                title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
                title = title_match.group(1) if title_match else rel_path
                snippet_match = re.search(
                    rf".{{0,50}}{re.escape(query)}.{{0,50}}",
                    content,
                    re.IGNORECASE
                )
                snippet = snippet_match.group(0) if snippet_match else content[:100]
                results.append({
                    "title": title,
                    "path": rel_path,
                    "snippet": snippet
                })
                if len(results) >= max_results:
                    break
        except Exception:
            continue

    if not results:
        return f"No notes found matching: {query}"

    output = [f"## Search Results for: {query}\n"]
    for r in results:
        output.append(f"\n### {r['title']}")
        output.append(f"Path: {r['path']}")
        output.append(f"```\n{r['snippet']}...\n```")

    return "\n".join(output)


WIKI_WRITE_NOTE_SCHEMA = {
    "name": "wiki_write_note",
    "description": (
        "Create a new note in the wiki.\n\n"
        "Args:\n"
        "- notebook_id: Target notebook ID, e.g., 'knowledge/个人成长/test'\n"
        "- title: The title of the note\n"
        "- content: The note content in markdown format\n\n"
        "Use markdown format for the content. First line should be # Title."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "notebook_id": {
                "type": "string",
                "description": "The notebook ID where to create the note"
            },
            "title": {
                "type": "string",
                "description": "The title of the note"
            },
            "content": {
                "type": "string",
                "description": "The note content in markdown format"
            }
        },
        "required": ["notebook_id", "title", "content"]
    }
}


def _handle_wiki_write_note(args, **kw):
    notebook_id = args.get("notebook_id", "") if args else ""
    title = args.get("title", "") if args else ""
    content = args.get("content", "") if args else ""
    result = _make_request("POST", f"/api/notebooks/{notebook_id}/notes", {
        "title": title,
        "content": content
    })

    if "error" in result:
        return f"Error creating note: {result['error']}"

    note_id = result.get("id", "unknown")
    return f"Note created successfully!\n- Title: {title}\n- Notebook: {notebook_id}\n- ID: {note_id}"


WIKI_UPDATE_NOTE_SCHEMA = {
    "name": "wiki_update_note",
    "description": (
        "Update an existing note with new content.\n\n"
        "Args:\n"
        "- notebook_id: The notebook ID\n"
        "- note_id: The note ID to update\n"
        "- content: The new content in markdown format\n\n"
        "Warning: This replaces the entire note content."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "notebook_id": {
                "type": "string",
                "description": "The notebook ID"
            },
            "note_id": {
                "type": "string",
                "description": "The note ID to update"
            },
            "content": {
                "type": "string",
                "description": "The new content in markdown format"
            }
        },
        "required": ["notebook_id", "note_id", "content"]
    }
}


def _handle_wiki_update_note(args, **kw):
    notebook_id = args.get("notebook_id", "") if args else ""
    note_id = args.get("note_id", "") if args else ""
    content = args.get("content", "") if args else ""
    result = _make_request("PUT", f"/api/notes/{notebook_id}/{note_id}", {
        "content": content
    })

    if "error" in result:
        return f"Error updating note: {result['error']}"

    return f"Note updated successfully!\n- Notebook: {notebook_id}\n- Note: {note_id}"


WIKI_DELETE_NOTE_SCHEMA = {
    "name": "wiki_delete_note",
    "description": (
        "Delete a note from the wiki.\n\n"
        "Args:\n"
        "- notebook_id: The notebook ID\n"
        "- note_id: The note ID to delete\n\n"
        "Warning: This action is irreversible!"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "notebook_id": {
                "type": "string",
                "description": "The notebook ID"
            },
            "note_id": {
                "type": "string",
                "description": "The note ID to delete"
            }
        },
        "required": ["notebook_id", "note_id"]
    }
}


def _handle_wiki_delete_note(args, **kw):
    notebook_id = args.get("notebook_id", "") if args else ""
    note_id = args.get("note_id", "") if args else ""
    result = _make_request("DELETE", f"/api/notes/{notebook_id}/{note_id}")

    if "error" in result:
        return f"Error deleting note: {result['error']}"

    return f"Note deleted successfully!\n- Notebook: {notebook_id}\n- Note: {note_id}"


WIKI_COMPILE_SCHEMA = {
    "name": "wiki_compile",
    "description": (
        "Trigger wiki compilation. This runs the LLM compiler to:\n"
        "- Extract concepts from notes\n"
        "- Update wiki links\n"
        "- Generate wiki index\n\n"
        "Use when user asks to compile, build, or sync the wiki.\n"
        "Compilation may take a minute or two to complete."
    ),
    "parameters": {
        "type": "object",
        "properties": {}
    }
}


def _handle_wiki_compile(args, **kw):
    result = _make_request("POST", "/api/compile")

    if "error" in result:
        return f"Error compiling wiki: {result['error']}"

    output = ["Wiki compiled successfully!", ""]
    output.append(f"Output: {result.get('output', 'Compilation completed')}")

    sync_result = result.get("sync", {})
    if sync_result.get("success"):
        output.append(f"Sync files: {len(sync_result.get('files', []))} files synced")

    return "\n".join(output)


WIKI_GET_CATEGORIES_SCHEMA = {
    "name": "wiki_get_categories",
    "description": (
        "Get all wiki categories and subfolders.\n\n"
        "Use this to understand the wiki structure before creating notes.\n"
        "Returns categories like: Knowledge (知识层), Software (技能层), etc."
    ),
    "parameters": {
        "type": "object",
        "properties": {}
    }
}


def _handle_wiki_get_categories(args, **kw):
    result = _make_request("GET", "/api/categories")

    if "error" in result:
        return f"Error: {result['error']}"

    categories = result if isinstance(result, list) else result.get("categories", [])

    output = ["## Wiki Categories\n"]
    for cat in categories:
        output.append(f"\n### {cat.get('label', cat.get('name', ''))} {cat.get('icon', '')}")
        output.append(f"ID: {cat.get('id')}")
        subfolders = cat.get('subfolders', [])
        output.append(f"Subfolders: {', '.join(subfolders) if subfolders else 'None'}")

    return "\n".join(output)


WIKI_GET_CONCEPT_SCHEMA = {
    "name": "wiki_get_concept",
    "description": (
        "Get a specific wiki concept page.\n\n"
        "Args:\n"
        "- concept_name: The name/slug of the concept\n\n"
        "Returns the concept page content if found."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "concept_name": {
                "type": "string",
                "description": "The concept name/slug"
            }
        },
        "required": ["concept_name"]
    }
}


def _handle_wiki_get_concept(args, **kw):
    concept_name = args.get("concept_name", "") if args else ""
    result = _make_request("GET", f"/api/wiki/concepts/{concept_name}")

    if "error" in result:
        return f"Concept '{concept_name}' not found"

    return result if isinstance(result, str) else json.dumps(result, indent=2, ensure_ascii=False)


registry.register(
    name="wiki_list_notes",
    toolset="wiki",
    schema=WIKI_LIST_NOTES_SCHEMA,
    handler=_handle_wiki_list_notes,
    check_fn=_check_wiki_api,
    emoji="📝"
)

registry.register(
    name="wiki_list_notebooks",
    toolset="wiki",
    schema=WIKI_LIST_NOTEBOOKS_SCHEMA,
    handler=_handle_wiki_list_notebooks,
    check_fn=_check_wiki_api,
    emoji="📚"
)

registry.register(
    name="wiki_read_note",
    toolset="wiki",
    schema=WIKI_READ_NOTE_SCHEMA,
    handler=_handle_wiki_read_note,
    check_fn=_check_wiki_api,
    emoji="📖"
)

registry.register(
    name="wiki_search_notes",
    toolset="wiki",
    schema=WIKI_SEARCH_NOTES_SCHEMA,
    handler=_handle_wiki_search_notes,
    check_fn=_check_wiki_api,
    emoji="🔎"
)

registry.register(
    name="wiki_write_note",
    toolset="wiki",
    schema=WIKI_WRITE_NOTE_SCHEMA,
    handler=_handle_wiki_write_note,
    check_fn=_check_wiki_api,
    emoji="✍️"
)

registry.register(
    name="wiki_update_note",
    toolset="wiki",
    schema=WIKI_UPDATE_NOTE_SCHEMA,
    handler=_handle_wiki_update_note,
    check_fn=_check_wiki_api,
    emoji="🔄"
)

registry.register(
    name="wiki_delete_note",
    toolset="wiki",
    schema=WIKI_DELETE_NOTE_SCHEMA,
    handler=_handle_wiki_delete_note,
    check_fn=_check_wiki_api,
    emoji="🗑️"
)

registry.register(
    name="wiki_compile",
    toolset="wiki",
    schema=WIKI_COMPILE_SCHEMA,
    handler=_handle_wiki_compile,
    check_fn=_check_wiki_api,
    emoji="⚙️"
)

registry.register(
    name="wiki_get_categories",
    toolset="wiki",
    schema=WIKI_GET_CATEGORIES_SCHEMA,
    handler=_handle_wiki_get_categories,
    check_fn=_check_wiki_api,
    emoji="📋"
)

registry.register(
    name="wiki_get_concept",
    toolset="wiki",
    schema=WIKI_GET_CONCEPT_SCHEMA,
    handler=_handle_wiki_get_concept,
    check_fn=_check_wiki_api,
    emoji="💡"
)
