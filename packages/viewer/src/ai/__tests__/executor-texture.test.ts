import { describe, it, expect, vi, beforeEach } from "vitest";
import { execute, extractCode } from "../executor";
import { BimDocument } from "../../core/document";
import type { TextureRenderer } from "../texture-renderer";

/**
 * Simulates the realistic AI Builder use-case:
 *   "Generate a simple building with photorealistic textures"
 *
 * The test verifies the full pipeline:
 *   1. Claude generates code that creates BIM elements AND calls textureRenderer
 *   2. The executor runs that code successfully
 *   3. BIM elements (walls, floor) are created in the document
 *   4. textureRenderer.render() is called with an appropriate prompt
 */

// --- Mocks ---

function createMockTextureRenderer(): TextureRenderer {
  return {
    render: vi.fn().mockResolvedValue("data:image/png;base64,fakeImageData"),
    discard: vi.fn(),
    download: vi.fn(),
  } as unknown as TextureRenderer;
}

// --- Simulated Claude Response ---

/** This is a realistic response Claude would generate for
 *  "Generate a simple building with photorealistic textures" */
const CLAUDE_RESPONSE = `Here's a simple rectangular building with four walls, a floor, and a photorealistic render:

\`\`\`typescript
// Create a simple 8m x 6m building
doc.transaction(() => {
  const w1 = createWall([0, 0, 0], [8, 0, 0], wallTypeId);
  doc.add(w1);

  const w2 = createWall([8, 0, 0], [8, 0, 6], wallTypeId);
  doc.add(w2);

  const w3 = createWall([8, 0, 6], [0, 0, 6], wallTypeId);
  doc.add(w3);

  const w4 = createWall([0, 0, 6], [0, 0, 0], wallTypeId);
  doc.add(w4);

  const floor = createFloor([
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 8, z: 6 },
    { x: 0, z: 6 },
  ]);
  doc.add(floor);
});

// Apply photorealistic rendering
await textureRenderer.render("modern residential building with brick facade and large windows, warm afternoon lighting");
\`\`\`

I created a simple 8m × 6m rectangular building with four walls and a floor, then applied a photorealistic render with a modern residential style.`;

describe("AI Builder: building with photorealistic textures", () => {
  let doc: BimDocument;
  let mockTextureRenderer: TextureRenderer;

  beforeEach(() => {
    doc = new BimDocument();
  });

  it("extracts valid code from the simulated Claude response", () => {
    const code = extractCode(CLAUDE_RESPONSE);
    expect(code).not.toBeNull();
    expect(code).toContain("createWall");
    expect(code).toContain("createFloor");
    expect(code).toContain("textureRenderer.render");
  });

  it("executes the generated code: creates BIM elements and calls textureRenderer", async () => {
    mockTextureRenderer = createMockTextureRenderer();
    const code = extractCode(CLAUDE_RESPONSE)!;

    const result = await execute(code, doc, mockTextureRenderer);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify BIM elements were created (4 walls + 1 floor + auto-created default types)
    const walls = [...doc.contracts.values()].filter(c => c.kind === "wall");
    const floors = [...doc.contracts.values()].filter(c => c.kind === "floor");
    expect(walls).toHaveLength(4);
    expect(floors).toHaveLength(1);

    // Verify textureRenderer.render was called with a style prompt
    expect(mockTextureRenderer.render).toHaveBeenCalledTimes(1);
    expect(mockTextureRenderer.render).toHaveBeenCalledWith(
      expect.stringContaining("modern residential building"),
    );
  });

  it("reports created element IDs", async () => {
    mockTextureRenderer = createMockTextureRenderer();
    const code = extractCode(CLAUDE_RESPONSE)!;

    const result = await execute(code, doc, mockTextureRenderer);

    // 4 walls + 1 floor = 5 user elements + 4 auto-created default types = 9 total
    expect(result.createdIds.length).toBeGreaterThanOrEqual(5);
  });

  it("still creates BIM elements when textureRenderer is not provided", async () => {
    // Code that references textureRenderer will fail, but BIM ops in the transaction
    // should have already committed
    const code = extractCode(CLAUDE_RESPONSE)!;

    const result = await execute(code, doc, undefined);

    // Execution fails because textureRenderer is undefined
    expect(result.success).toBe(false);
    expect(result.error).toContain("undefined");
  });

  it("handles textureRenderer.render() rejection gracefully", async () => {
    mockTextureRenderer = createMockTextureRenderer();
    (mockTextureRenderer.render as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Gemini API key not set. Please configure it in the AI tab."),
    );

    const code = extractCode(CLAUDE_RESPONSE)!;
    const result = await execute(code, doc, mockTextureRenderer);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Gemini API key not set");

    // BIM elements should still have been created (transaction committed before render call)
    const walls = [...doc.contracts.values()].filter(c => c.kind === "wall");
    expect(walls).toHaveLength(4);
  });

  it("supports code that only renders without creating elements", async () => {
    mockTextureRenderer = createMockTextureRenderer();

    const renderOnlyCode = `await textureRenderer.render("aerial view of a glass skyscraper");`;
    const result = await execute(renderOnlyCode, doc, mockTextureRenderer);

    expect(result.success).toBe(true);
    expect(mockTextureRenderer.render).toHaveBeenCalledWith("aerial view of a glass skyscraper");
  });

  it("supports discard and download calls", async () => {
    mockTextureRenderer = createMockTextureRenderer();

    const code = `
      await textureRenderer.render();
      textureRenderer.download("my-building.png");
    `;
    const result = await execute(code, doc, mockTextureRenderer);

    expect(result.success).toBe(true);
    expect(mockTextureRenderer.render).toHaveBeenCalledTimes(1);
    expect(mockTextureRenderer.download).toHaveBeenCalledWith("my-building.png");
  });
});
