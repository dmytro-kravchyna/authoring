import * as THREE from "three";
import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId, AnyContract } from "../core/contracts";
import type { FurnitureTypeContract } from "./furniture-type";
import { generateFurniture } from "../generators/furniture";
import { resolveMaterial } from "../utils/material-resolve";

// ── Contract ──────────────────────────────────────────────────────

export interface FurnitureContract extends BaseContract {
  kind: "furniture";
  typeId: ContractId;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians (defaultable, type default 0)
  cutTargets?: ContractId[];
}

export function isFurniture(c: BaseContract): c is FurnitureContract {
  return c.kind === "furniture";
}

export function createFurniture(
  position: [number, number, number],
  typeId: ContractId,
  options?: Partial<Pick<FurnitureContract, "rotation" | "cutTargets">>
): FurnitureContract {
  return {
    id: crypto.randomUUID(),
    kind: "furniture",
    typeId,
    position,
    rotation: options?.rotation,
    cutTargets: options?.cutTargets,
  };
}

// ── Resolved params ──────────────────────────────────────────────

export interface ResolvedFurnitureParams {
  generator: string;
  width: number;
  depth: number;
  height: number;
  rotation: number;
}

export function resolveFurnitureParams(
  furn: FurnitureContract,
  doc: { contracts: ReadonlyMap<ContractId, AnyContract> }
): ResolvedFurnitureParams {
  const type = doc.contracts.get(furn.typeId) as FurnitureTypeContract | undefined;
  return {
    generator: type?.generator ?? "desk",
    width: type?.width ?? 1.2,
    depth: type?.depth ?? 0.6,
    height: type?.height ?? 0.75,
    rotation: furn.rotation ?? 0,
  };
}

// ── Transform helpers ────────────────────────────────────────────

/** Build world transform: Y-rotation then translation to position. */
function furnitureWorldTransform(position: [number, number, number], rotation: number): THREE.Matrix4 {
  const mat = new THREE.Matrix4();
  if (rotation !== 0) {
    mat.makeRotationY(rotation);
  }
  mat.setPosition(new THREE.Vector3(...position));
  return mat;
}

// ── Element definition ────────────────────────────────────────────

const DEFAULT_MAT = new THREE.MeshLambertMaterial({ color: 0xc8a882, side: THREE.DoubleSide });

export const furnitureElement: ElementTypeDefinition = {
  kind: "furniture",
  typeKind: "furnitureType",

  generateGeometry(_engine, contract, doc) {
    const furn = contract as FurnitureContract;
    const { generator, width, depth, height, rotation } = resolveFurnitureParams(furn, doc);
    const geo = generateFurniture(generator, width, depth, height);
    geo.applyMatrix4(furnitureWorldTransform(furn.position, rotation));
    return geo;
  },

  generateLocalGeometry(_engine, contract, doc) {
    const furn = contract as FurnitureContract;
    const { generator, width, depth, height, rotation } = resolveFurnitureParams(furn, doc);
    const type = doc.contracts.get(furn.typeId) as FurnitureTypeContract | undefined;
    const bodyMatId = type?.materials?.body;

    const geometry = generateFurniture(generator, width, depth, height);
    const worldTransform = furnitureWorldTransform(furn.position, rotation);

    return {
      worldTransform,
      parts: [{
        geometry,
        geoHash: `furn:${generator}:${width}:${depth}:${height}|${bodyMatId ?? ""}`,
        material: resolveMaterial(bodyMatId, doc, DEFAULT_MAT),
      }],
    };
  },

  getVoidGeometry(_engine, contract, doc) {
    const furn = contract as FurnitureContract;
    const { generator, width, depth, height, rotation } = resolveFurnitureParams(furn, doc);
    const geo = generateFurniture(generator, width, depth, height);
    geo.applyMatrix4(furnitureWorldTransform(furn.position, rotation));
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
  },

  getRelationships(contract, _doc) {
    const furn = contract as FurnitureContract;
    const rels: ElementRelationship[] = [];
    if (furn.typeId) {
      rels.push({ type: "instanceOf", targetId: furn.typeId });
    }
    if (furn.levelId) {
      rels.push({ type: "belongsToLevel", targetId: furn.levelId as string });
    }
    if (furn.cutTargets) {
      for (const targetId of furn.cutTargets) {
        rels.push({ type: "cuts", targetId });
      }
    }
    return rels;
  },

  getSnapPoints(contract, doc) {
    const furn = contract as FurnitureContract;
    const { width, depth, rotation } = resolveFurnitureParams(furn, doc!);
    const pos = new THREE.Vector3(...furn.position);

    const points: { position: THREE.Vector3; type: "endpoint" | "midpoint" | "center" }[] = [
      { position: pos.clone(), type: "center" },
    ];

    // Four corners (rotated)
    const hw = width / 2;
    const hd = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const lx = sx * hw;
      const lz = sz * hd;
      points.push({
        position: new THREE.Vector3(
          pos.x + lx * cos - lz * sin,
          pos.y,
          pos.z + lx * sin + lz * cos
        ),
        type: "endpoint" as const,
      });
    }

    return points;
  },

  applyTranslation(contract, delta) {
    const furn = contract as FurnitureContract;
    return {
      ...furn,
      position: [
        furn.position[0] + delta[0],
        furn.position[1] + delta[1],
        furn.position[2] + delta[2],
      ] as [number, number, number],
    };
  },

  applyRotation(contract, angle, pivot) {
    const furn = contract as FurnitureContract;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = furn.position[0] - pivot[0], dz = furn.position[2] - pivot[2];
    return {
      ...furn,
      position: [pivot[0] + dx * cos - dz * sin, furn.position[1], pivot[2] + dx * sin + dz * cos] as [number, number, number],
      rotation: (furn.rotation ?? 0) - angle,
    };
  },

  remapIds(contract, idMap) {
    const furn = contract as FurnitureContract;
    return {
      ...furn,
      cutTargets: furn.cutTargets?.map(id => idMap.get(id)).filter((id): id is ContractId => id !== undefined),
    };
  },
};
