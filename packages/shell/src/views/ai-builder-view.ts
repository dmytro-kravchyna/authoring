/**
 * AI Feature Builder view — session-based BIM feature creation.
 *
 * Users interact in a conversational session, issuing commands
 * that execute against the viewer in real time. Commands can
 * create/modify elements using existing types or define entirely
 * new element kinds. When satisfied, the user can "Bundle" the
 * session into an extension and publish it to the Extension Store.
 */

import type { ViewerInstance } from "@bim-ide/viewer";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  startedAt: number;
  commands: Array<{ prompt: string; code: string; timestamp: number }>;
  createdContractIds: string[];
  registeredKinds: string[];
}

// API key storage
const API_KEY_STORAGE = "bim-ide-anthropic-api-key";
const STORE_URL = "http://localhost:4000/api";

export function createAIBuilderView(container: HTMLElement, viewer: ViewerInstance) {
  container.innerHTML = "";
  const apiKey = localStorage.getItem(API_KEY_STORAGE) ?? "";
  if (!apiKey) {
    renderApiKeySetup(container, viewer);
  } else {
    renderChat(container, viewer, apiKey);
  }
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

function createSession(): Session {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    commands: [],
    createdContractIds: [],
    registeredKinds: [],
  };
}

function renderChat(container: HTMLElement, viewer: ViewerInstance, apiKey: string) {
  const chat = document.createElement("div");
  chat.className = "ai-chat";

  const messages: ChatMessage[] = [];
  let session = createSession();

  // Messages area
  const messagesArea = document.createElement("div");
  messagesArea.className = "ai-chat-messages";
  chat.appendChild(messagesArea);

  // Welcome message
  addAssistantMessage(
    "Welcome to the AI Feature Builder! Start a session by describing what you want to build.\n\n" +
    "You can issue multiple commands and see results live:\n" +
    '- "Create 5 random columns"\n' +
    '- "Add a wall from (0,0) to (5,0)"\n' +
    '- "Create a beam element with configurable cross-section"\n\n' +
    'When ready, click <b>Bundle</b> to package your session as an installable extension.'
  );

  // Input area
  const inputArea = document.createElement("div");
  inputArea.className = "ai-chat-input-area";

  const input = document.createElement("textarea");
  input.className = "ai-chat-input";
  input.placeholder = "Describe what to build...";
  input.rows = 2;
  inputArea.appendChild(input);

  // Button bar
  const btnBar = document.createElement("div");
  btnBar.style.cssText = "display: flex; gap: 4px; align-items: flex-end;";

  const sendBtn = document.createElement("button");
  sendBtn.className = "ai-chat-send";
  sendBtn.textContent = "Send";
  btnBar.appendChild(sendBtn);

  const bundleBtn = document.createElement("button");
  bundleBtn.className = "ai-chat-send";
  bundleBtn.textContent = "Bundle";
  bundleBtn.style.cssText = "background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);";
  bundleBtn.disabled = true;
  btnBar.appendChild(bundleBtn);

  const newSessionBtn = document.createElement("button");
  newSessionBtn.className = "ai-chat-send";
  newSessionBtn.textContent = "New";
  newSessionBtn.title = "Start a new session";
  newSessionBtn.style.cssText = "background: transparent; color: var(--vscode-descriptionForeground); min-width: 36px; padding: 4px;";
  btnBar.appendChild(newSessionBtn);

  inputArea.appendChild(btnBar);
  chat.appendChild(inputArea);
  container.appendChild(chat);

  // Session indicator
  const sessionIndicator = document.createElement("div");
  sessionIndicator.style.cssText = "padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; justify-content: space-between;";
  updateSessionIndicator();
  container.appendChild(sessionIndicator);

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

  function updateSessionIndicator() {
    const count = session.createdContractIds.length;
    const cmdCount = session.commands.length;
    sessionIndicator.textContent = `Session: ${cmdCount} command${cmdCount !== 1 ? "s" : ""}, ${count} element${count !== 1 ? "s" : ""} created`;
    bundleBtn.disabled = session.commands.length === 0;
  }

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

    const indicator = addSystemIndicator("Building...");

    try {
      const response = await callClaudeAPI(apiKey, messages);

      indicator.remove();

      if (response.error) {
        addAssistantMessage(`Error: ${response.error}`);
        return;
      }

      const code = extractCode(response.content);

      if (code) {
        addAssistantMessage("Generated code. Loading into the viewer...");

        try {
          const result = await loadGeneratedCode(code, viewer, session);
          session.commands.push({ prompt, code, timestamp: Date.now() });
          updateSessionIndicator();

          const newCount = result.newContractIds.length;
          const kindInfo = result.newKinds.length > 0
            ? ` New element type${result.newKinds.length > 1 ? "s" : ""}: ${result.newKinds.join(", ")}.`
            : "";
          addAssistantMessage(
            `Done! ${newCount > 0 ? `${newCount} element${newCount !== 1 ? "s" : ""} created.` : "Code executed."}${kindInfo}\n\n` +
            "Send another command or click Bundle when ready."
          );
        } catch (loadErr: any) {
          addAssistantMessage(
            `Could not load the feature: ${loadErr.message}\n\n` +
            "Try describing it differently, or provide more details."
          );
        }
      } else {
        // No code block — just a conversational response
        addAssistantMessage(response.content);
      }
    } catch (err: any) {
      indicator.remove();
      addAssistantMessage(`Failed to reach AI: ${err.message}`);
    }
  }

  async function handleBundle() {
    if (session.commands.length === 0) return;

    const indicator = addSystemIndicator("Summarizing session...");

    try {
      // Step 1: Summarize
      const summary = await summarizeSession(apiKey, session);
      indicator.remove();

      addAssistantMessage(
        `<b>Bundle Summary</b>\n\n` +
        `<b>Name:</b> ${summary.name}\n` +
        `<b>Description:</b> ${summary.description}\n` +
        `<b>Elements created:</b> ${session.createdContractIds.length}\n` +
        `<b>Commands:</b> ${session.commands.length}\n` +
        (summary.elementKinds.length > 0 ? `<b>Element types:</b> ${summary.elementKinds.join(", ")}\n` : "") +
        "\nWould you like to bundle this as an installable extension?"
      );

      // Step 2: Confirm UI
      const confirmWrap = document.createElement("div");
      confirmWrap.style.cssText = "display: flex; gap: 8px; padding: 8px 12px;";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "btn-primary";
      confirmBtn.textContent = "Confirm Bundle";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn-secondary";
      cancelBtn.textContent = "Cancel";

      confirmWrap.appendChild(confirmBtn);
      confirmWrap.appendChild(cancelBtn);
      messagesArea.appendChild(confirmWrap);
      messagesArea.scrollTop = messagesArea.scrollHeight;

      await new Promise<void>((resolve) => {
        confirmBtn.addEventListener("click", async () => {
          confirmWrap.remove();
          const genIndicator = addSystemIndicator("Generating extension bundle...");
          try {
            // Step 3: Generate extension module
            const extensionCode = await generateExtensionModule(apiKey, session, summary);
            genIndicator.remove();

            // Step 4: Build manifest
            const manifest = {
              id: summary.suggestedId,
              name: summary.name,
              version: "1.0.0",
              description: summary.description,
              author: "AI Builder",
              main: "bundle.js",
              contributes: {
                elements: summary.elementKinds.map((k: string) => ({ kind: k, entrypoint: "bundle.js" })),
              },
            };

            // Step 5: Publish
            const pubIndicator = addSystemIndicator("Publishing to Extension Store...");
            try {
              await publishExtension(manifest, extensionCode);
              pubIndicator.remove();
              addAssistantMessage(
                `Extension "<b>${summary.name}</b>" published successfully!\n\n` +
                "Other users can now find and install it from the Extensions marketplace."
              );
            } catch (pubErr: any) {
              pubIndicator.remove();
              addAssistantMessage(
                `Published locally but could not reach the Extension Store: ${pubErr.message}\n\n` +
                "Make sure the store server is running (npm run dev:store)."
              );
            }
            resolve();
          } catch (err: any) {
            genIndicator.remove();
            addAssistantMessage(`Bundle generation failed: ${err.message}`);
            resolve();
          }
        });
        cancelBtn.addEventListener("click", () => {
          confirmWrap.remove();
          addAssistantMessage("Bundle cancelled. Continue building or try again.");
          resolve();
        });
      });
    } catch (err: any) {
      indicator.remove();
      addAssistantMessage(`Summarization failed: ${err.message}`);
    }
  }

  function handleNewSession() {
    session = createSession();
    messages.length = 0;
    messagesArea.innerHTML = "";
    addAssistantMessage(
      "New session started. Describe what you want to build."
    );
    updateSessionIndicator();
  }

  sendBtn.addEventListener("click", handleSend);
  bundleBtn.addEventListener("click", handleBundle);
  newSessionBtn.addEventListener("click", handleNewSession);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

