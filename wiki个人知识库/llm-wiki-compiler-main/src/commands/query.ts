/**
 * Commander action for `llmwiki query <question>`.
 * Two-step LLM-powered wiki query that first selects relevant pages from the
 * wiki index, then streams an answer grounded in those pages. Optionally saves
 * the response as a new page in wiki/queries/.
 *
 * Step 1 - Page Selection: Reads wiki/index.md and asks the LLM (via tool_use)
 * to pick the most relevant concept pages for the question.
 *
 * Step 2 - Answer Generation: Loads the selected pages in full and streams
 * a cited answer to the terminal.
 */

import { existsSync } from "fs";
import path from "path";
import { callClaude } from "../utils/llm.js";
import { atomicWrite, safeReadFile, slugify, buildFrontmatter, parseFrontmatter } from "../utils/markdown.js";
import { generateIndex } from "../compiler/indexgen.js";
import * as output from "../utils/output.js";
import { QUERY_PAGE_LIMIT, INDEX_FILE, CONCEPTS_DIR, QUERIES_DIR } from "../utils/constants.js";

/** Directories to search when loading selected pages, in priority order. */
const PAGE_DIRS = [CONCEPTS_DIR, QUERIES_DIR];

const PAGE_SELECTION_TOOL = {
  name: "select_pages",
  description: "Select the most relevant wiki pages to answer a question",
  parameters: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        items: {
          type: "string",
          description: "Slug of a relevant wiki page (e.g. 'llm-knowledge-bases')",
        },
        maxItems: QUERY_PAGE_LIMIT,
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why these pages were selected",
      },
    },
    required: ["pages", "reasoning"],
  },
};

interface PageSelectionResult {
  pages: string[];
  reasoning: string;
}

async function selectPages(
  question: string,
  indexContent: string,
): Promise<PageSelectionResult> {
  const systemPrompt =
    "You are a knowledge base assistant. Given a question and a wiki index, select the most relevant pages.";

  const userMessage = `Question: ${question}\n\nWiki Index:\n${indexContent}`;

  const rawResult = await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools: [PAGE_SELECTION_TOOL],
  });

  try {
    const parsed = JSON.parse(rawResult);
    return {
      pages: Array.isArray(parsed.pages) ? parsed.pages.filter((p: unknown) => typeof p === "string") : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
    };
  } catch {
    return { pages: [], reasoning: "Failed to parse page selection response" };
  }
}

export async function loadSelectedPages(root: string, slugs: string[]): Promise<string> {
  const sections: string[] = [];

  for (const slug of slugs) {
    let content = "";
    for (const dir of PAGE_DIRS) {
      const candidate = await safeReadFile(path.join(root, dir, `${slug}.md`));
      if (!candidate) continue;
      const { meta } = parseFrontmatter(candidate);
      if (meta.orphaned) continue;
      content = candidate;
      break;
    }

    if (!content) {
      output.status("?", output.warn(`Page not found: ${slug}.md — skipping`));
      continue;
    }

    sections.push(`--- Page: ${slug} ---\n${content}`);
  }

  return sections.join("\n\n");
}

async function streamAnswer(question: string, pagesContent: string): Promise<string> {
  const systemPrompt =
    "You are a knowledge assistant. Answer the question using ONLY the wiki content provided. " +
    "Cite specific pages using [[Page Title]] wikilinks. " +
    "If the wiki doesn't contain enough information, say so.";

  const userMessage = `Question: ${question}\n\nRelevant wiki pages:\n${pagesContent}`;

  const answer = await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    stream: true,
    onToken: (text: string) => process.stdout.write(text),
  });

  process.stdout.write("\n");
  return answer;
}

export function summarizeAnswer(answer: string): string {
  const firstLine = answer.trim().split(/\n/)[0] ?? "";
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  return firstSentence.slice(0, 120);
}

async function saveQueryPage(root: string, question: string, answer: string): Promise<void> {
  const slug = slugify(question);
  const filePath = path.join(root, QUERIES_DIR, `${slug}.md`);

  const frontmatter = buildFrontmatter({
    title: question,
    summary: summarizeAnswer(answer),
    type: "query",
    createdAt: new Date().toISOString(),
  });

  const document = `${frontmatter}\n\n${answer}\n`;
  await atomicWrite(filePath, document);

  output.status(
    "+",
    output.success(`Saved query → ${output.source(filePath)}`),
  );

  await generateIndex(root);
}

export default async function queryCommand(
  root: string,
  question: string,
  options: { save?: boolean },
): Promise<void> {
  if (!existsSync(path.join(root, INDEX_FILE))) {
    output.status("!", output.error("Wiki index not found. Run `llmwiki compile` first."));
    return;
  }

  output.header("Selecting relevant pages");

  const indexContent = await safeReadFile(path.join(root, INDEX_FILE));
  const { pages: rawPages, reasoning } = await selectPages(question, indexContent);
  const pages = rawPages.map((p) => slugify(p));

  output.status("i", output.dim(`Reasoning: ${reasoning}`));
  output.status("*", output.info(`Selected ${pages.length} page(s): ${rawPages.join(", ")}`));

  output.header("Generating answer");

  const pagesContent = await loadSelectedPages(root, pages);

  if (!pagesContent) {
    output.status("!", output.error("No matching pages found. Try refining your question."));
    return;
  }

  const answer = await streamAnswer(question, pagesContent);

  if (options.save) {
    await saveQueryPage(root, question, answer);
    output.status("→", output.dim("Saved. Future queries will use this answer as context."));
  } else {
    output.status("→", output.dim("Tip: use --save to add this answer to your wiki"));
  }
}
