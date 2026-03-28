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
import { createColumnType, createWallType, createWindowType, createDoorType } from "@bim-ide/viewer";
import { marked } from "marked";

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
const STORE_URL = import.meta.env.VITE_STORE_URL || "/api";

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

      if (response.truncated && code) {
        addAssistantMessage(
          "The generated code was truncated because it exceeded the token limit. " +
          "Try simplifying your request or breaking it into smaller steps."
        );
        return;
      }

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

    const indicator = addSystemIndicator("Generating summary and documentation...");

    try {
      // Step 1: Summarize and generate documentation in parallel
      const [summary, documentation] = await Promise.all([
        summarizeSession(apiKey, session),
        generateDocumentation(apiKey, session, {
          name: "",
          description: "",
          elementKinds: session.registeredKinds,
        }),
      ]);
      indicator.remove();

      // Step 2: Show summary
      addAssistantMessage(
        `<b>Bundle Summary</b>\n\n` +
        `<b>Name:</b> ${summary.name}\n` +
        `<b>Description:</b> ${summary.description}\n` +
        `<b>Elements created:</b> ${session.createdContractIds.length}\n` +
        `<b>Commands:</b> ${session.commands.length}\n` +
        (summary.elementKinds.length > 0 ? `<b>Element types:</b> ${summary.elementKinds.join(", ")}\n` : "")
      );

      // Step 2b: Show documentation preview
      const docsPreview = document.createElement("div");
      docsPreview.className = "ai-chat-message assistant";
      docsPreview.style.cssText = "max-height: 300px; overflow-y: auto; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin: 4px 12px;";
      docsPreview.innerHTML = `<div style="font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">Generated Documentation</div>${marked(documentation)}`;
      messagesArea.appendChild(docsPreview);
      messagesArea.scrollTop = messagesArea.scrollHeight;

      // Step 3: Confirm UI
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
            // Step 4: Generate extension module
            const extensionCode = await generateExtensionModule(apiKey, session, summary);
            genIndicator.remove();

            // Step 5: Build manifest with documentation and wiki contribution
            const manifest = {
              id: summary.suggestedId,
              name: summary.name,
              version: "1.0.0",
              description: summary.description,
              author: "AI Builder",
              main: "bundle.js",
              readme: documentation,
              contributes: {
                elements: summary.elementKinds.map((k: string) => ({ kind: k, entrypoint: "bundle.js" })),
                commands: [
                  {
                    id: "run",
                    label: summary.name,
                  },
                ],
                wiki: [
                  {
                    path: `${summary.suggestedId}/overview`,
                    category: "features",
                    title: summary.name,
                  },
                ],
              },
            };

            // Step 6: Publish
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
          docsPreview.remove();
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
If you use \`await\` anywhere in the function body, you MUST declare it async:
\`\`\`javascript
export default async function(viewer) {
  // your code with await calls
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

### viewer.THREE — Three.js module
- Full Three.js library: use \`viewer.THREE.Vector3\`, \`viewer.THREE.Raycaster\`, \`viewer.THREE.Mesh\`, etc.
- Do NOT use \`window.THREE\` or try to load THREE dynamically — always use \`viewer.THREE\`

### viewer.scene — THREE.Scene
- Full Three.js scene access

### viewer.camera — THREE.PerspectiveCamera
- The active camera

### viewer.renderer — THREE.WebGLRenderer
- The active renderer; \`viewer.renderer.domElement\` is the canvas

### viewer.engine — GeometryEngine
- WASM geometry engine for extrusions, walls, etc.

## Pre-injected Type ID Variables

The following local variables are automatically available inside your default function — use them directly:
- \`columnTypeId\` — ID of the default column type
- \`wallTypeId\` — ID of the default wall type
- \`windowTypeId\` — ID of the default window type
- \`doorTypeId\` — ID of the default door type

Default types are auto-created if they don't exist yet, so these variables are always valid.

## Element Reference

To create elements, build contract objects directly. Each contract needs a unique \`id\` (use \`crypto.randomUUID()\`).

### Column
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "column",
  typeId: columnTypeId,  // pre-injected variable
  base: [x, y, z],      // position [x, ground_elevation, z]
});
\`\`\`

### Wall
\`\`\`javascript
const wallId = crypto.randomUUID();
viewer.doc.add({
  id: wallId,
  kind: "wall",
  typeId: wallTypeId,       // pre-injected variable
  start: [x1, y1, z1],
  end: [x2, y2, z2],
  offset: 0,               // optional, lateral offset
  startJoin: "miter",       // optional: "miter" | "square"
  endJoin: "miter",         // optional: "miter" | "square"
});
\`\`\`

### Window (hosted on a wall)
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "window",
  typeId: windowTypeId,     // pre-injected variable
  hostId: wallId,           // ID of the wall this window is placed on
  position: 0.5,            // 0-1 along the wall length
});
\`\`\`

### Door (hosted on a wall)
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "door",
  typeId: doorTypeId,       // pre-injected variable
  hostId: wallId,           // ID of the wall this door is placed on
  position: 0.5,            // 0-1 along the wall length
});
\`\`\`

### Floor
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "floor",
  boundary: [
    { type: "free", position: [0, 0, 0] },
    { type: "free", position: [5, 0, 0] },
    { type: "free", position: [5, 0, 5] },
    { type: "free", position: [0, 0, 5] },
  ],
  thickness: 0.2,
  elevation: 0,
});
\`\`\`

### Level
\`\`\`javascript
viewer.doc.add({
  id: crypto.randomUUID(),
  kind: "level",
  name: "Level 1",
  elevation: 3.0,          // Y coordinate in meters
});
\`\`\`

### Material
\`\`\`javascript
const matId = crypto.randomUUID();
viewer.doc.add({
  id: matId,
  kind: "material",
  name: "Red Brick",
  color: [0.8, 0.2, 0.1],  // RGB 0-1 range
  opacity: 1,
  doubleSided: true,
  stroke: 0,
});
\`\`\`

## Custom Type Definitions

Create custom types to control dimensions. Assign materials via the \`materials\` field.

### Column Type
\`\`\`javascript
const myColTypeId = crypto.randomUUID();
viewer.doc.add({
  id: myColTypeId,
  kind: "columnType",
  name: "Large Column",
  height: 4.0,       // meters
  width: 0.5,        // square cross-section side
  materials: { body: matId },  // optional
});
\`\`\`

### Wall Type
\`\`\`javascript
const myWallTypeId = crypto.randomUUID();
viewer.doc.add({
  id: myWallTypeId,
  kind: "wallType",
  name: "Thick Wall",
  height: 3.5,
  thickness: 0.3,
  materials: { body: matId },  // optional
});
\`\`\`

### Window Type
\`\`\`javascript
const myWinTypeId = crypto.randomUUID();
viewer.doc.add({
  id: myWinTypeId,
  kind: "windowType",
  name: "Large Window",
  width: 1.5,
  height: 1.2,
  sillHeight: 0.9,   // height from floor to bottom of window
  materials: { frame: matId },  // optional
});
\`\`\`

### Door Type
\`\`\`javascript
const myDoorTypeId = crypto.randomUUID();
viewer.doc.add({
  id: myDoorTypeId,
  kind: "doorType",
  name: "Wide Door",
  width: 1.2,
  height: 2.4,
  materials: { frame: matId },  // optional
});
\`\`\`

## Composite Example — Room with walls, door, window, and floor
\`\`\`javascript
export default function(viewer) {
  viewer.doc.transaction(() => {
    const w1 = crypto.randomUUID();
    const w2 = crypto.randomUUID();
    const w3 = crypto.randomUUID();
    const w4 = crypto.randomUUID();

    // Four walls forming a room
    viewer.doc.add({ id: w1, kind: "wall", typeId: wallTypeId, start: [0,0,0], end: [5,0,0] });
    viewer.doc.add({ id: w2, kind: "wall", typeId: wallTypeId, start: [5,0,0], end: [5,0,5] });
    viewer.doc.add({ id: w3, kind: "wall", typeId: wallTypeId, start: [5,0,5], end: [0,0,5] });
    viewer.doc.add({ id: w4, kind: "wall", typeId: wallTypeId, start: [0,0,5], end: [0,0,0] });

    // Door on wall 1
    viewer.doc.add({ id: crypto.randomUUID(), kind: "door", typeId: doorTypeId, hostId: w1, position: 0.3 });

    // Window on wall 2
    viewer.doc.add({ id: crypto.randomUUID(), kind: "window", typeId: windowTypeId, hostId: w2, position: 0.5 });

    // Floor
    viewer.doc.add({
      id: crypto.randomUUID(),
      kind: "floor",
      boundary: [
        { type: "free", position: [0,0,0] },
        { type: "free", position: [5,0,0] },
        { type: "free", position: [5,0,5] },
        { type: "free", position: [0,0,5] },
      ],
      thickness: 0.2,
      elevation: 0,
    });
  });
}
\`\`\`

## AI-Generated Textures on Geometry

The viewer has a \`textureGenerator\` for generating AI-powered tileable textures and applying them to materials:

\`\`\`javascript
// Generate a tileable texture via AI and apply it to a material
await viewer.textureGenerator.generateAndApply("red brick", materialId, viewer.doc)
await viewer.textureGenerator.generateAndApply("oak hardwood", materialId, viewer.doc)
\`\`\`

When the user asks for textured or photorealistic elements:
1. Create a material contract
2. Create a type that references the material via \`materials: { body: materialId }\`
3. Create elements with that type
4. Call \`await viewer.textureGenerator.generateAndApply("texture description", materialId, viewer.doc)\`
5. The texture is automatically applied to all elements using that material

Example — wall with brick texture:
\`\`\`javascript
export default async function(viewer) {
  viewer.doc.transaction(() => {
    const matId = crypto.randomUUID();
    viewer.doc.add({ id: matId, kind: "material", name: "Brick", color: [0.8, 0.3, 0.2], opacity: 1, doubleSided: true, stroke: 0 });
    const wtId = crypto.randomUUID();
    viewer.doc.add({ id: wtId, kind: "wallType", name: "Brick Wall", height: 3, thickness: 0.2, materials: { body: matId } });
    viewer.doc.add({ id: crypto.randomUUID(), kind: "wall", typeId: wtId, start: [0,0,0], end: [5,0,0] });
  });
  // Apply AI-generated brick texture to the material
  const matId = [...viewer.doc.contracts.values()].find(c => c.name === "Brick")?.id;
  if (matId) await viewer.textureGenerator.generateAndApply("red brick wall texture", matId, viewer.doc);
}
\`\`\`

## Photo-Realistic Scene Rendering (overlay)

The viewer also has \`textureRenderer\` for capturing the full scene as a photorealistic image overlay:

\`\`\`javascript
await viewer.textureRenderer.render(customPrompt)  // Full-scene photorealistic image
viewer.textureRenderer.discard()                    // Remove overlay
viewer.textureRenderer.download(filename)           // Download as PNG
\`\`\`

Use this only when the user wants a photorealistic IMAGE of the whole scene, not textures on geometry.

## GIS / 3D Tiles Layer

The viewer has a \`gisLayer\` for loading Cesium Ion 3D map tiles:

\`\`\`javascript
viewer.gisLayer.latitude = 40.7016;          // Set latitude (decimal degrees)
viewer.gisLayer.longitude = -73.9943;        // Set longitude (decimal degrees)
viewer.gisLayer.rotation = 0;                // Set rotation (radians)
viewer.gisLayer.init(assetId)                // Initialize with a Cesium Ion asset ID (default: "2275207")
viewer.gisLayer.enabled = true;              // Show/hide the 3D tiles layer
viewer.gisLayer.updateMapPosition();         // Apply lat/lon/rotation changes
\`\`\`

## Important Rules

1. Always wrap code in a single \`\`\`javascript code block
2. For scripting mode, export default function(viewer) { ... }. If you use \`await\` anywhere, you MUST declare it: export default async function(viewer) { ... }
3. Use crypto.randomUUID() for all IDs
4. Use the pre-injected typeId variables (columnTypeId, wallTypeId, windowTypeId, doorTypeId) directly
5. Geometry syncs automatically when contracts are added/updated — no manual sync needed
6. Coordinates are [x, y, z] where y is UP (elevation)
7. Do NOT use TypeScript syntax — only plain JavaScript
8. Do NOT use import statements — you receive the viewer as a function parameter
9. For random positions, keep values reasonable (e.g., x/z between -10 and 10)
10. When creating multiple elements, use viewer.doc.transaction() to batch them
11. Always use \`viewer.THREE\` for Three.js constructors (Vector3, Raycaster, Mesh, etc.) — NEVER use \`window.THREE\` or dynamic loading
12. Keep code concise — under 250 lines. For complex interactive tools, focus on core logic and minimal UI

## Interactive Tools Pattern

For tools that need mouse interaction (click, hover, snap indicators), use this pattern:
\`\`\`javascript
export default function(viewer) {
  const { THREE, scene, camera, renderer, doc } = viewer;
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function raycast(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(scene.children, true);
  }

  // Find wall contract from a mesh hit
  function wallFromHit(hit) {
    let obj = hit.object;
    while (obj) {
      if (obj.userData?.id) {
        const c = doc.contracts.get(obj.userData.id);
        if (c?.kind === "wall") return c;
      }
      obj = obj.parent;
    }
    return null;
  }

  // Create a snap indicator
  const snapGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const snapMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.7, depthTest: false });
  const snap = new THREE.Mesh(snapGeo, snapMat);
  snap.visible = false;
  snap.renderOrder = 9999;
  scene.add(snap);

  function onMouseMove(e) { /* update snap indicator */ }
  function onClick(e) { /* handle selection */ }

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onClick);
}
\`\`\`

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

function getDocumentationPrompt(): string {
  return `You are generating documentation for a BIM IDE extension that was created via an AI-assisted session. Given the session details and extension summary, produce a Markdown README.

Include these sections:
# <Extension Name>

## Overview
One paragraph explaining what this extension does and why it's useful.

## What It Creates
Bullet list of elements, types, or features this extension adds to the BIM model.

## Usage
Step-by-step instructions on how to use the extension after installing it.

## Element Types
If the extension defines new element kinds, describe each one with its parameters.

## Configuration
If the extension uses configurable parameters (grid size, spacing, dimensions), list them.

Respond with ONLY the Markdown content — no code fences wrapping the entire response.`;
}

function getExtensionGeneratorPrompt(): string {
  return `You are generating an ESM extension module for a BIM IDE. The extension must implement the activate/deactivate pattern.

The activate function receives a context object with:
- ctx.doc — BimDocument (same API as viewer.doc: add, update, remove, contracts, transaction)
- ctx.registry — ElementRegistry (register new element kinds)
- ctx.scene — THREE.Scene
- ctx.editor.registerElement(def) — register ElementTypeDefinition
- ctx.editor.registerTool(tool, descriptor) — register interactive tool
- ctx.editor.registerCommand(cmd) — register a command button { id, label, handler }
- ctx.ui.showNotification(message) — show user notification

Generate a self-contained ESM module that registers a COMMAND. The command handler runs the session code when the user clicks the button in the toolbar.

\`\`\`javascript
export function activate(ctx) {
  ctx.editor.registerCommand({
    id: "run",
    label: "My Extension Name",  // use the actual extension name
    handler() {
      // Replay the session's actions here using ctx.doc, ctx.scene, etc.
    }
  });
}

export function deactivate() {
  // Optional cleanup
}
\`\`\`

Rules:
1. No import statements — everything is available via ctx
2. Use crypto.randomUUID() for IDs
3. Plain JavaScript only, no TypeScript
4. Wrap in a single \`\`\`javascript code block
5. ALL session replay code goes INSIDE the command handler, NOT directly in activate()
6. The command label should be a short, descriptive action name
7. If the handler is async (e.g. uses textureGenerator), make it async`;
}