// ── System Prompts ──────────────────────────────────────────────────

function getSystemPrompt(): string {
  return `You are a BIM Feature Builder AI running inside a BIM authoring IDE. You generate executable JavaScript code that runs against the viewer API.

## Two Modes

### Mode A — Scripting (manipulating existing elements)
Use this when the user wants to create, modify, or delete instances of existing element types (columns, walls, floors, doors, windows).

Export a default function that receives the viewer object:
\`\`\`javascript
export default function(viewer) {
  // your code here
}
\`\`\`

### Mode B — Defining new element types
Use this when the user wants to create an entirely new kind of BIM element that doesn't exist yet.

Export named \`elementDefinition\` and/or \`typeDefinition\`:
\`\`\`javascript
export const elementDefinition = { kind: "beam", ... };
export const typeDefinition = { kind: "beamType", ... };
\`\`\`

## Viewer API Reference

The viewer object passed to your default function has:

### viewer.doc — BimDocument
- \`viewer.doc.add(contract)\` — add a contract (element) to the document
- \`viewer.doc.update(id, patch)\` — update contract fields
- \`viewer.doc.remove(id)\` — remove a contract
- \`viewer.doc.contracts\` — Map<ContractId, Contract> of all contracts
- \`viewer.doc.transaction(() => { ... })\` — group mutations atomically

### viewer.scene — THREE.Scene
- Full Three.js scene access

### viewer.engine — GeometryEngine
- WASM geometry engine for extrusions, walls, etc.

## Existing Element Factories

To create elements, build contract objects directly. Each contract needs a unique \`id\` (use \`crypto.randomUUID()\`).

### Column
\`\`\`javascript
// First find an existing columnType from doc.contracts
let columnTypeId = null;
for (const [id, c] of viewer.doc.contracts) {
  if (c.kind === "columnType") { columnTypeId = id; break; }
}

viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "column",
  typeId: columnTypeId,
  base: [x, y, z],   // position [x, ground_elevation, z]
});
\`\`\`

### Wall
\`\`\`javascript
let wallTypeId = null;
for (const [id, c] of viewer.doc.contracts) {
  if (c.kind === "wallType") { wallTypeId = id; break; }
}

viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "wall",
  typeId: wallTypeId,
  start: [x1, y1, z1],
  end: [x2, y2, z2],
});
\`\`\`

### Floor
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "floor",
  boundary: [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 5 },
    { x: 0, z: 5 },
  ],
  thickness: 0.2,
  elevation: 0,
});
\`\`\`

### Column Type (custom dimensions)
\`\`\`javascript
const typeId = crypto.randomUUID();
viewer.doc.add({
  id: typeId,
  kind: "columnType",
  name: "Large Column",
  height: 4.0,
  width: 0.5,
});
\`\`\`

### Wall Type (custom dimensions)
\`\`\`javascript
const typeId = crypto.randomUUID();
viewer.doc.add({
  id: typeId,
  kind: "wallType",
  name: "Thick Wall",
  height: 3.5,
  thickness: 0.3,
});
\`\`\`

## Important Rules

1. Always wrap code in a single \`\`\`javascript code block
2. For scripting mode, always export default function(viewer) { ... }
3. Use crypto.randomUUID() for all IDs
4. Look up existing type IDs from viewer.doc.contracts before creating instances
5. Geometry syncs automatically when contracts are added/updated — no manual sync needed
6. Coordinates are [x, y, z] where y is UP (elevation)
7. Do NOT use TypeScript syntax — only plain JavaScript
8. Do NOT use import statements — you receive the viewer as a function parameter
9. For random positions, keep values reasonable (e.g., x/z between -10 and 10)
10. When creating multiple elements, use viewer.doc.transaction() to batch them

## ElementTypeDefinition (for Mode B only)

If defining a new element kind, implement:
\`\`\`javascript
export const elementDefinition = {
  kind: "myElement",
  typeKind: "myElementType",  // optional, links to type
  generateGeometry(engine, contract, doc) {
    // return THREE.BufferGeometry
  },
  getRelationships(contract, doc) {
    // return ElementRelationship[]
    return [];
  },
};
\`\`\`

Respond with ONLY the code block. No explanations — the user doesn't see the code.`;
}

