/**
 * Shared LLM helper using OpenAI-compatible API with Volcano Engine's Responses API
 * Supports Doubao models via /api/v3/responses endpoint
 */

import https from "https";

export const MODEL = process.env.MODEL || "doubao-seed-1-8-251228";
export const RETRY_COUNT = 3;
export const RETRY_BASE_MS = 1000;
export const RETRY_MULTIPLIER = 4;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.HICLAW_LLM_API_KEY;
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || process.env.HICLAW_OPENAI_BASE_URL || "https://ark.cn-beijing.volces.com";
export const OPENAI_MAX_TOKENS = 8192;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CallClaudeOptions {
  system: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  tools?: any[];
  maxTokens?: number;
  stream?: boolean;
  onToken?: (text: string) => void;
}

function extractTextFromResponse(result: any): string {
  if (result.output?.text) {
    return result.output.text;
  }
  
  if (Array.isArray(result.output)) {
    for (const item of result.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            return content.text;
          }
        }
      }
    }
  }
  
  if (result.output?.content?.[0]?.text) {
    return result.output.content[0].text;
  }
  
  return "";
}

export async function callClaude(options: CallClaudeOptions): Promise<string> {
  const { system, messages, tools, maxTokens = OPENAI_MAX_TOKENS, stream = false, onToken } = options;
  const apiKey = OPENAI_API_KEY || process.env.HICLAW_LLM_API_KEY;
  const baseURL = OPENAI_BASE_URL || "https://ark.cn-beijing.volces.com";

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      if (tools && tools.length > 0) {
        return await callWithTool(baseURL, apiKey, system, messages, tools, maxTokens);
      }
      if (stream) {
        return await callStreaming(baseURL, apiKey, system, messages, maxTokens, onToken);
      }
      return await callBasic(baseURL, apiKey, system, messages, maxTokens);
    } catch (error) {
      if (attempt === RETRY_COUNT) throw error;

      const delayMs = RETRY_BASE_MS * Math.pow(RETRY_MULTIPLIER, attempt);
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠ API call failed (attempt ${attempt + 1}/${RETRY_COUNT + 1}): ${errMsg}`);
      console.warn(`  Retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }

  throw new Error("Unreachable");
}

async function callWithTool(
  baseURL: string,
  apiKey: string,
  system: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  tools: any[],
  maxTokens: number,
): Promise<string> {
  const tool = tools[0];
  const toolPrompt = `${system}

IMPORTANT: You must respond with a JSON object that can be parsed by the following tool schema:
Tool: ${tool.name}
Description: ${tool.description}
Schema: ${JSON.stringify(tool.input_schema)}

Return ONLY valid JSON, no markdown formatting, no code blocks.`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: toolPrompt }] },
        ...messages.map(m => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }]
        }))
      ],
      max_output_tokens: maxTokens
    });

    const req = https.request({
      hostname: baseURL.replace(/https?:\/\//, ""),
      path: "/api/v3/responses",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            reject(new Error(`${result.error.code}: ${result.error.message}`));
          } else {
            let text = extractTextFromResponse(result);
            text = text.trim();
            if (text.startsWith("```json")) {
              text = text.slice(7);
            }
            if (text.startsWith("```")) {
              text = text.slice(3);
            }
            if (text.endsWith("```")) {
              text = text.slice(0, -3);
            }
            resolve(text.trim());
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function callBasic(
  baseURL: string,
  apiKey: string,
  system: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  maxTokens: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        ...messages.map(m => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }]
        }))
      ],
      max_output_tokens: maxTokens
    });

    const req = https.request({
      hostname: baseURL.replace(/https?:\/\//, ""),
      path: "/api/v3/responses",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            reject(new Error(`${result.error.code}: ${result.error.message}`));
          } else {
            resolve(extractTextFromResponse(result));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function callStreaming(
  baseURL: string,
  apiKey: string,
  system: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  maxTokens: number,
  onToken?: (text: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        ...messages.map(m => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }]
        }))
      ],
      max_output_tokens: maxTokens,
      stream: true
    });

    const req = https.request({
      hostname: baseURL.replace(/https?:\/\//, ""),
      path: "/api/v3/responses",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
        const lines = body.split("\n");
        body = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              const text = json.output?.text || json.delta?.content || "";
              if (text) onToken?.(text);
            } catch (e) {}
          }
        }
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            reject(new Error(`${result.error.code}: ${result.error.message}`));
          } else {
            resolve(extractTextFromResponse(result));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export function getClient() {
  return {
    baseURL: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY
  };
}
