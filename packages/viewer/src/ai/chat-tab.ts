import type { BimDocument } from "../core/document";
import { getApiKey, setApiKey, sendMessage, type Message } from "./claude-client";
import { buildSystemPrompt } from "./system-prompt";
import { execute, extractCode, extractSummary } from "./executor";
import { SessionTracker } from "./session-tracker";
import { bundleSession } from "./bundler";
import { TextureRenderer } from "./texture-renderer";
import type { GisLayer3d } from "../gis/gis-layer-3d";

interface ChatEntry {
  role: "user" | "assistant" | "system";
  text: string;
  code?: string;
  success?: boolean;
}

export class AiChatTab {
  private doc: BimDocument;
  private tracker = new SessionTracker();
  private history: ChatEntry[] = [];
  private messages: Message[] = [];
  private container: HTMLElement | null = null;
  private isBusy = false;
  private textureRenderer: TextureRenderer;
  private gisLayer: GisLayer3d;

  constructor(
    doc: BimDocument,
    textureRenderer: TextureRenderer,
    gisLayer: GisLayer3d,
  ) {
    this.doc = doc;
    this.textureRenderer = textureRenderer;
    this.gisLayer = gisLayer;
  }

  render(container: HTMLElement) {
    this.container = container;
    container.innerHTML = "";

    const apiKey = getApiKey();

    if (!apiKey) {
      this.renderApiKeyForm(container);
      return;
    }

    // Chat wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "ai-chat-wrapper";

    // Header with actions
    const header = document.createElement("div");
    header.className = "ai-chat-header";

    const title = document.createElement("span");
    title.textContent = "AI Builder";
    header.appendChild(title);

    const keyBtn = document.createElement("button");
    keyBtn.textContent = "Key";
    keyBtn.title = "Change API key";
    keyBtn.addEventListener("click", () => {
      localStorage.removeItem("bim-ai-api-key");
      this.render(container);
    });
    header.appendChild(keyBtn);

    wrapper.appendChild(header);

    // Messages area
    const messagesArea = document.createElement("div");
    messagesArea.className = "ai-chat-messages";
    wrapper.appendChild(messagesArea);

    this.renderMessages(messagesArea);

    // Input area
    const inputArea = document.createElement("div");
    inputArea.className = "ai-chat-input-area";

    const textarea = document.createElement("textarea");
    textarea.className = "ai-chat-textarea";
    textarea.placeholder = "Describe what you want to build...";
    textarea.rows = 2;
    inputArea.appendChild(textarea);

    const btnRow = document.createElement("div");
    btnRow.className = "ai-chat-btn-row";

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    sendBtn.className = "ai-chat-send";
    sendBtn.addEventListener("click", () => this.handleSend(textarea, messagesArea));
    btnRow.appendChild(sendBtn);

    // Enter to send
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend(textarea, messagesArea);
      }
    });

    if (this.tracker.hasActions()) {
      const bundleBtn = document.createElement("button");
      bundleBtn.textContent = "Bundle Extension";
      bundleBtn.className = "ai-chat-bundle";
      bundleBtn.addEventListener("click", () => this.handleBundle(messagesArea));
      btnRow.appendChild(bundleBtn);
    }

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.className = "ai-chat-clear";
    clearBtn.addEventListener("click", () => {
      this.history = [];
      this.messages = [];
      this.tracker.clear();
      this.render(container);
    });
    btnRow.appendChild(clearBtn);

    inputArea.appendChild(btnRow);
    wrapper.appendChild(inputArea);

    container.appendChild(wrapper);

    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
    textarea.focus();
  }

  private renderApiKeyForm(container: HTMLElement) {
    const form = document.createElement("div");
    form.className = "ai-key-form";
    form.innerHTML = `
      <h3>AI Builder</h3>
      <p style="font-size:12px;color:#999;margin-bottom:12px;">Enter your API keys to start building with AI.</p>
    `;

    // Anthropic key
    const label1 = document.createElement("label");
    label1.textContent = "Anthropic API Key";
    label1.style.cssText = "font-size:11px;color:#aaa;margin-bottom:2px;display:block;";
    form.appendChild(label1);

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "sk-ant-...";
    input.style.cssText = "width:100%;padding:6px 8px;border:1px solid #555;border-radius:4px;background:#1a1a1a;color:#e0e0e0;font-size:13px;margin-bottom:8px;";
    form.appendChild(input);

    // Gemini key
    const label2 = document.createElement("label");
    label2.textContent = "Gemini API Key (optional, for photorealistic rendering)";
    label2.style.cssText = "font-size:11px;color:#aaa;margin-bottom:2px;display:block;";
    form.appendChild(label2);

    const geminiInput = document.createElement("input");
    geminiInput.type = "password";
    geminiInput.placeholder = "AIza...";
    geminiInput.value = TextureRenderer.getGeminiKey() ?? "";
    geminiInput.style.cssText = "width:100%;padding:6px 8px;border:1px solid #555;border-radius:4px;background:#1a1a1a;color:#e0e0e0;font-size:13px;margin-bottom:8px;";
    form.appendChild(geminiInput);

    const btn = document.createElement("button");
    btn.textContent = "Save Keys";
    btn.style.cssText = "width:100%;padding:6px;border:1px solid #0088ff;border-radius:4px;background:#0066cc;color:#fff;cursor:pointer;font-size:13px;";
    btn.addEventListener("click", () => {
      const key = input.value.trim();
      const geminiKey = geminiInput.value.trim();
      if (key) {
        setApiKey(key);
        if (geminiKey) TextureRenderer.setGeminiKey(geminiKey);
        this.render(container);
      }
    });
    form.appendChild(btn);

    container.appendChild(form);
  }

  private renderMessages(area: HTMLElement) {
    area.innerHTML = "";
    if (this.history.length === 0) {
      const hint = document.createElement("div");
      hint.className = "ai-chat-hint";
      hint.innerHTML = `<p>Try commands like:</p>
        <ul>
          <li>"Place 5 columns in a row"</li>
          <li>"Create a rectangular room 6m x 4m"</li>
          <li>"Add a grid of columns 3x3 with 3m spacing"</li>
        </ul>`;
      area.appendChild(hint);
      return;
    }

    for (const entry of this.history) {
      const msg = document.createElement("div");
      msg.className = `ai-chat-msg ai-chat-msg-${entry.role}`;

      if (entry.role === "user") {
        msg.textContent = entry.text;
      } else if (entry.role === "assistant") {
        // Summary text
        const summary = document.createElement("div");
        summary.textContent = entry.text;
        msg.appendChild(summary);

        // Code block (collapsible)
        if (entry.code) {
          const details = document.createElement("details");
          const summaryEl = document.createElement("summary");
          summaryEl.textContent = entry.success ? "Code (executed)" : "Code (failed)";
          summaryEl.style.color = entry.success ? "#4ec9b0" : "#f44747";
          summaryEl.style.cursor = "pointer";
          summaryEl.style.fontSize = "11px";
          summaryEl.style.marginTop = "6px";
          details.appendChild(summaryEl);

          const pre = document.createElement("pre");
          pre.className = "ai-chat-code";
          pre.textContent = entry.code;
          details.appendChild(pre);
          msg.appendChild(details);
        }
      } else {
        // system message (bundle results, errors)
        msg.textContent = entry.text;
        msg.style.color = "#999";
        msg.style.fontStyle = "italic";
      }

      area.appendChild(msg);
    }
  }

  private async handleSend(textarea: HTMLTextAreaElement, messagesArea: HTMLElement) {
    const text = textarea.value.trim();
    if (!text || this.isBusy) return;

    this.isBusy = true;
    textarea.value = "";

    // Add user message
    this.history.push({ role: "user", text });
    this.messages.push({ role: "user", content: text });
    this.renderMessages(messagesArea);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Show loading
    const loading = document.createElement("div");
    loading.className = "ai-chat-msg ai-chat-msg-system";
    loading.textContent = "Thinking...";
    messagesArea.appendChild(loading);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    try {
      const systemPrompt = buildSystemPrompt(this.doc);
      const response = await sendMessage(this.messages, systemPrompt);

      messagesArea.removeChild(loading);

      const code = extractCode(response);
      const summary = extractSummary(response);

      let success = false;
      let errorMsg = "";

      if (code) {
        const result = await execute(code, this.doc, this.textureRenderer, this.gisLayer);
        success = result.success;
        errorMsg = result.error ?? "";

        if (success) {
          this.tracker.record({
            prompt: text,
            code,
            summary,
            createdIds: result.createdIds,
            removedIds: result.removedIds,
            timestamp: Date.now(),
          });
        }
      }

      const displayText = success
        ? summary || "Done."
        : code
          ? `Error: ${errorMsg}`
          : response;

      this.history.push({ role: "assistant", text: displayText, code: code ?? undefined, success });
      this.messages.push({ role: "assistant", content: response });

      this.renderMessages(messagesArea);
      messagesArea.scrollTop = messagesArea.scrollHeight;

      // Re-render full tab to show/hide bundle button
      if (this.container) this.render(this.container);
    } catch (e: any) {
      messagesArea.removeChild(loading);
      this.history.push({ role: "system", text: `Error: ${e.message}` });
      this.renderMessages(messagesArea);
    } finally {
      this.isBusy = false;
    }
  }

  private async handleBundle(messagesArea: HTMLElement) {
    if (this.isBusy || !this.tracker.hasActions()) return;
    this.isBusy = true;

    this.history.push({ role: "system", text: "Bundling session into extension..." });
    this.renderMessages(messagesArea);

    try {
      const result = await bundleSession(this.tracker, this.doc);
      this.history.push({
        role: "assistant",
        text: `Extension "${result.name}" bundled!\n\n${result.description}\n\nCode has been saved. Other users can install this extension.`,
        code: result.code,
        success: true,
      });
    } catch (e: any) {
      this.history.push({ role: "system", text: `Bundle failed: ${e.message}` });
    } finally {
      this.isBusy = false;
      this.renderMessages(messagesArea);
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  }
}
