import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";

// ── Contract ──────────────────────────────────────────────────────

export interface RailingTypeContract extends BaseContract {
  kind: "railingType";
  name: string;
  height: number;       // total railing height (type-only)
  postWidth: number;    // post cross-section (type-only)
  postSpacing: number;  // distance between posts (type-only)
  railWidth: number;    // top rail width (type-only)
  railHeight: number;   // top rail height (type-only)
  materials?: Record<string, ContractId>;
}

export function isRailingType(c: { kind: string }): c is RailingTypeContract {
  return c.kind === "railingType";
}

export function createRailingType(
  options?: Partial<Pick<RailingTypeContract, "name" | "height" | "postWidth" | "postSpacing" | "railWidth" | "railHeight">>
): RailingTypeContract {
  return {
    id: crypto.randomUUID(),
    kind: "railingType",
    name: options?.name ?? "Railing Type",
    height: options?.height ?? 0.9,
    postWidth: options?.postWidth ?? 0.03,
    postSpacing: options?.postSpacing ?? 0.12,
    railWidth: options?.railWidth ?? 0.04,
    railHeight: options?.railHeight ?? 0.03,
  };
}

// ── Element definition ────────────────────────────────────────────

export const railingTypeElement: ElementTypeDefinition = {
  kind: "railingType",
  dataOnly: true,
  metadataKeys: ["name"],
  instanceKind: "railing",
  typeGroupLabel: "Railing Types",
  materialSlots: ["body"],
  createDefault: () => createRailingType(),
  typeParams: [
    { key: "height", label: "Height", category: "type-only", inputType: "number", step: 0.1, min: 0.3, max: 3, fallback: 0.9, summaryPrefix: "H", summaryUnit: "m" },
    { key: "postWidth", label: "Post Width", category: "type-only", inputType: "number", step: 0.01, min: 0.02, max: 0.2, fallback: 0.03 },
    { key: "postSpacing", label: "Post Spacing", category: "type-only", inputType: "number", step: 0.05, min: 0.05, max: 2, fallback: 0.12 },
    { key: "railWidth", label: "Rail Width", category: "type-only", inputType: "number", step: 0.01, min: 0.02, max: 0.2, fallback: 0.04 },
    { key: "railHeight", label: "Rail Height", category: "type-only", inputType: "number", step: 0.01, min: 0.02, max: 0.2, fallback: 0.03 },
  ],

  generateGeometry() {
    throw new Error("railingType has no geometry — it is a data-only type contract");
  },

  getRelationships(contract) {
    const ct = contract as RailingTypeContract;
    const rels: ElementRelationship[] = [];
    if (ct.materials) {
      for (const matId of Object.values(ct.materials)) {
        if (matId) rels.push({ type: "usesMaterial", targetId: matId });
      }
    }
    return rels;
  },
};
