import * as THREE from "three";
import type { BimDocument } from "../core/document";
import { createWall } from "../elements/wall";
import { createColumn } from "../elements/column";
import { createFloor } from "../elements/floor";
import { createWindow } from "../elements/window";
import { createDoor } from "../elements/door";
import { createWallType } from "../elements/wall-type";
import { createColumnType } from "../elements/column-type";
import { createWindowType } from "../elements/window-type";
import { createDoorType } from "../elements/door-type";
import type { TextureRenderer } from "./texture-renderer";
import type { TextureGenerator } from "./texture-generator";
import type { GisLayer3d } from "../gis/gis-layer-3d";
import type { ToolDescriptorMeta, CommandDescriptorMeta } from "./session-tracker";

/** Simplified selection API passed to AI-generated code. */
export interface SelectionAPI {
  getAll(): any[];
  getIds(): string[];
  getFirst(): any | null;
  clear(): void;
}

export interface ExecutionResult {
  success: boolean;
  createdIds: string[];
  removedIds: string[];
  error?: string;
  /** If the AI generated a tool definition (Mode C) */
  toolDefinition?: {
    descriptor: ToolDescriptorMeta;
    activate: () => void;
    deactivate: () => void;
    onPointerDown: (event: PointerEvent, point: [number, number, number] | null) => void;
    onPointerMove: (event: PointerEvent, point: [number, number, number] | null) => void;
    onPointerUp: (event: PointerEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
  /** If the AI generated a command definition (Mode D) */
  commandDefinition?: {
    descriptor: CommandDescriptorMeta;
    handler: () => void | Promise<void>;
  };
}

/** Extract the first code block from a markdown response. */
export function extractCode(response: string): string | null {
  const match = response.match(/```(?:typescript|ts|js|javascript)?\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** Extract plain text summary (everything outside code blocks). */
export function extractSummary(response: string): string {
  return response.replace(/```[\s\S]*?```/g, "").trim();
}

export async function execute(
  code: string,
  doc: BimDocument,
  textureRenderer?: TextureRenderer,
  gisLayer?: GisLayer3d,
  textureGenerator?: TextureGenerator,
  selection?: SelectionAPI,
): Promise<ExecutionResult> {
  const createdIds: string[] = [];
  const removedIds: string[] = [];

  // Listen for additions/removals during execution
  const onAdd = (contract: { id: string }) => createdIds.push(contract.id);
  const onRemove = (id: string) => removedIds.push(id);
  doc.onAdded.add(onAdd);
  doc.onRemoved.add(onRemove);

  try {
    // Auto-create missing default types so generated code always has valid typeId variables
    doc.transaction(() => {
      const typeFactories: Record<string, () => any> = {
        wallType: createWallType,
        columnType: createColumnType,
        windowType: createWindowType,
        doorType: createDoorType,
      };
      for (const [kind, factory] of Object.entries(typeFactories)) {
        const exists = [...doc.contracts.values()].some(c => c.kind === kind);
        if (!exists) doc.add(factory());
      }
    });

    // Resolve first type ID of each kind for convenience variables
    const typeIds: Record<string, string | undefined> = {};
    for (const [id, c] of doc.contracts) {
      const kind = c.kind;
      const varName = kind.replace(/Type$/, "") + "TypeId";
      if (kind.endsWith("Type") && !typeIds[varName]) {
        typeIds[varName] = id;
      }
    }

    // Provide a no-op selection API when none is supplied
    const sel: SelectionAPI = selection ?? { getAll: () => [], getIds: () => [], getFirst: () => null, clear: () => {} };

    // Check if the code contains tool or command definition exports
    const hasToolDef = /export\s+(?:const|let|var)\s+toolDefinition\b/.test(code);
    const hasCommandDef = /export\s+(?:const|let|var)\s+commandDefinition\b/.test(code);

    if (hasToolDef || hasCommandDef) {
      // Mode C/D: Rewrite exports into a module-like object
      return await executeContributionCode(
        code, doc, typeIds, textureRenderer, gisLayer, sel, createdIds, removedIds, hasToolDef, hasCommandDef
      );
    }

    // Mode A: Standard one-shot execution
    const wrappedCode = `return (async () => { ${code} })()`;

    const fn = new Function(
      "doc",
      "createWall",
      "createColumn",
      "createFloor",
      "createWindow",
      "createDoor",
      "createWallType",
      "createColumnType",
      "createWindowType",
      "createDoorType",
      "THREE",
      "wallTypeId",
      "columnTypeId",
      "windowTypeId",
      "doorTypeId",
      "textureRenderer",
      "gisLayer",
      "textureGenerator",
      "generateTexture",
      "selection",
      wrappedCode
    );

    // Helper: generate texture and apply to a material contract
    const generateTexture = textureGenerator
      ? async (prompt: string, materialId: string) => {
          await textureGenerator.generateAndApply(prompt, materialId, doc);
        }
      : undefined;

    await fn(
      doc,
      createWall,
      createColumn,
      createFloor,
      createWindow,
      createDoor,
      createWallType,
      createColumnType,
      createWindowType,
      createDoorType,
      THREE,
      typeIds["wallTypeId"],
      typeIds["columnTypeId"],
      typeIds["windowTypeId"],
      typeIds["doorTypeId"],
      textureRenderer,
      gisLayer,
      textureGenerator,
      generateTexture,
      sel,
    );

    return { success: true, createdIds, removedIds };
  } catch (e: any) {
    return { success: false, createdIds, removedIds, error: e.message };
  } finally {
    doc.onAdded.remove(onAdd);
    doc.onRemoved.remove(onRemove);
  }
}

/**
 * Execute code that contains tool/command export definitions (Mode C / Mode D).
 * Rewrites `export const/function` into assignments on a `__exports` object, then
 * extracts the contribution definitions.
 */
async function executeContributionCode(
  code: string,
  doc: BimDocument,
  typeIds: Record<string, string | undefined>,
  textureRenderer: TextureRenderer | undefined,
  gisLayer: GisLayer3d | undefined,
  selection: SelectionAPI,
  createdIds: string[],
  removedIds: string[],
  hasToolDef: boolean,
  hasCommandDef: boolean,
): Promise<ExecutionResult> {
  // Rewrite export statements into __exports assignments
  let rewritten = code
    .replace(/export\s+const\s+(\w+)/g, "__exports.$1")
    .replace(/export\s+let\s+(\w+)/g, "__exports.$1")
    .replace(/export\s+var\s+(\w+)/g, "__exports.$1")
    .replace(/export\s+function\s+(\w+)/g, "__exports.$1 = function $1")
    .replace(/export\s+async\s+function\s+(\w+)/g, "__exports.$1 = async function $1")
    .replace(/export\s+default\s+function\s*\(/g, "__exports.default = function(")
    .replace(/export\s+default\s+async\s+function\s*\(/g, "__exports.default = async function(");

  const wrappedCode = `
    const __exports = {};
    ${rewritten}
    return __exports;
  `;

  const fn = new Function(
    "doc",
    "createWall",
    "createColumn",
    "createFloor",
    "createWindow",
    "createDoor",
    "THREE",
    "wallTypeId",
    "columnTypeId",
    "windowTypeId",
    "doorTypeId",
    "textureRenderer",
    "gisLayer",
    "selection",
    wrappedCode
  );

  const exports = fn(
    doc,
    createWall,
    createColumn,
    createFloor,
    createWindow,
    createDoor,
    THREE,
    typeIds["wallTypeId"],
    typeIds["columnTypeId"],
    typeIds["windowTypeId"],
    typeIds["doorTypeId"],
    textureRenderer,
    gisLayer,
    selection,
  );

  const result: ExecutionResult = { success: true, createdIds, removedIds };

  // Extract tool definition (Mode C)
  if (hasToolDef && exports.toolDefinition) {
    const desc = exports.toolDefinition;
    const noop = () => {};
    result.toolDefinition = {
      descriptor: {
        id: desc.id || "ai-tool",
        label: desc.label || "AI Tool",
        category: desc.category === "edit" ? "edit" : "create",
      },
      activate: exports.activate ?? noop,
      deactivate: exports.deactivate ?? noop,
      onPointerDown: exports.onPointerDown ?? noop,
      onPointerMove: exports.onPointerMove ?? noop,
      onPointerUp: exports.onPointerUp ?? noop,
      onKeyDown: exports.onKeyDown ?? noop,
    };
  }

  // Extract command definition (Mode D)
  if (hasCommandDef && exports.commandDefinition) {
    const desc = exports.commandDefinition;
    result.commandDefinition = {
      descriptor: {
        id: desc.id || "ai-command",
        label: desc.label || "AI Command",
        keybinding: desc.keybinding,
      },
      handler: exports.default ?? (() => {}),
    };
  }

  return result;
}
