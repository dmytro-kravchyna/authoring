import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Furniture generator registry
// ---------------------------------------------------------------------------

type FurnitureGenerator = (width: number, depth: number, height: number) => THREE.BufferGeometry;

const generators: Record<string, FurnitureGenerator> = {};

export function registerFurnitureGenerator(key: string, gen: FurnitureGenerator) {
  generators[key] = gen;
}

/** Get all registered generator keys. */
export function furnitureGeneratorKeys(): string[] {
  return Object.keys(generators);
}

/**
 * Generate furniture geometry at origin, centered on XZ, bottom at Y=0.
 * Falls back to a simple box if the generator key is unknown.
 */
export function generateFurniture(
  key: string,
  width: number,
  depth: number,
  height: number
): THREE.BufferGeometry {
  const gen = generators[key];
  if (gen) return gen(width, depth, height);
  // Fallback: simple box
  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(0, height / 2, 0);
  return geo;
}

// ---------------------------------------------------------------------------
// Helper: make a box at a specific position (centered on XZ at given offset)
// ---------------------------------------------------------------------------

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

// ---------------------------------------------------------------------------
// Built-in generators
// ---------------------------------------------------------------------------

/**
 * Desk: flat top slab + 4 legs.
 * Origin: center of footprint at floor level (Y=0).
 */
registerFurnitureGenerator("desk", (width, depth, height) => {
  const topThickness = 0.03;
  const legSize = 0.04;
  const legHeight = height - topThickness;
  const legInset = 0.05;

  const parts: THREE.BufferGeometry[] = [];

  // Top slab
  parts.push(box(width, topThickness, depth, 0, height - topThickness / 2, 0));

  // 4 legs
  const hw = width / 2 - legInset - legSize / 2;
  const hd = depth / 2 - legInset - legSize / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    parts.push(box(legSize, legHeight, legSize, sx * hw, legHeight / 2, sz * hd));
  }

  return BufferGeometryUtils.mergeGeometries(parts)!;
});

/**
 * Chair: seat slab + back panel + 4 legs.
 * Origin: center of footprint at floor level (Y=0).
 */
registerFurnitureGenerator("chair", (width, depth, height) => {
  const seatThickness = 0.03;
  const seatHeight = height; // height param = seat height
  const legSize = 0.03;
  const legHeight = seatHeight - seatThickness;
  const legInset = 0.02;
  const backHeight = height * 0.8;
  const backThickness = 0.025;

  const parts: THREE.BufferGeometry[] = [];

  // Seat
  parts.push(box(width, seatThickness, depth, 0, seatHeight - seatThickness / 2, 0));

  // 4 legs
  const hw = width / 2 - legInset - legSize / 2;
  const hd = depth / 2 - legInset - legSize / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    parts.push(box(legSize, legHeight, legSize, sx * hw, legHeight / 2, sz * hd));
  }

  // Back (at rear edge of seat, goes up from seat)
  const backZ = -depth / 2 + backThickness / 2 + legInset;
  parts.push(box(
    width - legInset * 2, backHeight, backThickness,
    0, seatHeight + backHeight / 2, backZ
  ));

  return BufferGeometryUtils.mergeGeometries(parts)!;
});

/**
 * Table: top slab + 4 legs (wider/taller proportions than desk).
 * Origin: center of footprint at floor level (Y=0).
 */
registerFurnitureGenerator("table", (width, depth, height) => {
  const topThickness = 0.04;
  const legSize = 0.06;
  const legHeight = height - topThickness;
  const legInset = 0.05;

  const parts: THREE.BufferGeometry[] = [];

  // Top slab
  parts.push(box(width, topThickness, depth, 0, height - topThickness / 2, 0));

  // 4 legs
  const hw = width / 2 - legInset - legSize / 2;
  const hd = depth / 2 - legInset - legSize / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    parts.push(box(legSize, legHeight, legSize, sx * hw, legHeight / 2, sz * hd));
  }

  return BufferGeometryUtils.mergeGeometries(parts)!;
});
