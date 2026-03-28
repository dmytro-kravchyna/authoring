import * as THREE from "three";
import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId, AnyContract } from "../core/contracts";
import type { BeamTypeContract, BeamProfileType } from "./beam-type";
import type { BimDocument } from "../core/document";
import { BeamHandles } from "../handles/beam-handles";
import {
  rectangleProfile,
  circleProfile,
  hProfile,
  tProfile,
  cProfile,
  lProfile,
  extrudeProfile,
} from "../generators/profiles";
import { resolveMaterial } from "../utils/material-resolve";

// ── Contract ──────────────────────────────────────────────────────

export interface BeamContract extends BaseContract {
  kind: "beam";
  typeId: ContractId;
  start: [number, number, number];
  end: [number, number, number];
  rotation: number; // profile roll around beam axis, radians (default 0)
  cutTargets?: ContractId[];
}

export function isBeam(c: BaseContract): c is BeamContract {
  return c.kind === "beam";
}

export function createBeam(
  start: [number, number, number],
  end: [number, number, number],
  typeId: ContractId,
  options?: Partial<Pick<BeamContract, "rotation" | "cutTargets">>
): BeamContract {
  return {
    id: crypto.randomUUID(),
    kind: "beam",
    typeId,
    start,
    end,
    rotation: options?.rotation ?? 0,
    cutTargets: options?.cutTargets,
  };
}

// ── Resolved params ──────────────────────────────────────────────

export interface ResolvedBeamParams {
  height: number;
  width: number;
  profileType: BeamProfileType;
}

export function resolveBeamParams(
  beam: { typeId: ContractId },
  doc: { contracts: ReadonlyMap<ContractId, AnyContract> }
): ResolvedBeamParams {
  const type = doc.contracts.get(beam.typeId) as BeamTypeContract | undefined;
  return {
    height: type?.height ?? 0.3,
    width: type?.width ?? 0.2,
    profileType: type?.profileType ?? "rectangle",
  };
}

// ── Profile selection ────────────────────────────────────────────

function getProfilePoints(profileType: BeamProfileType, width: number, height: number): number[] {
  switch (profileType) {
    case "rectangle":
      return rectangleProfile(width, height);
    case "circle":
      return circleProfile(Math.min(width, height) / 2);
    case "h":
      return hProfile(width, height, Math.min(width, height) * 0.15, Math.min(width, height) * 0.1);
    case "t":
      return tProfile(width, height, Math.min(width, height) * 0.15, Math.min(width, height) * 0.1);
    case "c":
      return cProfile(width, height, Math.min(width, height) * 0.15, Math.min(width, height) * 0.1);
    case "l":
      return lProfile(width, height, Math.min(width, height) * 0.15);
    default:
      return rectangleProfile(width, height);
  }
}

// ── Geometry helpers ─────────────────────────────────────────────

