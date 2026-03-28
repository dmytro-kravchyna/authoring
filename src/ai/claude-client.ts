const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6-20250514";
const STORAGE_KEY = "bim-ai-api-key";

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string) {
  localStorage.setItem(STORAGE_KEY, key);
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function sendMessage(
  messages: Message[],
  systemPrompt: string
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key not set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.content[0].text;
}
