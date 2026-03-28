import { GoogleGenAI } from "@google/genai";
import * as THREE from "three";

const GEMINI_KEY_STORAGE = "bim-ai-gemini-key";
const DEFAULT_GEMINI_KEY = "AIzaSyDxWtzW3jd3vtGlY90ag99A5HfA2yYxQMg";

const DEFAULT_PROMPT =
  "Transform the provided screenshot of a BIM model into a the style of a photorealistic picture of an architecture project similar to the architecture magazines. Preserve the original composition but render all elements as if they were a real picture of a building.";

export class TextureRenderer {
  private previousImage: HTMLImageElement | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private container: HTMLElement,
  ) {}

  static getGeminiKey(): string | null {
    return localStorage.getItem(GEMINI_KEY_STORAGE);
  }

  static setGeminiKey(key: string): void {
    localStorage.setItem(GEMINI_KEY_STORAGE, key);
  }

  /** Capture current scene, send to Gemini for photorealistic transformation, and display as overlay. */
  async render(customPrompt?: string): Promise<string | null> {
    const apiKey = TextureRenderer.getGeminiKey() ?? DEFAULT_GEMINI_KEY;

    // Force a fresh render and capture
    this.renderer.render(this.scene, this.camera);
    const canvas = this.renderer.domElement as HTMLCanvasElement;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];

    // Build prompt
    let prompt = DEFAULT_PROMPT;
    if (customPrompt) {
      prompt += " Additionally, take this prompt into account: " + customPrompt;
    }

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        prompt,
        {
          inlineData: {
            mimeType: "image/png",
            data: base64,
          },
        },
      ],
    });

    // Extract image from response
    for (const part of response.candidates![0].content!.parts!) {
      if ((part as any).inlineData) {
        const imageData = (part as any).inlineData.data;
        const resultUrl = `data:image/png;base64,${imageData}`;

        // Display overlay
        this.discard();
        const img = document.createElement("img");
        img.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:10;";
        img.src = resultUrl;
        this.container.appendChild(img);
        this.previousImage = img;

        return resultUrl;
      }
    }

    return null;
  }

  /** Remove the photorealistic overlay image. */
  discard(): void {
    if (this.previousImage) {
      this.previousImage.remove();
      this.previousImage = null;
    }
  }

  /** Download the current overlay as a PNG file. */
  download(filename = "photorealistic-render.png"): void {
    if (!this.previousImage?.src) return;
    const link = document.createElement("a");
    link.href = this.previousImage.src;
    link.download = filename;
    link.click();
  }
}