function beamDirection(beam: BeamContract): [number, number, number] {
  const dx = beam.end[0] - beam.start[0];
  const dy = beam.end[1] - beam.start[1];
  const dz = beam.end[2] - beam.start[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return [1, 0, 0]; // degenerate fallback
  return [dx / len, dy / len, dz / len];
}

function beamLength(beam: BeamContract): number {
  const dx = beam.end[0] - beam.start[0];
  const dy = beam.end[1] - beam.start[1];
  const dz = beam.end[2] - beam.start[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Build a world transform matrix for a beam.
 *
 * The profile lives in the XZ plane (Y=0) and is extruded along +Y.
 * We need to map:
 *   local +Y  →  beam direction (start→end)
 *   local +Z  →  world up (so the profile's "height" stays vertical)
 *   local +X  →  perpendicular (horizontal)
 *
 * This is a basis-change matrix, not a shortest-rotation quaternion,
 * so the profile roll is deterministic regardless of beam direction.
 */
function beamWorldTransform(beam: BeamContract): THREE.Matrix4 {
  const dir = new THREE.Vector3(...beamDirection(beam));
  const worldUp = new THREE.Vector3(0, 1, 0);

  let localX: THREE.Vector3;
  let localZ: THREE.Vector3;

  if (Math.abs(dir.dot(worldUp)) > 1 - 1e-6) {
    // Beam is vertical (or near-vertical) — fall back to world-Z as "up" for the profile
    const fallbackUp = new THREE.Vector3(0, 0, 1);
    localX = new THREE.Vector3().crossVectors(dir, fallbackUp).normalize();
    localZ = new THREE.Vector3().crossVectors(localX, dir).normalize();
  } else {
    // Profile X = beam direction × world up  (horizontal, perpendicular to beam)
    localX = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
    // Profile Z = X × beam direction  (in the vertical plane containing the beam)
    localZ = new THREE.Vector3().crossVectors(localX, dir).normalize();
  }

  // Apply profile roll rotation around beam axis
  if (beam.rotation !== 0) {
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(dir, beam.rotation);
    localX.applyQuaternion(rollQuat);
    localZ.applyQuaternion(rollQuat);
  }

  // Basis matrix: columns are localX, dir (beam axis = extrusion), localZ
  const mat = new THREE.Matrix4();
  mat.makeBasis(localX, dir, localZ);
  mat.setPosition(new THREE.Vector3(...beam.start));
  return mat;
}

// ── Preview helper ───────────────────────────────────────────────

/**
 * Generate beam preview geometry with correct profile orientation.
 * Extrudes along +Y at origin, then applies the beam basis transform.
 */
export function createBeamPreviewGeometry(
  engine: import("@thatopen/fragments").GeometryEngine,
  start: [number, number, number],
  end: [number, number, number],
  profileType: BeamProfileType,
  width: number,
  height: number,
): THREE.BufferGeometry {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-6) return new THREE.BufferGeometry();

  const profile = getProfilePoints(profileType, width, height);
  const geo = extrudeProfile(engine, {
    profile,
    position: [0, 0, 0],
    direction: [0, 1, 0],
    length,
  });

  // Apply the same basis transform used by generateLocalGeometry
  const fakeBeam = { start, end, rotation: 0 } as BeamContract;
  geo.applyMatrix4(beamWorldTransform(fakeBeam));
  return geo;
}

// ── Element definition ────────────────────────────────────────────

const DEFAULT_MAT = new THREE.MeshLambertMaterial({ color: 0xb0b0b0, side: THREE.DoubleSide });

export const beamElement: ElementTypeDefinition = {
  kind: "beam",
  typeKind: "beamType",

  generateGeometry(engine, contract, doc) {
    const beam = contract as BeamContract;
    const { height, width, profileType } = resolveBeamParams(beam, doc);
    const length = beamLength(beam);
    if (length < 1e-6) return new THREE.BufferGeometry();
    const profile = getProfilePoints(profileType, width, height);
    // Extrude along +Y at origin (where XZ profile is correctly oriented),
    // then apply basis transform to position and orient in world space.
    const geo = extrudeProfile(engine, {
      profile,
      position: [0, 0, 0],
      direction: [0, 1, 0],
      length,
    });
    geo.applyMatrix4(beamWorldTransform(beam));
    return geo;
  },

  generateLocalGeometry(engine, contract, doc) {
    const beam = contract as BeamContract;
    const { height, width, profileType } = resolveBeamParams(beam, doc);
    const type = doc.contracts.get(beam.typeId) as BeamTypeContract | undefined;
    const bodyMatId = type?.materials?.body;
    const length = beamLength(beam);

    if (length < 1e-6) {
      return {
        worldTransform: new THREE.Matrix4().makeTranslation(...beam.start),
        parts: [{
          geometry: new THREE.BufferGeometry(),
          geoHash: `beam:empty`,
          material: resolveMaterial(bodyMatId, doc, DEFAULT_MAT),
        }],
      };
    }

    const profile = getProfilePoints(profileType, width, height);
    // Generate at origin, extruded along +Y
    const geometry = extrudeProfile(engine, {
      profile,
      position: [0, 0, 0],
      direction: [0, 1, 0],
      length,
    });

    const worldTransform = beamWorldTransform(beam);
    const lenStr = length.toFixed(4);

    return {
      worldTransform,
      parts: [{
        geometry,
        geoHash: `beam:${profileType}:${height}:${width}:${lenStr}|${bodyMatId ?? ""}`,
        material: resolveMaterial(bodyMatId, doc, DEFAULT_MAT),
      }],
    };
  },

  getVoidGeometry(engine, contract, doc) {
    const beam = contract as BeamContract;
    const { height, width, profileType } = resolveBeamParams(beam, doc);
    const length = beamLength(beam);
    if (length < 1e-6) return null;
    const profile = getProfilePoints(profileType, width, height);
    const geo = extrudeProfile(engine, {
      profile,
      position: [0, 0, 0],
      direction: [0, 1, 0],
      length,
    });
    geo.applyMatrix4(beamWorldTransform(beam));
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
  },

  getRelationships(contract, _doc) {
    const beam = contract as BeamContract;
    const rels: ElementRelationship[] = [];
    if (beam.typeId) {
      rels.push({ type: "instanceOf", targetId: beam.typeId });
    }
    if (beam.levelId) {
      rels.push({ type: "belongsToLevel", targetId: beam.levelId as string });
    }
    if (beam.cutTargets) {
      for (const targetId of beam.cutTargets) {
        rels.push({ type: "cuts", targetId });
      }
    }
    return rels;
  },

  getSnapPoints(contract, doc) {
    const beam = contract as BeamContract;
    const start = new THREE.Vector3(...beam.start);
    const end = new THREE.Vector3(...beam.end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    return [
      { position: start, type: "endpoint" as const },
      { position: end, type: "endpoint" as const },
      { position: mid, type: "midpoint" as const },
    ];
  },

  getLinearEdges(contract, doc) {
    const beam = contract as BeamContract;
    const { width, height } = resolveBeamParams(beam, doc);
    return [{
      startId: "start",
      endId: "end",
      start: beam.start,
      end: beam.end,
      expansion: Math.max(width, height) / 2,
    }];
  },

  createHandles(scene, doc, _engine, contract) {
    return new BeamHandles(scene, doc, contract as BeamContract);
  },

  applyTranslation(contract, delta) {
    const beam = contract as BeamContract;
    return {
      ...beam,
      start: [beam.start[0] + delta[0], beam.start[1] + delta[1], beam.start[2] + delta[2]] as [number, number, number],
      end: [beam.end[0] + delta[0], beam.end[1] + delta[1], beam.end[2] + delta[2]] as [number, number, number],
    };
  },

  applyRotation(contract, angle, pivot) {
    const beam = contract as BeamContract;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rotXZ = (p: [number, number, number]): [number, number, number] => {
      const dx = p[0] - pivot[0], dz = p[2] - pivot[2];
      return [pivot[0] + dx * cos - dz * sin, p[1], pivot[2] + dx * sin + dz * cos];
    };
    return { ...beam, start: rotXZ(beam.start), end: rotXZ(beam.end) };
  },

  remapIds(contract, idMap) {
    const beam = contract as BeamContract;
    return {
      ...beam,
      cutTargets: beam.cutTargets?.map(id => idMap.get(id)).filter((id): id is ContractId => id !== undefined),
    };
  },
};
