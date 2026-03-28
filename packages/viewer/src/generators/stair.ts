import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { generateRailingGeometry, type RailingParams } from "./railing";

// ---------------------------------------------------------------------------
// Stair geometry generator
// ---------------------------------------------------------------------------

export type StairShape = "straight" | "l" | "u";

export interface StairParams {
  width: number;
  riserHeight: number;
  treadDepth: number;
  shape: StairShape;
  railingHeight: number;
}

/**
 * Generate stair geometry between two 3D points.
 * Includes treads, risers, and auto-composed railings on both sides.
 */
export function generateStairGeometry(
  start: [number, number, number],
  end: [number, number, number],
  params: StairParams
): THREE.BufferGeometry {
  const { shape } = params;
  switch (shape) {
    case "straight":
      return generateStraight(start, end, params);
    case "l":
      return generateLShaped(start, end, params);
    case "u":
      return generateUShaped(start, end, params);
    default:
      return generateStraight(start, end, params);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

/** Create a box oriented along a direction. Width is perpendicular to dir, depth is along dir. */
function orientedBox(
  widthAlong: number, height: number, depthAlong: number,
  center: THREE.Vector3, dir: THREE.Vector3
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(widthAlong, height, depthAlong);
  // Rotate so Z-axis (depth) aligns with dir
  const angle = -Math.atan2(dir.z, dir.x) + Math.PI / 2;
  geo.rotateY(angle);
  geo.translate(center.x, center.y, center.z);
  return geo;
}

/** Perpendicular direction in XZ (90° left of dir). */
function perpXZ(dir: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-dir.z, 0, dir.x).normalize();
}

/** Get the XZ direction from start to end, normalized. */
function xzDir(start: [number, number, number], end: [number, number, number]): THREE.Vector3 {
  const d = new THREE.Vector3(end[0] - start[0], 0, end[2] - start[2]);
  const len = d.length();
  if (len < 0.001) return new THREE.Vector3(1, 0, 0); // fallback
  return d.divideScalar(len);
}

const TREAD_THICKNESS = 0.03;
const RISER_THICKNESS = 0.02;

/** Generate one straight flight of treads + risers. Returns parts array + edge paths for railings. */
function generateFlight(
  basePos: THREE.Vector3,
  dir: THREE.Vector3,
  width: number,
  numRisers: number,
  actualRiserH: number,
  treadDepth: number,
): { parts: THREE.BufferGeometry[]; leftPath: [number, number, number][]; rightPath: [number, number, number][] } {
  const parts: THREE.BufferGeometry[] = [];
  const perp = perpXZ(dir);
  const leftPath: [number, number, number][] = [];
  const rightPath: [number, number, number][] = [];

  for (let i = 0; i < numRisers; i++) {
    const treadY = basePos.y + actualRiserH * (i + 1);
    const treadCenter = basePos.clone()
      .addScaledVector(dir, treadDepth * i + treadDepth / 2);

    // Tread (width perpendicular to dir, depth along dir)
    parts.push(orientedBox(
      width, TREAD_THICKNESS, treadDepth,
      new THREE.Vector3(treadCenter.x, treadY - TREAD_THICKNESS / 2, treadCenter.z),
      dir
    ));

    // Riser (vertical face at front of each tread)
    const riserCenter = basePos.clone()
      .addScaledVector(dir, treadDepth * i);
    parts.push(orientedBox(
      width, actualRiserH, RISER_THICKNESS,
      new THREE.Vector3(riserCenter.x, treadY - actualRiserH / 2, riserCenter.z),
      dir
    ));

    // Railing edge points at this step (top of tread)
    const stepPos = basePos.clone()
      .addScaledVector(dir, treadDepth * i + treadDepth / 2);
    const leftPt = stepPos.clone().addScaledVector(perp, width / 2);
    const rightPt = stepPos.clone().addScaledVector(perp, -width / 2);
    leftPath.push([leftPt.x, treadY, leftPt.z]);
    rightPath.push([rightPt.x, treadY, rightPt.z]);
  }

  return { parts, leftPath, rightPath };
}

function makeRailingParams(railingHeight: number): RailingParams {
  return {
    height: railingHeight,
    postWidth: 0.03,
    postSpacing: 0.12,
    railWidth: 0.04,
    railHeight: 0.03,
  };
}

function addRailings(
  parts: THREE.BufferGeometry[],
  leftPath: [number, number, number][],
  rightPath: [number, number, number][],
  railingHeight: number
) {
  if (leftPath.length >= 2) {
    const geo = generateRailingGeometry(leftPath, makeRailingParams(railingHeight));
    if (geo.getAttribute("position")?.count > 0) parts.push(geo);
  }
  if (rightPath.length >= 2) {
    const geo = generateRailingGeometry(rightPath, makeRailingParams(railingHeight));
    if (geo.getAttribute("position")?.count > 0) parts.push(geo);
  }
}

// ---------------------------------------------------------------------------
// Straight
// ---------------------------------------------------------------------------

function generateStraight(
  start: [number, number, number],
  end: [number, number, number],
  params: StairParams
): THREE.BufferGeometry {
  const { width, riserHeight, treadDepth, railingHeight } = params;
  const totalRise = end[1] - start[1];
  if (Math.abs(totalRise) < 0.01) return new THREE.BufferGeometry();

  const numRisers = Math.max(1, Math.round(Math.abs(totalRise) / riserHeight));
  const actualRiserH = totalRise / numRisers;
  const dir = xzDir(start, end);
  const basePos = new THREE.Vector3(...start);

  const { parts, leftPath, rightPath } = generateFlight(
    basePos, dir, width, numRisers, actualRiserH, treadDepth
  );

  addRailings(parts, leftPath, rightPath, railingHeight);

  if (parts.length === 0) return new THREE.BufferGeometry();
  return BufferGeometryUtils.mergeGeometries(parts)!;
}

// ---------------------------------------------------------------------------
// L-shaped (90° turn with landing)
// ---------------------------------------------------------------------------

function generateLShaped(
  start: [number, number, number],
  end: [number, number, number],
  params: StairParams
): THREE.BufferGeometry {
  const { width, riserHeight, treadDepth, railingHeight } = params;
  const totalRise = end[1] - start[1];
  if (Math.abs(totalRise) < 0.01) return new THREE.BufferGeometry();

  const totalRisers = Math.max(2, Math.round(Math.abs(totalRise) / riserHeight));
  const actualRiserH = totalRise / totalRisers;
  const halfRisers = Math.floor(totalRisers / 2);
  const secondHalfRisers = totalRisers - halfRisers;

  // First flight: goes along XZ direction from start
  const dir1 = xzDir(start, end);
  const basePos1 = new THREE.Vector3(...start);
  const flight1 = generateFlight(basePos1, dir1, width, halfRisers, actualRiserH, treadDepth);

  // Landing position: at end of first flight
  const landingY = start[1] + actualRiserH * halfRisers;
  const landingCenter = basePos1.clone()
    .addScaledVector(dir1, halfRisers * treadDepth + width / 2);
  const parts = [...flight1.parts];

  // Landing platform (square, oriented along first flight direction)
  parts.push(orientedBox(width, TREAD_THICKNESS, width,
    new THREE.Vector3(landingCenter.x, landingY - TREAD_THICKNESS / 2, landingCenter.z), dir1));

  // Second flight: 90° turn (turn left from dir1)
  const dir2 = perpXZ(dir1);
  const basePos2 = landingCenter.clone().addScaledVector(dir2, width / 2);
  basePos2.y = landingY;
  const flight2 = generateFlight(basePos2, dir2, width, secondHalfRisers, actualRiserH, treadDepth);
  parts.push(...flight2.parts);

  // Railings for both flights
  addRailings(parts, flight1.leftPath, flight1.rightPath, railingHeight);
  addRailings(parts, flight2.leftPath, flight2.rightPath, railingHeight);

  if (parts.length === 0) return new THREE.BufferGeometry();
  return BufferGeometryUtils.mergeGeometries(parts)!;
}

// ---------------------------------------------------------------------------
// U-shaped (180° turn with landing)
// ---------------------------------------------------------------------------

function generateUShaped(
  start: [number, number, number],
  end: [number, number, number],
  params: StairParams
): THREE.BufferGeometry {
  const { width, riserHeight, treadDepth, railingHeight } = params;
  const totalRise = end[1] - start[1];
  if (Math.abs(totalRise) < 0.01) return new THREE.BufferGeometry();

  const totalRisers = Math.max(2, Math.round(Math.abs(totalRise) / riserHeight));
  const actualRiserH = totalRise / totalRisers;
  const halfRisers = Math.floor(totalRisers / 2);
  const secondHalfRisers = totalRisers - halfRisers;

  // First flight: goes along XZ direction from start
  const dir1 = xzDir(start, end);
  const perp = perpXZ(dir1);
  const basePos1 = new THREE.Vector3(...start);
  const flight1 = generateFlight(basePos1, dir1, width, halfRisers, actualRiserH, treadDepth);

  // Landing position: at end of first flight
  const landingY = start[1] + actualRiserH * halfRisers;
  const flightEnd1 = basePos1.clone()
    .addScaledVector(dir1, halfRisers * treadDepth);

  // Landing: spans from flight1 lane to flight2 lane (perpendicular offset)
  // and extends forward by width (along dir1)
  const landingCenter = flightEnd1.clone()
    .addScaledVector(dir1, width / 2)
    .addScaledVector(perp, -width / 2);
  const parts = [...flight1.parts];

  // Landing platform (perpendicular width spans both flights, depth along dir1)
  parts.push(orientedBox(width * 2, TREAD_THICKNESS, width,
    new THREE.Vector3(landingCenter.x, landingY - TREAD_THICKNESS / 2, landingCenter.z), dir1));

  // Second flight: opposite direction, offset perpendicular by width.
  // Starts at the near edge of the landing on the return side
  // (the end closest to start), going back in -dir1.
  const dir2 = dir1.clone().negate();
  const basePos2 = flightEnd1.clone()
    .addScaledVector(perp, -width); // offset to return flight lane (no dir1 offset — near edge)
  basePos2.y = landingY;
  // Second flight goes back in opposite direction
  const flight2 = generateFlight(basePos2, dir2, width, secondHalfRisers, actualRiserH, treadDepth);
  parts.push(...flight2.parts);

  // Railings
  addRailings(parts, flight1.leftPath, flight1.rightPath, railingHeight);
  addRailings(parts, flight2.leftPath, flight2.rightPath, railingHeight);

  if (parts.length === 0) return new THREE.BufferGeometry();
  return BufferGeometryUtils.mergeGeometries(parts)!;
}
