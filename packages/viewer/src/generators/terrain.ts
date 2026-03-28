import * as THREE from "three";

// ---------------------------------------------------------------------------
// Terrain geometry generator — Delaunay triangulation of 3D points
// ---------------------------------------------------------------------------

/**
 * Generate a terrain mesh from arbitrary 3D elevation points.
 * Projects points onto XZ for 2D Delaunay triangulation,
 * then builds a 3D mesh using each point's actual Y as elevation.
 *
 * Requires ≥3 non-collinear points.
 */
export function generateTerrainGeometry(
  points: [number, number, number][]
): THREE.BufferGeometry {
  if (points.length < 3) return new THREE.BufferGeometry();

  // Delaunay triangulation on XZ projection
  const triangles = delaunay2D(points.map(([x, _, z]) => [x, z]));
  if (triangles.length === 0) return new THREE.BufferGeometry();

  // Build BufferGeometry
  const positions: number[] = [];
  for (const [a, b, c] of triangles) {
    positions.push(points[a][0], points[a][1], points[a][2]);
    positions.push(points[b][0], points[b][1], points[b][2]);
    positions.push(points[c][0], points[c][1], points[c][2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Bowyer-Watson Delaunay triangulation (2D)
// ---------------------------------------------------------------------------

interface Triangle {
  a: number;
  b: number;
  c: number;
}

interface Circle {
  cx: number;
  cy: number;
  r2: number; // radius squared
}

/**
 * Compute 2D Delaunay triangulation using Bowyer-Watson algorithm.
 * @param pts Array of [x, z] points
 * @returns Array of [indexA, indexB, indexC] triangles referencing input indices
 */
function delaunay2D(pts: [number, number][]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];

  // Find bounding box and create super-triangle
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  const dx = maxX - minX;
  const dz = maxZ - minZ;
  const dmax = Math.max(dx, dz, 1);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  // Super-triangle vertices (indices n, n+1, n+2)
  const superPts: [number, number][] = [
    ...pts,
    [midX - 20 * dmax, midZ - dmax],
    [midX + 20 * dmax, midZ - dmax],
    [midX, midZ + 20 * dmax],
  ];

  // Start with super-triangle
  const triangles: Triangle[] = [{ a: n, b: n + 1, c: n + 2 }];
  const circumcircles = new Map<Triangle, Circle>();
  circumcircles.set(triangles[0], circumcircle(superPts, triangles[0]));

  // Insert each point
  for (let i = 0; i < n; i++) {
    const px = superPts[i][0];
    const pz = superPts[i][1];

    // Find triangles whose circumcircle contains the point
    const bad: Triangle[] = [];
    for (const tri of triangles) {
      const cc = circumcircles.get(tri)!;
      const dist2 = (px - cc.cx) * (px - cc.cx) + (pz - cc.cy) * (pz - cc.cy);
      if (dist2 <= cc.r2 + 1e-10) {
        bad.push(tri);
      }
    }

    // Find boundary edges of the polygonal hole
    const edges: [number, number][] = [];
    for (const tri of bad) {
      const triEdges: [number, number][] = [
        [tri.a, tri.b],
        [tri.b, tri.c],
        [tri.c, tri.a],
      ];
      for (const [ea, eb] of triEdges) {
        // Edge is on the boundary if it's not shared by another bad triangle
        let shared = false;
        for (const other of bad) {
          if (other === tri) continue;
          if (hasEdge(other, ea, eb)) {
            shared = true;
            break;
          }
        }
        if (!shared) edges.push([ea, eb]);
      }
    }

    // Remove bad triangles
    for (const tri of bad) {
      const idx = triangles.indexOf(tri);
      if (idx >= 0) triangles.splice(idx, 1);
      circumcircles.delete(tri);
    }

    // Create new triangles from boundary edges to the inserted point
    for (const [ea, eb] of edges) {
      const newTri: Triangle = { a: i, b: ea, c: eb };
      triangles.push(newTri);
      circumcircles.set(newTri, circumcircle(superPts, newTri));
    }
  }

  // Remove triangles that reference super-triangle vertices
  const result: [number, number, number][] = [];
  for (const tri of triangles) {
    if (tri.a >= n || tri.b >= n || tri.c >= n) continue;
    result.push([tri.a, tri.b, tri.c]);
  }

  return result;
}

function circumcircle(pts: [number, number][], tri: Triangle): Circle {
  const ax = pts[tri.a][0], ay = pts[tri.a][1];
  const bx = pts[tri.b][0], by = pts[tri.b][1];
  const cx = pts[tri.c][0], cy = pts[tri.c][1];

  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-12) {
    // Degenerate (collinear) — return huge circle
    return { cx: ax, cy: ay, r2: 1e20 };
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);

  return { cx: ux, cy: uy, r2 };
}

function hasEdge(tri: Triangle, ea: number, eb: number): boolean {
  const verts = [tri.a, tri.b, tri.c];
  const ia = verts.indexOf(ea);
  const ib = verts.indexOf(eb);
  return ia >= 0 && ib >= 0;
}
