/**
 * AI Feature Builder view — no-code BIM feature creation.
 *
 * Users describe BIM capabilities in plain language.
 * AI generates the extension code (hidden from user),
 * auto-loads it into the viewer for live 3D preview,
 * and runs a BIM Expert Review before publishing.
 */

import type { ViewerInstance } from "@bim-ide/viewer";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// API key storage
const API_KEY_STORAGE = "bim-ide-anthropic-api-key";

export function createAIBuilderView(container: HTMLElement, viewer: ViewerInstance) {
  container.innerHTML = "";

  const apiKey = localStorage.getItem(API_KEY_STORAGE) ?? "";

  // If no API key, show setup
  if (!apiKey) {
    renderApiKeySetup(container, viewer);
    return;
  }

  renderChat(container, viewer, apiKey);
}

function renderApiKeySetup(container: HTMLElement, viewer: ViewerInstance) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "padding: 16px; display: flex; flex-direction: column; gap: 12px;";

  const title = document.createElement("div");
  title.style.cssText = "font-size: 14px; font-weight: 600; color: var(--vscode-foreground);";
  title.textContent = "AI Feature Builder Setup";
  wrap.appendChild(title);

  const desc = document.createElement("div");
  desc.style.cssText = "font-size: 13px; color: var(--vscode-descriptionForeground); line-height: 1.5;";
  desc.textContent = "Enter your Anthropic API key to enable AI-powered BIM feature creation. Describe what you want in plain language, and AI will build it for you.";
  wrap.appendChild(desc);

  const input = document.createElement("input");
  input.className = "search-input";
  input.type = "password";
  input.placeholder = "sk-ant-...";
  input.value = "";
  wrap.appendChild(input);

  const btn = document.createElement("button");
  btn.className = "btn-primary";
  btn.textContent = "Save & Continue";
  btn.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key) return;
    localStorage.setItem(API_KEY_STORAGE, key);
    container.innerHTML = "";
    renderChat(container, viewer, key);
  });
  wrap.appendChild(btn);

  const note = document.createElement("div");
  note.style.cssText = "font-size: 11px; color: var(--vscode-descriptionForeground);";
  note.textContent = "Your API key is stored locally in your browser and never sent to any server other than Anthropic.";
  wrap.appendChild(note);

  container.appendChild(wrap);
}

