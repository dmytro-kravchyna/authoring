import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";

// ── Contract ──────────────────────────────────────────────────────

export interface TerrainTypeContract extends BaseContract {
  kind: "terrainType";
  name: string;
  materials?: Record<string, ContractId>;
}

export function isTerrainType(c: { kind: string }): c is TerrainTypeContract {
  return c.kind === "terrainType";
}

export function createTerrainType(
  options?: Partial<Pick<TerrainTypeContract, "name">>
): TerrainTypeContract {
  return {
    id: crypto.randomUUID(),
    kind: "terrainType",
    name: options?.name ?? "Terrain Type",
  };
}

// ── Element definition ────────────────────────────────────────────

export const terrainTypeElement: ElementTypeDefinition = {
  kind: "terrainType",
  dataOnly: true,
  metadataKeys: ["name"],
  instanceKind: "terrain",
  typeGroupLabel: "Terrain Types",
  materialSlots: ["body"],
  createDefault: () => createTerrainType(),
  typeParams: [],

  generateGeometry() {
    throw new Error("terrainType has no geometry — it is a data-only type contract");
  },

  getRelationships(contract) {
    const ct = contract as TerrainTypeContract;
    const rels: ElementRelationship[] = [];
    if (ct.materials) {
      for (const matId of Object.values(ct.materials)) {
        if (matId) rels.push({ type: "usesMaterial", targetId: matId });
      }
    }
    return rels;
  },
};
