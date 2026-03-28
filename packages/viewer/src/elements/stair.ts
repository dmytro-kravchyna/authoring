import * as THREE from "three";
import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId, AnyContract } from "../core/contracts";
import type { StairTypeContract } from "./stair-type";
import { StairHandles } from "../handles/stair-handles";
import { generateStairGeometry, type StairParams, type StairShape } from "../generators/stair";

// ── Contract ──────────────────────────────────────────────────────

export interface StairContract extends BaseContract {
  kind: "stair";
  typeId: ContractId;
  start: [number, number, number]; // bottom landing
  end: [number, number, number];   // top landing (Y difference = total rise)
  cutTargets?: ContractId[];
}

export function isStair(c: BaseContract): c is StairContract {
  return c.kind === "stair";
}

export function createStair(
  start: [number, number, number],
  end: [number, number, number],
  typeId: ContractId,
  options?: Partial<Pick<StairContract, "cutTargets">>
): StairContract {
  return {
    id: crypto.randomUUID(),
    kind: "stair",
    typeId,
    start,
    end,
    cutTargets: options?.cutTargets,
  };
}

// ── Resolved params ──────────────────────────────────────────────

export function resolveStairParams(
  stair: { typeId: ContractId },
  doc: { contracts: ReadonlyMap<ContractId, AnyContract> }
): StairParams {
  const type = doc.contracts.get(stair.typeId) as StairTypeContract | undefined;
  return {
    width: type?.width ?? 1.2,
    riserHeight: type?.riserHeight ?? 0.17,
    treadDepth: type?.treadDepth ?? 0.28,
    shape: (type?.shape as StairShape) ?? "straight",
    railingHeight: type?.railingHeight ?? 0.9,
  };
}

// ── Element definition ────────────────────────────────────────────

export const stairElement: ElementTypeDefinition = {
  kind: "stair",
  typeKind: "stairType",

  generateGeometry(_engine, contract, doc) {
    const stair = contract as StairContract;
    const params = resolveStairParams(stair, doc);
    return generateStairGeometry(stair.start, stair.end, params);
  },

  // Stairs are unique per instance — no generateLocalGeometry / S.30 dedup

  getVoidGeometry(_engine, contract, doc) {
    const stair = contract as StairContract;
    const params = resolveStairParams(stair, doc);
    const geo = generateStairGeometry(stair.start, stair.end, params);
    if (geo.getAttribute("position")?.count === 0) return null;
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
  },

  getRelationships(contract, _doc) {
    const stair = contract as StairContract;
    const rels: ElementRelationship[] = [];
    if (stair.typeId) {
      rels.push({ type: "instanceOf", targetId: stair.typeId });
    }
    if (stair.levelId) {
      rels.push({ type: "belongsToLevel", targetId: stair.levelId as string });
    }
    if (stair.cutTargets) {
      for (const targetId of stair.cutTargets) {
        rels.push({ type: "cuts", targetId });
      }
    }
    return rels;
  },

  getSnapPoints(contract) {
    const stair = contract as StairContract;
    const s = new THREE.Vector3(...stair.start);
    const e = new THREE.Vector3(...stair.end);
    const mid = s.clone().add(e).multiplyScalar(0.5);
    return [
      { position: s, type: "endpoint" as const },
      { position: e, type: "endpoint" as const },
      { position: mid, type: "midpoint" as const },
    ];
  },

  getLinearEdges(contract) {
    const stair = contract as StairContract;
    return [{
      startId: "start",
      endId: "end",
      start: stair.start,
      end: stair.end,
      expansion: 0.6,
    }];
  },

  createHandles(scene, doc, _engine, contract) {
    return new StairHandles(scene, doc, contract as StairContract);
  },

  applyTranslation(contract, delta) {
    const stair = contract as StairContract;
    return {
      ...stair,
      start: [stair.start[0] + delta[0], stair.start[1] + delta[1], stair.start[2] + delta[2]] as [number, number, number],
      end: [stair.end[0] + delta[0], stair.end[1] + delta[1], stair.end[2] + delta[2]] as [number, number, number],
    };
  },

  applyRotation(contract, angle, pivot) {
    const stair = contract as StairContract;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rotXZ = (p: [number, number, number]): [number, number, number] => {
      const dx = p[0] - pivot[0], dz = p[2] - pivot[2];
      return [pivot[0] + dx * cos - dz * sin, p[1], pivot[2] + dx * sin + dz * cos];
    };
    return { ...stair, start: rotXZ(stair.start), end: rotXZ(stair.end) };
  },

  remapIds(contract, idMap) {
    const stair = contract as StairContract;
    return {
      ...stair,
      cutTargets: stair.cutTargets?.map(id => idMap.get(id)).filter((id): id is ContractId => id !== undefined),
    };
  },
};
