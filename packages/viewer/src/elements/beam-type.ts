import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";

// ── Contract ──────────────────────────────────────────────────────

export type BeamProfileType = "rectangle" | "h" | "t" | "c" | "l" | "circle";

export interface BeamTypeContract extends BaseContract {
  kind: "beamType";
  name: string;
  height: number;       // profile height (type-only)
  width: number;        // profile width (type-only)
  profileType: BeamProfileType; // cross-section shape (type-only)
  materials?: Record<string, ContractId>;
}

export function isBeamType(c: { kind: string }): c is BeamTypeContract {
  return c.kind === "beamType";
}

export function createBeamType(
  options?: Partial<Pick<BeamTypeContract, "name" | "height" | "width" | "profileType">>
): BeamTypeContract {
  return {
    id: crypto.randomUUID(),
    kind: "beamType",
    name: options?.name ?? "Beam Type",
    height: options?.height ?? 0.3,
    width: options?.width ?? 0.2,
    profileType: options?.profileType ?? "rectangle",
  };
}

// ── Element definition ────────────────────────────────────────────

export const beamTypeElement: ElementTypeDefinition = {
  kind: "beamType",
  dataOnly: true,
  metadataKeys: ["name"],
  instanceKind: "beam",
  typeGroupLabel: "Beam Types",
  materialSlots: ["body"],
  createDefault: () => createBeamType(),
  typeParams: [
    { key: "height", label: "Height", category: "type-only", inputType: "number", step: 0.01, min: 0.05, max: 2, fallback: 0.3, summaryPrefix: "H", summaryUnit: "m" },
    { key: "width", label: "Width", category: "type-only", inputType: "number", step: 0.01, min: 0.05, max: 2, fallback: 0.2, summaryPrefix: "W", summaryUnit: "m" },
    { key: "profileType", label: "Profile", category: "type-only", inputType: "select", options: ["rectangle", "h", "t", "c", "l", "circle"], fallback: "rectangle" },
  ],

  generateGeometry() {
    throw new Error("beamType has no geometry — it is a data-only type contract");
  },

  getRelationships(contract) {
    const ct = contract as BeamTypeContract;
    const rels: ElementRelationship[] = [];
    if (ct.materials) {
      for (const matId of Object.values(ct.materials)) {
        if (matId) rels.push({ type: "usesMaterial", targetId: matId });
      }
    }
    return rels;
  },
};
