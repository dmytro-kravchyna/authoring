import * as THREE from "three";

/**
 * Add UV coordinates to a BufferGeometry using triplanar projection.
 * Each triangle is projected onto the axis most aligned with its face normal.
 * UV scale is 1 unit = 1 meter, suitable for tileable textures.
 */
export function addTriplanarUVs(geometry: THREE.BufferGeometry, scale = 1): void {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr) return;

  // Ensure we have normals
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  const normalAttr = geometry.getAttribute("normal")!;

  const uvs = new Float32Array(posAttr.count * 2);
  const normal = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    pos.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr, i);

    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    let u: number, v: number;
    if (absY >= absX && absY >= absZ) {
      // Top/bottom face → project onto XZ
      u = pos.x * scale;
      v = pos.z * scale;
    } else if (absX >= absZ) {
      // Side face (X-aligned normal) → project onto ZY
      u = pos.z * scale;
      v = pos.y * scale;
    } else {
      // Front/back face (Z-aligned normal) → project onto XY
      u = pos.x * scale;
      v = pos.y * scale;
    }

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
}
