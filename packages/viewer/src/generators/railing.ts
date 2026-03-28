import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Railing geometry generator
// ---------------------------------------------------------------------------

export interface RailingParams {
  height: number;
  postWidth: number;
  postSpacing: number;
  railWidth: number;
  railHeight: number;
}

/**
 * Generate railing geometry along a 3D polyline path.
 * Produces posts at intervals + top rail connecting them.
 * Geometry in world coordinates.
 */
export function generateRailingGeometry(
  path: [number, number, number][],
  params: RailingParams
): THREE.BufferGeometry {
  if (path.length < 2) return new THREE.BufferGeometry();

  const { height, postWidth, postSpacing, railWidth, railHeight } = params;
  const parts: THREE.BufferGeometry[] = [];

  // Collect all post positions along the path
  const postPositions: THREE.Vector3[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const a = new THREE.Vector3(...path[i]);
    const b = new THREE.Vector3(...path[i + 1]);
    const segDir = new THREE.Vector3().subVectors(b, a);
    const segLen = segDir.length();
    if (segLen < 0.001) continue;
    segDir.normalize();

    // Post at start of segment (skip if duplicate from previous segment end)
    if (postPositions.length === 0 || postPositions[postPositions.length - 1].distanceTo(a) > 0.01) {
      postPositions.push(a.clone());
    }

    // Intermediate posts along segment
    if (postSpacing > 0.01) {
      let d = postSpacing;
      while (d < segLen - 0.01) {
        const p = a.clone().addScaledVector(segDir, d);
        postPositions.push(p);
        d += postSpacing;
      }
    }

    // Post at end of segment
    postPositions.push(b.clone());
  }

  // Generate post geometry
  const hw = postWidth / 2;
  for (const pos of postPositions) {
    const geo = new THREE.BoxGeometry(postWidth, height, postWidth);
    geo.translate(pos.x, pos.y + height / 2, pos.z);
    parts.push(geo);
  }

  // Generate top rail segments between consecutive posts
  for (let i = 0; i < postPositions.length - 1; i++) {
    const a = postPositions[i];
    const b = postPositions[i + 1];

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 + height - railHeight / 2;
    const midZ = (a.z + b.z) / 2;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segLen < 0.001) continue;

    // Create rail segment as a box, then rotate to align with segment direction
    const geo = new THREE.BoxGeometry(segLen + railWidth, railHeight, railWidth);

    // Rotation: align box +X axis with segment direction in XZ
    const angleY = -Math.atan2(dz, dx);
    // Pitch: tilt for sloped segments
    const horizontalLen = Math.sqrt(dx * dx + dz * dz);
    const angleZ = Math.atan2(dy, horizontalLen);

    const mat = new THREE.Matrix4();
    mat.makeRotationY(angleY);
    const pitchMat = new THREE.Matrix4().makeRotationZ(angleZ);
    mat.multiply(pitchMat);
    mat.setPosition(midX, midY, midZ);
    geo.applyMatrix4(mat);

    parts.push(geo);
  }

  if (parts.length === 0) return new THREE.BufferGeometry();
  return BufferGeometryUtils.mergeGeometries(parts)!;
}
