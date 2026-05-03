---
name: wiki-tools-integration
description: Use when integrating custom tools with Hermes Agent and tools fail to work despite being registered. Debug procedure for tool handler signature mismatches, API response format issues, and toolset visibility problems.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [debugging, wiki, integration, tool-registration, hermes]
    related_skills: [systematic-debugging]
---

# Wiki Tools Integration Debugging

## Problem Statement

Wiki tools were registered in Hermes Agent but failed to execute when called. The agent fell back to terminal commands (find, ls) instead of using the registered wiki tools.

## Debugging Procedure

### Phase 1: Verify Tool Registration

**Step 1.1:** Check if tools are registered in the registry:
```python
from model_tools import registry
wiki_tools = [k for k in registry._tools.keys() if 'wiki' in k]
print('Wiki tools registered:', wiki_tools)
```

**Step 1.2:** Verify toolset contains the tools:
```python
from toolsets import resolve_toolset
tools = resolve_toolset('hermes-cli')
wiki = [t for t in tools if 'wiki' in t]
print('Wiki tools in hermes-cli:', wiki)
```

**Step 1.3:** Check tool definitions passed to LLM:
```python
from model_tools import get_tool_definitions
tools = get_tool_definitions(enabled_toolsets=['hermes-cli'])
wiki = [t['function']['name'] for t in tools if 'wiki' in t['function']['name']]
print('Wiki tools in LLM definition:', wiki)
```

### Phase 2: Test Tool Handlers Directly

**Step 2.1:** Test handler with registry.dispatch():
```python
from model_tools import registry
result = registry.dispatch('wiki_list_notebooks', {})
print(result)
```

**Common Error:** `TypeError: handler() takes 0 positional arguments but 1 was given`

**Root Cause:** Handler function signature mismatch with registry.dispatch() expectation.

### Phase 3: Verify Handler Function Signature

**Step 3.1:** Check how other tools define handlers:
```python
# file_tools.py pattern:
def _handle_read_file(args, **kw):
    # args is a dict of tool parameters
    path = args.get("path", "")
    ...
```

**Step 3.2:** Compare with your handler:
```python
# WRONG - takes no arguments:
def _handle_wiki_list_notebooks() -> str:
    ...

# CORRECT - accepts args dict:
def _handle_wiki_list_notebooks(args, **kw):
    ...
```

**The Fix:** Change all handler signatures to `def _handle_xxx(args, **kw):`

### Phase 4: Check API Response Format

**Step 4.1:** Test API directly:
```python
import urllib.request
import json

url = 'http://localhost:18090/api/categories'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer hiclaw-knowledge-api'})
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read().decode())
print(type(result), result)
```

**Step 4.2:** Fix code if API returns dict but code expects list:
```python
# WRONG:
for cat in result:  # assumes result is a list

# CORRECT:
categories = result if isinstance(result, list) else result.get("categories", [])
for cat in categories:
    ...
```

### Phase 5: Verify Toolset Visibility in CONFIGURABLE_TOOLSETS

**Step 5.1:** Check if toolset is in CONFIGURABLE_TOOLSETS:
```python
from hermes_cli.tools_config import CONFIGURABLE_TOOLSETS
wiki_found = any('wiki' in ts[0].lower() for ts in CONFIGURABLE_TOOLSETS)
print(f'Wiki in CONFIGURABLE_TOOLSETS: {wiki_found}')
```

**Step 5.2:** If not found, add it to CONFIGURABLE_TOOLSETS in `hermes_cli/tools_config.py`:
```python
CONFIGURABLE_TOOLSETS = [
    # ... other toolsets ...
    ("wiki", "📚 Wiki Knowledge", "list_notebooks, list_notes, read_note, search_notes, write_note, update_note, delete_note"),
]
```

**Note:** Hermes must be restarted after modifying CONFIGURABLE_TOOLSETS to see changes in `/tools list`.

## Summary of Fixes Applied

### Fix 1: Handler Signature
```python
# Before (WRONG):
def _handle_wiki_list_notebooks() -> str:

# After (CORRECT):
def _handle_wiki_list_notebooks(args, **kw):
```

### Fix 2: API Response Parsing
```python
# Before (WRONG):
for cat in result:

# After (CORRECT):
categories = result if isinstance(result, list) else result.get("categories", [])
for cat in categories:
```

### Fix 3: CONFIGURABLE_TOOLSETS
```python
# Add to CONFIGURABLE_TOOLSETS in hermes_cli/tools_config.py:
("wiki", "📚 Wiki Knowledge", "list_notebooks, list_notes, read_note, search_notes, write_note, update_note, delete_note"),
```

## Key Lessons

1. **Always test handlers directly** via `registry.dispatch()` before assuming the tool works
2. **Handler signatures must match** what `registry.dispatch()` passes: `(args, **kw)`
3. **API response formats may differ** from what the code expects - always verify with direct API calls
4. **Registering tools ≠ tools working** - registration only adds to registry, execution requires correct handler signatures
5. **Toolset visibility** - tools must be in CONFIGURABLE_TOOLSETS to appear in `/tools list`
6. **Restart Hermes** after code changes - Hermes loads modules at startup, changes won't take effect in running instance
