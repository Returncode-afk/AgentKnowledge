#!/usr/bin/env python3
"""Wiki Compilation Script - Uses hermes-agent's LLM for concept extraction."""

import json
import os
import re
import sys
from pathlib import Path

HERMES_DIR = Path.home() / ".hermes"
HERMES_AGENT_DIR = Path(__file__).parent.parent / "hermes-agent-main" / "hermes-agent-main"

WIKI_DIR = Path(__file__).parent
LLM_WIKI_DIR = WIKI_DIR / "llm-wiki-compiler-main"
SOURCES_DIR = LLM_WIKI_DIR / "sources"
WIKI_OUT_DIR = LLM_WIKI_DIR / "wiki"
CONCEPTS_DIR = WIKI_OUT_DIR / "concepts"


def get_hermes_client():
    config_file = HERMES_DIR / "config.yaml"
    if not config_file.exists():
        raise RuntimeError(f"Hermes config not found: {config_file}")

    import yaml
    with open(config_file, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    model_config = config.get("model", {})
    base_url = model_config.get("base_url", "")
    default_model = model_config.get("default", "doubao-seed-2-0-lite-260215")

    api_key = ""
    env_file = HERMES_DIR / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    break

    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found in ~/.hermes/.env")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    if base_url:
        client.base_url = base_url
    return client, default_model


def extract_concepts(content: str, client, model: str) -> list[dict]:
    prompt = f"""你是一个知识架构师。分析以下文本，提取关键概念。

对于每个概念，请提供：
1. concept_name: 简洁且可搜索的名称（适当使用中文）
2. definition: 1-2句话的简要定义
3. related_concepts: 0-3个相关概念的列表

文本：
{content[:3000]}

返回一个JSON数组格式的概念列表。示例：
[
  {{"concept_name": "资本", "definition": "用于生产或投资的货币资源", "related_concepts": ["投资", "资产"]}}
]

只返回有效的JSON，不要markdown格式。"""

    messages = [{"role": "user", "content": prompt}]

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000,
        )
        content_text = response.choices[0].message.content
        json_match = re.search(r'\[[\s\S]*\]', content_text)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"LLM调用失败: {e}", file=sys.stderr)

    return []


def compile_note(note_path: Path, client, model: str) -> bool:
    print(f"正在编译: {note_path.name}")

    content = note_path.read_text(encoding="utf-8")
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    title = title_match.group(1) if title_match else note_path.stem

    concepts = extract_concepts(content, client, model)

    if not concepts:
        print(f"  未提取到概念: {note_path.name}")
        return False

    CONCEPTS_DIR.mkdir(parents=True, exist_ok=True)

    for concept in concepts:
        safe_name = re.sub(r'[^\w\u4e00-\u9fff-]', '_', concept["concept_name"])
        concept_file = CONCEPTS_DIR / f"{safe_name}.md"

        related_wikilinks = [f"[[{r}]]" for r in concept.get("related_concepts", [])]
        wikilinks_str = " ".join(related_wikilinks)

        concept_content = f"""# {concept['concept_name']}

{concept.get('definition', '')}

## 来源

来自: [[{title}]]

## 相关概念

{wikilinks_str}

---
*由Wiki编译器自动生成*
"""
        concept_file.write_text(concept_content, encoding="utf-8")
        print(f"  创建概念: {concept['concept_name']}")

    index_file = CONCEPTS_DIR / "index.md"
    index_content = f"""# 概念索引

来源: {title}

## 所有概念

"""
    for concept in concepts:
        index_content += f"- [[{concept['concept_name']}]]: {concept.get('definition', '')}\n"

    index_file.write_text(index_content, encoding="utf-8")

    return True


def main():
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    source_files = list(SOURCES_DIR.glob("*.md"))
    if not source_files:
        print("sources/ 目录中没有源文件")
        return

    print(f"找到 {len(source_files)} 个源文件")

    try:
        client, model = get_hermes_client()
        print(f"使用模型: {model}")
    except Exception as e:
        print(f"创建LLM客户端失败: {e}", file=sys.stderr)
        return

    success_count = 0
    for source_file in source_files:
        if compile_note(source_file, client, model):
            success_count += 1

    print(f"\n编译完成: {success_count}/{len(source_files)} 个笔记已处理")


if __name__ == "__main__":
    main()