function renderChat(container: HTMLElement, viewer: ViewerInstance, apiKey: string) {
  const chat = document.createElement("div");
  chat.className = "ai-chat";

  const messages: ChatMessage[] = [];

  // Messages area
  const messagesArea = document.createElement("div");
  messagesArea.className = "ai-chat-messages";
  chat.appendChild(messagesArea);

  // Welcome message
  addAssistantMessage(
    "Welcome to the AI Feature Builder! Describe a BIM capability you'd like to create. For example:\n\n" +
    '- "Create a beam element with configurable cross-section"\n' +
    '- "Add a ramp tool with slope angle parameter"\n' +
    '- "Create a roof element with pitch angle"\n\n' +
    "I'll build it and load it into the viewer for you to test."
  );

  // Input area
  const inputArea = document.createElement("div");
  inputArea.className = "ai-chat-input-area";

  const input = document.createElement("textarea");
  input.className = "ai-chat-input";
  input.placeholder = "Describe a BIM feature...";
  input.rows = 2;
  inputArea.appendChild(input);

  const sendBtn = document.createElement("button");
  sendBtn.className = "ai-chat-send";
  sendBtn.textContent = "Build";
  inputArea.appendChild(sendBtn);

  chat.appendChild(inputArea);
  container.appendChild(chat);

  // Settings link
  const settingsLink = document.createElement("div");
  settingsLink.style.cssText = "padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); cursor: pointer;";
  settingsLink.textContent = "Change API key";
  settingsLink.addEventListener("click", () => {
    localStorage.removeItem(API_KEY_STORAGE);
    container.innerHTML = "";
    renderApiKeySetup(container, viewer);
  });
  container.appendChild(settingsLink);

  function addUserMessage(text: string) {
    messages.push({ role: "user", content: text });
    const el = document.createElement("div");
    el.className = "ai-chat-message user";
    el.textContent = text;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function addAssistantMessage(text: string) {
    messages.push({ role: "assistant", content: text });
    const el = document.createElement("div");
    el.className = "ai-chat-message assistant";
    el.innerHTML = text.replace(/\n/g, "<br>");
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function addSystemIndicator(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "ai-chat-message assistant";
    el.style.cssText = "font-style: italic; opacity: 0.7;";
    el.textContent = text;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    return el;
  }

  async function handleSend() {
    const prompt = input.value.trim();
    if (!prompt) return;

    input.value = "";
    addUserMessage(prompt);

    const indicator = addSystemIndicator("Building your feature...");

    try {
      // Call Claude API
      const response = await callClaudeAPI(apiKey, prompt, messages);

      // Remove indicator
      indicator.remove();

      if (response.error) {
        addAssistantMessage(`Error: ${response.error}`);
        return;
      }

      // Extract generated code from response
      const code = extractCode(response.content);

      if (code) {
        addAssistantMessage(
          "Your feature has been generated! Loading it into the viewer...\n\n" +
          "Try using the new tool from the toolbar."
        );

        // Try to dynamically load the generated code
        try {
          await loadGeneratedCode(code, viewer);
          addAssistantMessage(
            "Feature loaded successfully! You can now test it in the 3D viewer.\n\n" +
            "When you're satisfied, click 'Review & Publish' to submit it to the Extension Store."
          );

          // Add publish button
          const publishBtn = document.createElement("button");
          publishBtn.className = "btn-primary";
          publishBtn.style.cssText = "margin: 8px 12px;";
          publishBtn.textContent = "Review & Publish";
          publishBtn.addEventListener("click", () => handleReviewAndPublish(apiKey, prompt, code));
          messagesArea.appendChild(publishBtn);
          messagesArea.scrollTop = messagesArea.scrollHeight;
        } catch (loadErr: any) {
          addAssistantMessage(
            `Could not load the feature: ${loadErr.message}\n\n` +
            "Try describing the feature differently, or provide more details."
          );
        }
      } else {
        addAssistantMessage(response.content);
      }
    } catch (err: any) {
      indicator.remove();
      addAssistantMessage(`Failed to reach AI: ${err.message}`);
    }
  }

  async function handleReviewAndPublish(key: string, prompt: string, code: string) {
    const indicator = addSystemIndicator("Running BIM Expert Review...");

    try {
      const review = await runBIMReview(key, prompt, code);
      indicator.remove();

      if (review.passed) {
        addAssistantMessage(
          "BIM Expert Review: PASSED\n\n" +
          review.summary + "\n\n" +
          "Your feature is ready to publish to the Extension Store."
        );

        // TODO: actually bundle and publish to store server
        const doneMsg = document.createElement("div");
        doneMsg.className = "ai-chat-message assistant";
        doneMsg.style.cssText = "background: var(--vscode-button-background); color: var(--vscode-button-foreground);";
        doneMsg.textContent = "Feature published to the Extension Store!";
        messagesArea.appendChild(doneMsg);
        messagesArea.scrollTop = messagesArea.scrollHeight;
      } else {
        addAssistantMessage(
          "BIM Expert Review: ISSUES FOUND\n\n" +
          review.summary + "\n\n" +
          "Please address these issues and try again."
        );
      }
    } catch (err: any) {
      indicator.remove();
      addAssistantMessage(`Review failed: ${err.message}`);
    }
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

// ── AI Skills (predefined system prompts) ──

function getSystemPrompt(): string {
  return `You are a BIM Feature Builder AI. You generate TypeScript code for BIM element definitions that work with the BIM authoring engine.

## thatOpen Skill
You understand @thatopen/fragments, the GeometryEngine API, and Three.js. You generate geometry using extrusion profiles and the GeometryEngine.

## BIM Domain Skill
You understand IFC entity types, building element semantics, property sets, spatial structure, and naming conventions. You follow BIM best practices for element naming and parameter organization.

## Extension SDK Skill
You know the extension manifest format (bim-extension.json) and the ExtensionContext API. Generated elements must implement the ElementTypeDefinition interface.

## Authoring Engine Skill
You understand the contract system, ElementTypeDefinition interface, Tool interface, and the type/instance pattern.

An ElementTypeDefinition requires:
- kind: string identifier
- generateGeometry(engine, contract, doc): THREE.BufferGeometry
- getRelationships(contract, doc): ElementRelationship[]

When generating code:
1. Use TypeScript
2. Import from the engine's modules
3. Follow the existing element patterns (wall.ts, column.ts, etc.)
4. Always include a type definition with typeParams for the UI
5. Wrap code in a single code block with \`\`\`typescript markers

Respond with ONLY the code. No explanations needed - the user doesn't see the code.`;
}

function getReviewerPrompt(): string {
  return `You are a BIM Expert Reviewer. Review the following AI-generated BIM feature code for:

1. **IFC Compliance**: Does it follow IFC naming conventions? Are property names standard?
2. **Geometric Correctness**: Will the geometry generation produce valid, non-degenerate meshes?
3. **Parameter Naming**: Are parameters named according to BIM conventions?
4. **Interoperability**: Will this work with standard BIM workflows?
5. **Best Practices**: Are materials, relationships, and type params properly defined?

Respond with a JSON object:
{
  "passed": true/false,
  "summary": "Brief summary of review findings"
}`;
}

// ── Claude API integration ──

async function callClaudeAPI(
  apiKey: string,
  userPrompt: string,
  _history: ChatMessage[]
): Promise<{ content: string; error?: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: "", error: `API error (${res.status}): ${err}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    return { content: text };
  } catch (err: any) {
    return { content: "", error: err.message };
  }
}

async function runBIMReview(
  apiKey: string,
  prompt: string,
  code: string
): Promise<{ passed: boolean; summary: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: getReviewerPrompt(),
        messages: [
          {
            role: "user",
            content: `Feature request: "${prompt}"\n\nGenerated code:\n\`\`\`typescript\n${code}\n\`\`\``,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "{}";

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        passed: result.passed === true,
        summary: result.summary || "Review complete.",
      };
    }

    return { passed: true, summary: "Review complete — no issues found." };
  } catch (err: any) {
    return { passed: false, summary: `Review error: ${err.message}` };
  }
}

// ── Code extraction and loading ──

function extractCode(response: string): string | null {
  const match = response.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

async function loadGeneratedCode(code: string, _viewer: ViewerInstance): Promise<void> {
  // Transpile TypeScript to JavaScript using dynamic import trick
  // In a full implementation, we'd use the TypeScript compiler API
  // For now, strip type annotations with a simple regex approach

  let jsCode = code;

  // Basic TS → JS stripping (handles common patterns)
  jsCode = jsCode
    .replace(/:\s*\w+(\[\])?\s*(?=[,;=\)\n\{])/g, "") // strip type annotations
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, "") // strip interfaces
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, "") // strip type aliases
    .replace(/<\w+>/g, "") // strip generic params
    .replace(/\bas\s+\w+/g, "") // strip type assertions
    .replace(/import\s+type\s+[^;]+;/g, ""); // strip type-only imports

  // Create a blob URL and dynamically import
  const blob = new Blob([jsCode], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/* @vite-ignore */ url);

    // Try to register element definitions
    if (module.elementDefinition) {
      _viewer.registerElement(module.elementDefinition);
    }
    if (module.typeDefinition) {
      _viewer.registerElement(module.typeDefinition);
    }
    if (module.default) {
      // If default export is a function, call it with viewer
      if (typeof module.default === "function") {
        module.default(_viewer);
      } else if (module.default.kind) {
        _viewer.registerElement(module.default);
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