function getBundleSummaryPrompt(): string {
  return `You are analyzing a BIM Feature Builder session. Given the list of commands the user issued and what they created, produce a JSON summary for bundling this session as an installable extension.

Respond with ONLY a JSON object:
{
  "name": "Human-readable extension name",
  "description": "One-sentence description of what this extension does",
  "suggestedId": "ai-generated.kebab-case-id",
  "elementKinds": ["list", "of", "new", "element", "kinds", "defined"]
}`;
}

function getExtensionGeneratorPrompt(): string {
  return `You are generating an ESM extension module for a BIM IDE. The extension must implement the activate/deactivate pattern.

The activate function receives a context object with:
- ctx.doc — BimDocument (same API as viewer.doc: add, update, remove, contracts, transaction)
- ctx.registry — ElementRegistry (register new element kinds)
- ctx.scene — THREE.Scene
- ctx.editor.registerElement(def) — register ElementTypeDefinition
- ctx.editor.registerTool(tool, descriptor) — register interactive tool
- ctx.ui.showNotification(message) — show user notification

Generate a self-contained ESM module:
\`\`\`javascript
export function activate(ctx) {
  // Replay the session's actions using ctx
}

export function deactivate() {
  // Optional cleanup
}
\`\`\`

Rules:
1. No import statements — everything is available via ctx
2. Use crypto.randomUUID() for IDs
3. Plain JavaScript only, no TypeScript
4. Wrap in a single \`\`\`javascript code block`;
}

