import { GoogleGenAI } from "@google/genai";
import { resolveGeminiKey } from "./ai-config";

const TEXTURE_PROMPT_PREFIX =
  "Generate a seamless tileable texture for use as a material in 3D architectural rendering. " +
  "The texture must tile perfectly in both horizontal and vertical directions with no visible seams. " +
  "Output only the texture image, no text or labels. Style: ";

export class TextureGenerator {
  private cache = new Map<string, string>();

  private getApiKey(): string {
    const key = resolveGeminiKey();
    if (!key) throw new Error("No Gemini API key configured");
    return key;
  }

  /** Generate a tileable texture image from a text prompt. Returns base64 data URL. */
  async generate(prompt: string): Promise<string> {
    const cached = this.cache.get(prompt);
    if (cached) return cached;

    const apiKey = this.getApiKey();
    console.log("[TextureGenerator] Using API key:", apiKey.substring(0, 10) + "...");
    const ai = new GoogleGenAI({ apiKey });

    const MAX_RETRIES = 3;
    let response: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [TEXTURE_PROMPT_PREFIX + prompt],
          config: {
            responseModalities: ["image", "text"],
          },
        });
        break;
      } catch (err: any) {
        const isServerError = err.message?.includes("500") || err.message?.includes("503") || err.message?.includes("INTERNAL");
        if (isServerError && attempt < MAX_RETRIES - 1) {
          const delay = 1000 * 2 ** attempt;
          console.warn(`[TextureGenerator] Attempt ${attempt + 1} failed (server error), retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error("[TextureGenerator] Gemini API call failed:", err);
        throw new Error(`Gemini API call failed: ${err.message}`);
      }
    }

    console.log("[TextureGenerator] Gemini raw response:", response);

    const candidates = response?.candidates;
    if (!candidates || candidates.length === 0) {
      console.error("[TextureGenerator] No candidates in response:", JSON.stringify(response).substring(0, 1000));
      throw new Error("Gemini returned no candidates");
    }

    const parts = candidates[0]?.content?.parts ?? [];
    console.log("[TextureGenerator] Parts count:", parts.length);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      console.log("[TextureGenerator] Part", i, "keys:", Object.keys(part), "text:", (part as any).text?.substring(0, 100));
      if ((part as any).inlineData) {
        const imageData = (part as any).inlineData.data;
        const mimeType = (part as any).inlineData.mimeType ?? "image/png";
        const dataUrl = `data:${mimeType};base64,${imageData}`;
        console.log("[TextureGenerator] Found image, dataUrl length:", dataUrl.length);
        this.cache.set(prompt, dataUrl);
        return dataUrl;
      }
    }

    console.error("[TextureGenerator] No inlineData in any part. Full response:", JSON.stringify(response).substring(0, 2000));
    throw new Error("Gemini did not return an image. Parts: " + parts.map((p: any) => Object.keys(p).join(",")).join("; "));
  }

  /** Generate a texture and apply it to a material contract in the document. */
  async generateAndApply(
    prompt: string,
    materialId: string,
    doc: { update(id: string, patch: Record<string, unknown>): void },
  ): Promise<string> {
    console.log("[TextureGenerator] generateAndApply called:", prompt, "materialId:", materialId);
    const dataUrl = await this.generate(prompt);
    console.log("[TextureGenerator] Got texture, dataUrl length:", dataUrl.length);
    doc.update(materialId, { textureData: dataUrl, texturePrompt: prompt });
    console.log("[TextureGenerator] doc.update called with textureData");
    return dataUrl;
  }
}
