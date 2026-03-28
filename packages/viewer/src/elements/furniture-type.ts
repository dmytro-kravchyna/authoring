import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";
import { furnitureGeneratorKeys } from "../generators/furniture";

// ── Contract ──────────────────────────────────────────────────────

export interface FurnitureTypeContract extends BaseContract {
  kind: "furnitureType";
  name: string;
  generator: string;    // key into furniture generator registry (type-only)
  width: number;        // type-only
  depth: number;        // type-only
  height: number;       // type-only
  materials?: Record<string, ContractId>;
}

export function isFurnitureType(c: { kind: string }): c is FurnitureTypeContract {
  return c.kind === "furnitureType";
}

export function createFurnitureType(
  options?: Partial<Pick<FurnitureTypeContract, "name" | "generator" | "width" | "depth" | "height">>
): FurnitureTypeContract {
  return {
    id: crypto.randomUUID(),
    kind: "furnitureType",
    name: options?.name ?? "Furniture Type",
    generator: options?.generator ?? "desk",
    width: options?.width ?? 1.2,
    depth: options?.depth ?? 0.6,
    height: options?.height ?? 0.75,
  };
}

// ── Element definition ────────────────────────────────────────────

export const furnitureTypeElement: ElementTypeDefinition = {
  kind: "furnitureType",
  dataOnly: true,
  metadataKeys: ["name"],
  instanceKind: "furniture",
  typeGroupLabel: "Furniture Types",
  materialSlots: ["body"],
  createDefault: () => createFurnitureType(),
  typeParams: [
    { key: "generator", label: "Shape", category: "type-only", inputType: "select", options: furnitureGeneratorKeys(), fallback: "desk" },
    { key: "width", label: "Width", category: "type-only", inputType: "number", step: 0.1, min: 0.1, max: 5, fallback: 1.2, summaryPrefix: "W", summaryUnit: "m" },
    { key: "depth", label: "Depth", category: "type-only", inputType: "number", step: 0.1, min: 0.1, max: 5, fallback: 0.6, summaryPrefix: "D", summaryUnit: "m" },
    { key: "height", label: "Height", category: "type-only", inputType: "number", step: 0.1, min: 0.1, max: 3, fallback: 0.75, summaryPrefix: "H", summaryUnit: "m" },
  ],

  generateGeometry() {
    throw new Error("furnitureType has no geometry — it is a data-only type contract");
  },

  getRelationships(contract) {
    const ct = contract as FurnitureTypeContract;
    const rels: ElementRelationship[] = [];
    if (ct.materials) {
      for (const matId of Object.values(ct.materials)) {
        if (matId) rels.push({ type: "usesMaterial", targetId: matId });
      }
    }
    return rels;
  },
};
