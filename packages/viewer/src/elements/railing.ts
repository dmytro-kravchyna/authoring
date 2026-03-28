import * as THREE from "three";
import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId, AnyContract } from "../core/contracts";
import type { RailingTypeContract } from "./railing-type";
import { RailingHandles } from "../handles/railing-handles";
import { generateRailingGeometry, type RailingParams } from "../generators/railing";
import { resolveMaterial } from "../utils/material-resolve";

// ── Contract ──────────────────────────────────────────────────────

export interface RailingContract extends BaseContract {
  kind: "railing";
  typeId: ContractId;
  path: [number, number, number][]; // open polyline, ≥2 points
  cutTargets?: ContractId[];
}

export function isRailing(c: BaseContract): c is RailingContract {
  return c.kind === "railing";
}

export function createRailing(
  path: [number, number, number][],
  typeId: ContractId,
  options?: Partial<Pick<RailingContract, "cutTargets">>
): RailingContract {
  return {
    id: crypto.randomUUID(),
    kind: "railing",
    typeId,
    path,
    cutTargets: options?.cutTargets,
  };
}

// ── Resolved params ──────────────────────────────────────────────

export function resolveRailingParams(
  railing: { typeId: ContractId },
  doc: { contracts: ReadonlyMap<ContractId, AnyContract> }
): RailingParams {
  const type = doc.contracts.get(railing.typeId) as RailingTypeContract | undefined;
  return {
    height: type?.height ?? 0.9,
    postWidth: type?.postWidth ?? 0.05,
    postSpacing: type?.postSpacing ?? 0.15,
    railWidth: type?.railWidth ?? 0.05,
    railHeight: type?.railHeight ?? 0.05,
  };
}

// ── Element definition ────────────────────────────────────────────

const DEFAULT_MAT = new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide });

export const railingElement: ElementTypeDefinition = {
  kind: "railing",
  typeKind: "railingType",

  generateGeometry(_engine, contract, doc) {
    const rail = contract as RailingContract;
    const params = resolveRailingParams(rail, doc);
    return generateRailingGeometry(rail.path, params);
  },

  // Railings are unique (path varies per instance) — no generateLocalGeometry / S.30 dedup

  getVoidGeometry(_engine, contract, doc) {
    const rail = contract as RailingContract;
    const params = resolveRailingParams(rail, doc);
    const geo = generateRailingGeometry(rail.path, params);
    if (geo.getAttribute("position")?.count === 0) return null;
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
  },

  getRelationships(contract, _doc) {
    const rail = contract as RailingContract;
    const rels: ElementRelationship[] = [];
    if (rail.typeId) {
      rels.push({ type: "instanceOf", targetId: rail.typeId });
    }
    if (rail.levelId) {
      rels.push({ type: "belongsToLevel", targetId: rail.levelId as string });
    }
    if (rail.cutTargets) {
      for (const targetId of rail.cutTargets) {
        rels.push({ type: "cuts", targetId });
      }
    }
    return rels;
  },

  getSnapPoints(contract) {
    const rail = contract as RailingContract;
    const points: { position: THREE.Vector3; type: "endpoint" | "midpoint" | "center" }[] = [];

    // Path vertices as endpoints
    for (const p of rail.path) {
      points.push({ position: new THREE.Vector3(...p), type: "endpoint" });
    }

    // Segment midpoints
    for (let i = 0; i < rail.path.length - 1; i++) {
      const a = new THREE.Vector3(...rail.path[i]);
      const b = new THREE.Vector3(...rail.path[i + 1]);
      points.push({ position: a.add(b).multiplyScalar(0.5), type: "midpoint" });
    }

    return points;
  },

  getLinearEdges(contract) {
    const rail = contract as RailingContract;
    const edges = [];
    for (let i = 0; i < rail.path.length - 1; i++) {
      edges.push({
        startId: `p${i}`,
        endId: `p${i + 1}`,
        start: rail.path[i],
        end: rail.path[i + 1],
        expansion: 0.05,
      });
    }
    return edges;
  },

  createHandles(scene, doc, _engine, contract) {
    return new RailingHandles(scene, doc, contract as RailingContract);
  },

  applyTranslation(contract, delta) {
    const rail = contract as RailingContract;
    return {
      ...rail,
      path: rail.path.map((p) => [
        p[0] + delta[0],
        p[1] + delta[1],
        p[2] + delta[2],
      ] as [number, number, number]),
    };
  },

  applyRotation(contract, angle, pivot) {
    const rail = contract as RailingContract;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return {
      ...rail,
      path: rail.path.map((p) => {
        const dx = p[0] - pivot[0], dz = p[2] - pivot[2];
        return [pivot[0] + dx * cos - dz * sin, p[1], pivot[2] + dx * sin + dz * cos] as [number, number, number];
      }),
    };
  },

  remapIds(contract, idMap) {
    const rail = contract as RailingContract;
    return {
      ...rail,
      cutTargets: rail.cutTargets?.map(id => idMap.get(id)).filter((id): id is ContractId => id !== undefined),
    };
  },
};