// ── Claude API integration ──────────────────────────────────────────

async function callClaudeAPI(
  apiKey: string,
  history: ChatMessage[]
): Promise<{ content: string; error?: string; truncated?: boolean }> {
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
        model: "claude-opus-4-6",
        max_tokens: 16384,
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
    const truncated = data.stop_reason === "max_tokens";
    return { content: text, truncated };
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
      model: "claude-opus-4-6",
      max_tokens: 16384,
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
    `Wrap all the above inside a ctx.editor.registerCommand() call in activate(). ` +
    `The command id should be "run" and the label should be "${summary.name}". ` +
    `The command handler function should contain the session replay code. ` +
    `Replace any "viewer" references with "ctx" (ctx.doc, ctx.editor, ctx.scene, etc). ` +
    `Remember: ctx.editor.registerElement(def) instead of viewer.registerElement(def).`;

  const text = await callClaudeWithSystemPrompt(apiKey, getExtensionGeneratorPrompt(), content);
  const code = extractCode(text);
  if (!code) throw new Error("Could not extract extension code");
  return code;
}

async function generateDocumentation(
  apiKey: string,
  session: Session,
  summary: { name: string; description: string; elementKinds: string[] }
): Promise<string> {
  const commandSummary = session.commands
    .map((c, i) => `${i + 1}. "${c.prompt}"`)
    .join("\n");

  const content =
    `Extension name: ${summary.name}\n` +
    `Description: ${summary.description}\n` +
    `Element kinds: ${summary.elementKinds.join(", ") || "none"}\n\n` +
    `Session commands:\n${commandSummary}\n\n` +
    `Elements created: ${session.createdContractIds.length}`;

  return await callClaudeWithSystemPrompt(apiKey, getDocumentationPrompt(), content);
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

function isCodeTruncated(code: string): boolean {
  let braceDepth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (const ch of code) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") braceDepth++;
    if (ch === "}") braceDepth--;
  }

  return braceDepth > 0;
}

