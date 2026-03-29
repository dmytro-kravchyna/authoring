import type { BimDocument } from "../core/document";
import { sendMessage } from "./claude-client";
import type { SessionTracker } from "./session-tracker";

const STORE_URL = "https://authoring-eight.vercel.app/api/extensions";

const BUNDLE_PROMPT = `You are a code bundler. Given a session of AI-generated BIM operations, create a clean, reusable extension.

The session may contain different contribution types:
- "action" steps: one-shot BIM operations (place elements, modify geometry)
- "tool" steps: interactive tools with pointer lifecycle (activate, onPointerDown, onPointerMove, onPointerUp, deactivate)
- "command" steps: reusable one-shot commands triggered by name or keybinding

Respond with EXACTLY this JSON format (no markdown, no code fences):
{
  "name": "Short Extension Name",
  "description": "One paragraph describing what this extension does",
  "code": "the clean extension activate(ctx) function body",
  "tools": [{"id": "tool-id", "label": "Tool Label", "category": "create"}],
  "commands": [{"id": "command-id", "label": "Command Label"}]
}

The code should be a self-contained activate(ctx) function body that:
- Uses ctx.doc, ctx.scene, ctx.editor, ctx.selection for all operations
- For "tool" steps: wraps the tool lifecycle functions into a Tool object and registers via ctx.editor.registerTool(tool, { label, category })
- For "command" steps: registers via ctx.editor.registerCommand({ id, label, handler })
- For "action" steps: replays the BIM operations using ctx.doc
- Uses ctx.doc for all document operations (add, update, remove, transaction, contracts)
- Uses ctx.THREE for THREE.js constructors (Vector3, Mesh, BoxGeometry, etc.)
- Uses ctx.raycast.ground(event) and ctx.raycast.objects(event) for element picking
- wallTypeId, columnTypeId, windowTypeId, doorTypeId (resolved from ctx.doc.contracts)
- textureRenderer (for photorealistic rendering: await textureRenderer.render(prompt?), textureRenderer.discard(), textureRenderer.download(filename?))
- ctx.selection for reading/clearing the current element selection:
  - ctx.selection.getAll() — all selected contracts
  - ctx.selection.getIds() — IDs of selected contracts
  - ctx.selection.getFirst() — first selected or null
  - ctx.selection.clear() — clear selection
- Wrap BIM operations in ctx.doc.transaction()
- Make it parameterizable where it makes sense (e.g., grid size, spacing)
- Remove any hardcoded UUIDs — use the typeId variables instead
- If the session includes texture rendering, the code must be async

Tool registration pattern:
\`\`\`
const tool = {
  name: "my-tool",
  activate() { /* setup */ },
  deactivate() { /* cleanup */ },
  onPointerDown(event, point) { /* point is [x,y,z] array or null */ },
  onPointerMove(event, point) { /* point is [x,y,z] array or null */ },
  onPointerUp(event) { /* finalize */ },
  onKeyDown(event) { /* shortcuts */ },
};
ctx.editor.registerTool(tool, { label: "My Tool", category: "create" });
\`\`\`

Edit tool pattern (operates on selected elements):
\`\`\`
const editTool = {
  name: "my-edit-tool",
  activate() {
    // Read current selection when tool is activated
    const selected = ctx.selection.getAll();
    // Store references for use in pointer events
  },
  deactivate() { /* cleanup */ },
  onPointerDown(event, point) {
    // point is [x,y,z] array or null
    const selected = ctx.selection.getAll();
    ctx.doc.transaction(() => {
      for (const contract of selected) {
        ctx.doc.update(contract.id, { /* modifications */ });
      }
    });
  },
  onPointerMove(event, point) { /* point is [x,y,z] array or null */ },
  onPointerUp(event) { /* finalize */ },
  onKeyDown(event) { /* shortcuts */ },
};
ctx.editor.registerTool(editTool, { label: "My Edit Tool", category: "edit" });
\`\`\`

Command registration pattern:
\`\`\`
ctx.editor.registerCommand({
  id: "my-command",
  label: "My Command",
  handler() { ctx.doc.transaction(() => { /* action */ }); }
});
\`\`\``;

export interface BundleResult {
  name: string;
  description: string;
  code: string;
  tools?: Array<{ id: string; label: string; category: string }>;
  commands?: Array<{ id: string; label: string }>;
}

export async function bundleSession(
  tracker: SessionTracker,
  doc: BimDocument
): Promise<BundleResult> {
  const sessionSummary = tracker.getSummary();
  const tools = tracker.getTools();
  const commands = tracker.getCommands();

  const toolInfo = tools.length > 0
    ? `\n\nRegistered tools in this session:\n${tools.map(t => `- ${t.id}: "${t.label}" (${t.category})`).join("\n")}`
    : "";
  const commandInfo = commands.length > 0
    ? `\n\nRegistered commands in this session:\n${commands.map(c => `- ${c.id}: "${c.label}"`).join("\n")}`
    : "";

  const response = await sendMessage(
    [{ role: "user", content: `Here is the session history:\n\n${sessionSummary}${toolInfo}${commandInfo}\n\nPlease bundle this into a reusable extension.` }],
    BUNDLE_PROMPT
  );

  // Parse the JSON response
  let parsed: BundleResult;
  try {
    // Try to extract JSON from the response (handle potential markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse bundle response from AI");
  }

  // Merge session-tracked tools/commands if AI didn't include them
  if (!parsed.tools && tools.length > 0) {
    parsed.tools = tools;
  }
  if (!parsed.commands && commands.length > 0) {
    parsed.commands = commands;
  }

  // Publish to extension server
  try {
    const manifest = {
      id: `ai-generated.${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: parsed.name,
      version: "1.0.0",
      description: parsed.description,
      author: "AI Builder",
      main: "bundle.js",
      contributes: {
        tools: parsed.tools?.map(t => ({ id: t.id, label: t.label, entrypoint: "bundle.js" })) ?? [],
        commands: parsed.commands?.map(c => ({ id: c.id, label: c.label })) ?? [],
      },
    };

    const res = await fetch(STORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        author: "AI Builder",
        manifest,
      }),
    });
    if (!res.ok) {
      console.warn("Extension store unavailable, extension saved locally only");
    }
  } catch {
    console.warn("Extension store not running — extension not published");
  }

  return parsed;
}
