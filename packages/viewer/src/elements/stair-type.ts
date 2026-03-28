import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";
import type { StairShape } from "../generators/stair";

// ── Contract ──────────────────────────────────────────────────────

export interface StairTypeContract extends BaseContract {
  kind: "stairType";
  name: string;
  width: number;
  riserHeight: number;
  treadDepth: number;
  shape: StairShape;
  railingHeight: number;
  materials?: Record<string, ContractId>;
}

export function isStairType(c: { kind: string }): c is StairTypeContract {
  return c.kind === "stairType";
}

export function createStairType(
  options?: Partial<Pick<StairTypeContract, "name" | "width" | "riserHeight" | "treadDepth" | "shape" | "railingHeight">>
): StairTypeContract {
  return {
    id: crypto.randomUUID(),
    kind: "stairType",
    name: options?.name ?? "Stair Type",
    width: options?.width ?? 1.2,
    riserHeight: options?.riserHeight ?? 0.17,
    treadDepth: options?.treadDepth ?? 0.28,
    shape: options?.shape ?? "straight",
    railingHeight: options?.railingHeight ?? 0.9,
  };
}

// ── Element definition ────────────────────────────────────────────

export const stairTypeElement: ElementTypeDefinition = {
  kind: "stairType",
  dataOnly: true,
  metadataKeys: ["name"],
  instanceKind: "stair",
  typeGroupLabel: "Stair Types",
  materialSlots: ["body"],
  createDefault: () => createStairType(),
  typeParams: [
    { key: "shape", label: "Shape", category: "type-only", inputType: "select", options: ["straight", "l", "u"], fallback: "straight" },
    { key: "width", label: "Width", category: "type-only", inputType: "number", step: 0.1, min: 0.6, max: 3, fallback: 1.2, summaryPrefix: "W", summaryUnit: "m" },
    { key: "riserHeight", label: "Riser Height", category: "type-only", inputType: "number", step: 0.01, min: 0.1, max: 0.25, fallback: 0.17 },
    { key: "treadDepth", label: "Tread Depth", category: "type-only", inputType: "number", step: 0.01, min: 0.2, max: 0.4, fallback: 0.28 },
    { key: "railingHeight", label: "Railing Height", category: "type-only", inputType: "number", step: 0.1, min: 0.5, max: 1.5, fallback: 0.9 },
  ],

  generateGeometry() {
    throw new Error("stairType has no geometry — it is a data-only type contract");
  },

  getRelationships(contract) {
    const ct = contract as StairTypeContract;
    const rels: ElementRelationship[] = [];
    if (ct.materials) {
      for (const matId of Object.values(ct.materials)) {
        if (matId) rels.push({ type: "usesMaterial", targetId: matId });
      }
    }
    return rels;
  },
};