interface LoadResult {
  newContractIds: string[];
  newKinds: string[];
}

/**
 * Ensure default element types exist in the document and return
 * resolved typeId variables. Mirrors packages/viewer/src/ai/executor.ts.
 */
function ensureDefaultTypes(viewer: ViewerInstance): Record<string, string> {
  const typeFactories: Record<string, () => any> = {
    columnType: createColumnType,
    wallType: createWallType,
    windowType: createWindowType,
    doorType: createDoorType,
  };

  for (const [kind, factory] of Object.entries(typeFactories)) {
    const exists = [...viewer.doc.contracts.values()].some((c: any) => c.kind === kind);
    if (!exists) {
      const typeContract = factory();
      viewer.doc.add(typeContract);
      console.log(`[AI Builder] Auto-created missing ${kind}: ${typeContract.id}`);
    }
  }

  const typeIds: Record<string, string> = {};
  for (const [id, c] of viewer.doc.contracts) {
    const kind = (c as any).kind as string;
    if (kind.endsWith("Type")) {
      const varName = kind.replace(/Type$/, "") + "TypeId";
      if (!typeIds[varName]) {
        typeIds[varName] = id;
      }
    }
  }

  console.log("[AI Builder] Resolved typeIds:", typeIds);
  return typeIds;
}

