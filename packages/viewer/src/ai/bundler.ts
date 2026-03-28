import type { BimDocument } from "../core/document";
import { sendMessage } from "./claude-client";
import type { SessionTracker } from "./session-tracker";

const STORE_URL = "https://authoring-eight.vercel.app/api/extensions";

const BUNDLE_PROMPT = `You are a code bundler. Given a session of AI-generated BIM operations, create a clean, reusable extension.

Respond with EXACTLY this JSON format (no markdown, no code fences):
{
  "name": "Short Extension Name",
  "description": "One paragraph describing what this extension does",
  "code": "the clean TypeScript function body that recreates the operations"
}

The code should be a self-contained function body that uses the same API as the session:
- doc, createWall, createColumn, createFloor, createWindow, createDoor, THREE
- wallTypeId, columnTypeId, windowTypeId, doorTypeId
- textureRenderer (for photorealistic rendering: await textureRenderer.render(prompt?), textureRenderer.discard(), textureRenderer.download(filename?))
- Wrap BIM operations in doc.transaction()
- Make it parameterizable where it makes sense (e.g., grid size, spacing)
- Remove any hardcoded UUIDs — use the typeId variables instead
- If the session includes texture rendering, the code must be async`;

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
    const res = await fetch(STORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        author: "AI Builder",
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
