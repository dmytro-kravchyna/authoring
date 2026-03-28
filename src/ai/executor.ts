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

export interface ExecutionResult {
  success: boolean;
  createdIds: string[];
  removedIds: string[];
  error?: string;
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

export function execute(
  code: string,
  doc: BimDocument
): ExecutionResult {
  const createdIds: string[] = [];
  const removedIds: string[] = [];

  // Listen for additions/removals during execution
  const onAdd = (contract: { id: string }) => createdIds.push(contract.id);
  const onRemove = (id: string) => removedIds.push(id);
  doc.onAdded.add(onAdd);
  doc.onRemoved.add(onRemove);

  try {
    doc.transaction(() => {
      // Auto-create missing default types so generated code always has valid typeId variables
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

      // Resolve first type ID of each kind for convenience variables
      const typeIds: Record<string, string | undefined> = {};
      for (const [id, c] of doc.contracts) {
        const kind = c.kind;
        const varName = kind.replace(/Type$/, "") + "TypeId";
        if (kind.endsWith("Type") && !typeIds[varName]) {
          typeIds[varName] = id;
        }
      }

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
        code
      );

      fn(
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
        typeIds["doorTypeId"]
      );
    });

    return { success: true, createdIds, removedIds };
  } catch (e: any) {
    return { success: false, createdIds, removedIds, error: e.message };
  } finally {
    doc.onAdded.remove(onAdd);
    doc.onRemoved.remove(onRemove);
  }
}