async function loadGeneratedCode(
  code: string,
  viewer: ViewerInstance,
  session: Session
): Promise<LoadResult> {
  console.log("[AI Builder] Raw generated code:\n", code);

  // Strip TS-only syntax (AI should produce JS, but just in case).
  // NOTE: We intentionally do NOT strip generic `: Type` annotations
  // because that regex also destroys valid JS like `typeId: columnTypeId,`.
  let jsCode = code;
  jsCode = jsCode
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, "")
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, "")
    .replace(/<\w+>/g, "")
    .replace(/\bas\s+\w+/g, "")
    .replace(/import\s+type\s+[^;]+;/g, "");

  if (isCodeTruncated(jsCode)) {
    throw new Error(
      "The generated code appears to be truncated (unbalanced braces). " +
      "Try simplifying your request or breaking it into smaller steps."
    );
  }

  // Ensure default types exist and resolve typeId variables
  console.log("[AI Builder] Ensuring default types exist...");
  const typeIds = ensureDefaultTypes(viewer);

  // Inject typeId declarations inside the default function body so bare
  // references like `columnTypeId` resolve correctly.
  const typeIdDeclarations = Object.entries(typeIds)
    .map(([name, id]) => `const ${name} = "${id}";`)
    .join("\n  ");

  const injected = jsCode.replace(
    /export\s+default\s+(?:async\s+)?function\s*\([^)]*\)\s*\{/,
    (match) => `${match}\n  // Auto-injected typeId variables\n  ${typeIdDeclarations}\n`
  );

  // Also handle arrow function variant: export default (viewer) => { or export default async (viewer) => {
  const finalCode = injected === jsCode
    ? jsCode.replace(
        /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>\s*\{/,
        (match) => `${match}\n  // Auto-injected typeId variables\n  ${typeIdDeclarations}\n`
      )
    : injected;

  console.log("[AI Builder] Final code to execute:\n", finalCode);

  // Auto-fix: if the default function uses `await` but isn't declared async, add async.
  let executableCode = finalCode;
  if (/export\s+default\s+function\s*\(/.test(executableCode) &&
      !/export\s+default\s+async\s+function/.test(executableCode)) {
    const funcMatch = executableCode.match(/export\s+default\s+function\s*\([^)]*\)\s*\{/);
    if (funcMatch) {
      const funcStart = executableCode.indexOf(funcMatch[0]);
      const bodyAfter = executableCode.slice(funcStart + funcMatch[0].length);
      if (/\bawait\b/.test(bodyAfter)) {
        console.log("[AI Builder] Auto-fixing: adding async to default function that uses await");
        executableCode = executableCode.replace(
          /export\s+default\s+function\s*\(/,
          "export default async function("
        );
      }
    }
  }
  // Also handle arrow function variant
  if (/export\s+default\s+\(/.test(executableCode) &&
      !/export\s+default\s+async\s+\(/.test(executableCode)) {
    const arrowMatch = executableCode.match(/export\s+default\s+\([^)]*\)\s*=>\s*\{/);
    if (arrowMatch) {
      const arrowStart = executableCode.indexOf(arrowMatch[0]);
      const bodyAfter = executableCode.slice(arrowStart + arrowMatch[0].length);
      if (/\bawait\b/.test(bodyAfter)) {
        console.log("[AI Builder] Auto-fixing: adding async to default arrow function that uses await");
        executableCode = executableCode.replace(
          /export\s+default\s+\(/,
          "export default async ("
        );
      }
    }
  }

  // Track new contracts
  const newContractIds: string[] = [];
  const handler = (contract: any) => {
    newContractIds.push(contract.id);
  };
  viewer.doc.onAdded.add(handler);

  const newKinds: string[] = [];

  // Create a blob URL and dynamically import
  const blob = new Blob([executableCode], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/* @vite-ignore */ url);

    // Mode A: default export is a function → scripting mode
    if (typeof module.default === "function") {
      console.log("[AI Builder] Executing default function (Mode A)...");
      await module.default(viewer);
      console.log("[AI Builder] Execution complete. Contracts added:", newContractIds.length);
    }
    // Mode B: element definitions
    if (module.elementDefinition) {
      console.log("[AI Builder] Registering element definition (Mode B):", module.elementDefinition.kind);
      viewer.registerElement(module.elementDefinition);
      newKinds.push(module.elementDefinition.kind);
    }
    if (module.typeDefinition) {
      console.log("[AI Builder] Registering type definition (Mode B):", module.typeDefinition.kind);
      viewer.registerElement(module.typeDefinition);
      newKinds.push(module.typeDefinition.kind);
    }
    // Mode B alt: default export with .kind
    if (module.default && typeof module.default !== "function" && module.default.kind) {
      console.log("[AI Builder] Registering default element (Mode B alt):", module.default.kind);
      viewer.registerElement(module.default);
      newKinds.push(module.default.kind);
    }

  } catch (err) {
    console.error("[AI Builder] Code execution failed:", err);
    console.error("[AI Builder] Available typeIds were:", typeIds);
    console.error("[AI Builder] Code was:\n", executableCode);
    throw err;
  } finally {
    URL.revokeObjectURL(url);
    viewer.doc.onAdded.remove(handler);
  }

  // Update session
  session.createdContractIds.push(...newContractIds);
  session.registeredKinds.push(...newKinds);

  return { newContractIds, newKinds };
}