// ── Claude API integration ──────────────────────────────────────────

async function callClaudeAPI(
  apiKey: string,
  history: ChatMessage[]
): Promise<{ content: string; error?: string }> {
  try {
    // Build messages from history (skip the welcome message which is index 0)
    const apiMessages = history
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    // Must have at least one user message
    if (apiMessages.length === 0) {
      return { content: "", error: "No messages to send" };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages: apiMessages,
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

async function callClaudeWithSystemPrompt(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// ── Session operations ──────────────────────────────────────────────

async function summarizeSession(
  apiKey: string,
  session: Session
): Promise<{ name: string; description: string; suggestedId: string; elementKinds: string[] }> {
  const commandSummary = session.commands
    .map((c, i) => `${i + 1}. "${c.prompt}"`)
    .join("\n");

  const content = `Session commands:\n${commandSummary}\n\nElements created: ${session.createdContractIds.length}\nNew element kinds registered: ${session.registeredKinds.join(", ") || "none"}`;

  const text = await callClaudeWithSystemPrompt(apiKey, getBundleSummaryPrompt(), content);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse summary");
  return JSON.parse(jsonMatch[0]);
}

async function generateExtensionModule(
  apiKey: string,
  session: Session,
  summary: { name: string; description: string }
): Promise<string> {
  const codeBlocks = session.commands
    .map((c, i) => `// Command ${i + 1}: "${c.prompt}"\n${c.code}`)
    .join("\n\n");

  const content =
    `Extension name: ${summary.name}\n` +
    `Description: ${summary.description}\n\n` +
    `Session code to wrap into an extension module:\n\`\`\`javascript\n${codeBlocks}\n\`\`\`\n\n` +
    `Combine all the above into a single activate(ctx) function that replays these actions. ` +
    `Replace any "viewer" references with "ctx" (ctx.doc, ctx.editor, ctx.scene, etc). ` +
    `Remember: ctx.editor.registerElement(def) instead of viewer.registerElement(def).`;

  const text = await callClaudeWithSystemPrompt(apiKey, getExtensionGeneratorPrompt(), content);
  const code = extractCode(text);
  if (!code) throw new Error("Could not extract extension code");
  return code;
}

// ── Publish ─────────────────────────────────────────────────────────

async function publishExtension(
  manifest: Record<string, unknown>,
  bundleCode: string
): Promise<void> {
  const formData = new FormData();
  formData.append("manifest", JSON.stringify(manifest));
  formData.append(
    "bundle",
    new Blob([bundleCode], { type: "application/javascript" }),
    "bundle.js"
  );

  const res = await fetch(`${STORE_URL}/extensions`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Publish failed (${res.status}): ${errText}`);
  }
}

// ── Code extraction and loading ─────────────────────────────────────

function extractCode(response: string): string | null {
  const match = response.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

interface LoadResult {
  newContractIds: string[];
  newKinds: string[];
}

async function loadGeneratedCode(
  code: string,
  viewer: ViewerInstance,
  session: Session
): Promise<LoadResult> {
  // Strip any remaining TS annotations (AI should produce JS, but just in case)
  let jsCode = code;
  jsCode = jsCode
    .replace(/:\s*\w+(\[\])?\s*(?=[,;=\)\n\{])/g, "")
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, "")
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, "")
    .replace(/<\w+>/g, "")
    .replace(/\bas\s+\w+/g, "")
    .replace(/import\s+type\s+[^;]+;/g, "");

  // Track new contracts
  const newContractIds: string[] = [];
  const handler = (contract: any) => {
    newContractIds.push(contract.id);
  };
  viewer.doc.onAdded.add(handler);

  const newKinds: string[] = [];

  // Create a blob URL and dynamically import
  const blob = new Blob([jsCode], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/* @vite-ignore */ url);

    // Mode A: default export is a function → scripting mode
    if (typeof module.default === "function") {
      await module.default(viewer);
    }
    // Mode B: element definitions
    if (module.elementDefinition) {
      viewer.registerElement(module.elementDefinition);
      newKinds.push(module.elementDefinition.kind);
    }
    if (module.typeDefinition) {
      viewer.registerElement(module.typeDefinition);
      newKinds.push(module.typeDefinition.kind);
    }
    // Mode B alt: default export with .kind
    if (module.default && typeof module.default !== "function" && module.default.kind) {
      viewer.registerElement(module.default);
      newKinds.push(module.default.kind);
    }

  } finally {
    URL.revokeObjectURL(url);
    viewer.doc.onAdded.remove(handler);
  }

  // Update session
  session.createdContractIds.push(...newContractIds);
  session.registeredKinds.push(...newKinds);

  return { newContractIds, newKinds };
}
