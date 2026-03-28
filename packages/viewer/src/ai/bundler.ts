import type { BimDocument } from "../core/document";
import { sendMessage } from "./claude-client";
import type { SessionTracker } from "./session-tracker";

const STORE_URL = "https://authoring-eight.vercel.app/api/extensions";

const BUNDLE_PROMPT = `You are a code bundler. Given a session of AI-generated BIM operations, create a clean, reusable extension.

Respond with EXACTLY this JSON format (no markdown, no code fences):
{
  "name": "Short Extension Name",
  "description": "One paragraph describing what this extension does",
  "code": "the clean ESM module code"
}

The code must be an ESM module with activate/deactivate exports. The activate function receives a context (ctx) with:
- ctx.doc — BimDocument (add, update, remove, contracts, transaction)
- ctx.editor.registerCommand(cmd) — register { id, label, handler }
- ctx.ui.showNotification(message)

Wrap the BIM operations inside a command handler so users can trigger it from the toolbar:

export function activate(ctx) {
  ctx.editor.registerCommand({
    id: "run",
    label: "Extension Name",
    handler() {
      ctx.doc.transaction(() => { /* BIM operations */ });
    }
  });
}
export function deactivate() {}

Rules:
- Make it parameterizable where it makes sense (e.g., grid size, spacing)
- Remove any hardcoded UUIDs — use crypto.randomUUID()
- If the handler uses async operations, make it async
- No import statements`;

export interface BundleResult {
  name: string;
  description: string;
  code: string;
}

export async function bundleSession(
  tracker: SessionTracker,
  doc: BimDocument
): Promise<BundleResult> {
  const sessionSummary = tracker.getSummary();

  const response = await sendMessage(
    [{ role: "user", content: `Here is the session history:\n\n${sessionSummary}\n\nPlease bundle this into a reusable extension.` }],
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

  // Publish to extension server
  try {
    const extId = `ai-generated.${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const manifest = {
      id: extId,
      name: parsed.name,
      version: "1.0.0",
      description: parsed.description,
      author: "AI Builder",
      main: "bundle.js",
      contributes: {
        commands: [{ id: "run", label: parsed.name }],
      },
    };
    const formData = new FormData();
    formData.append("manifest", JSON.stringify(manifest));
    formData.append("bundle", new Blob([parsed.code], { type: "application/javascript" }), "bundle.js");
    const res = await fetch(STORE_URL, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      console.warn("Extension store unavailable, extension saved locally only");
    }
  } catch {
    console.warn("Extension store not running — extension not published");
  }

  return parsed;
}
