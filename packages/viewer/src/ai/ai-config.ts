const GEMINI_KEY_STORAGE = "bim-ai-gemini-key";

let _envKey: string | undefined;

/** Called by the host app to provide the env-injected API key. */
export function setGeminiEnvKey(key: string): void {
  _envKey = key;
}

/** Resolve the Gemini API key: localStorage override > env var > undefined. */
export function resolveGeminiKey(): string | undefined {
  return localStorage.getItem(GEMINI_KEY_STORAGE) ?? _envKey ?? undefined;
}

export function getUserGeminiKey(): string | null {
  return localStorage.getItem(GEMINI_KEY_STORAGE);
}

export function setUserGeminiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY_STORAGE, key);
}
