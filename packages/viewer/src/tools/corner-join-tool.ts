import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { FragmentManager } from "../fragments/manager";
import type { ContractId } from "../core/contracts";
import { isWall } from "../elements/wall";
import type { WallContract } from "../elements/wall";

// ── Helpers ──────────────────────────────────────────────────────

/** 2D line from wall start→end projected onto XZ. */
interface Line2D {
  ox: number; oz: number;   // origin
  dx: number; dz: number;   // direction (not normalised)
}

function wallLine(w: WallContract): Line2D {
  return {
    ox: w.start[0], oz: w.start[2],
    dx: w.end[0] - w.start[0], dz: w.end[2] - w.start[2],
  };
}

/**
 * Intersect two infinite 2D lines.  Returns parameters (t, u) such that
 *   P = a.o + t * a.d  =  b.o + u * b.d
 * Returns null when lines are (nearly) parallel.
 */
function intersectLines(a: Line2D, b: Line2D): { t: number; u: number } | null {
  const denom = a.dx * b.dz - a.dz * b.dx;
  if (Math.abs(denom) < 1e-9) return null;           // parallel / coincident
  const cx = b.ox - a.ox;
  const cz = b.oz - a.oz;
  const t = (cx * b.dz - cz * b.dx) / denom;
  const u = (cx * a.dz - cz * a.dx) / denom;
  return { t, u };
}

/**
 * Find the 3D intersection point of two wall centerlines (in XZ, Y from
 * the first wall's start elevation).
 */
function wallIntersection(
  wA: WallContract,
  wB: WallContract,
): [number, number, number] | null {
  const a = wallLine(wA);
  const b = wallLine(wB);
  const hit = intersectLines(a, b);
  if (!hit) return null;
  const x = a.ox + hit.t * a.dx;
  const z = a.oz + hit.t * a.dz;
  const y = wA.start[1];                              // keep existing elevation
  return [x, y, z];
}

/**
 * For a wall and a point on its infinite centerline, decide which
 * endpoint to move to that point and return the contract patch.
 *
 * Strategy: pick the endpoint that is *closest* to the intersection
 * (i.e. the end that needs the least change).
 */
function wallPatch(
  wall: WallContract,
  pt: [number, number, number],
): Partial<WallContract> {
  const ds = dist2(wall.start, pt);
  const de = dist2(wall.end, pt);
  if (ds <= de) {
    return { start: pt, startJoin: "miter" };
  }
  return { end: pt, endJoin: "miter" };
}

function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

// ── Tool ─────────────────────────────────────────────────────────

export class CornerJoinTool implements Tool {
  name = "corner-join";

  private doc: BimDocument;
  private scene: THREE.Scene;
  private mgr: FragmentManager;
  private toolMgr: ToolManager;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;

  /** First wall chosen by the user. */
  private wallA: WallContract | null = null;

  /** Highlight meshes shown while hovering / after first pick. */
  private highlightA: THREE.Mesh | null = null;
  private highlightB: THREE.Mesh | null = null;

  /** Snap indicator sphere shown at the projected intersection. */
  private indicator: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    doc: BimDocument,
    mgr: FragmentManager,
    toolMgr: ToolManager,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.scene = scene;
    this.doc = doc;
    this.mgr = mgr;
    this.toolMgr = toolMgr;
    this.camera = camera;
    this.canvas = canvas;

    // Cyan sphere used as a snap indicator at the intersection point
    const geo = new THREE.SphereGeometry(0.08, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, depthTest: false });
    this.indicator = new THREE.Mesh(geo, mat);
    this.indicator.renderOrder = 200;
    this.indicator.visible = false;
    scene.add(this.indicator);
  }

  // ── lifecycle ──────────────────────────────────────────────────

  activate() {
    document.body.style.cursor = "crosshair";
  }

  deactivate() {
    document.body.style.cursor = "default";
    this.reset();
  }

  // ── pointer events ─────────────────────────────────────────────

  async onPointerDown(event: PointerEvent, _intersection: THREE.Vector3 | null) {
    if (event.button !== 0) return;

    const picked = await this.pickWall(event);
    if (!picked) return;

    if (!this.wallA) {
      // ── First click: remember wall A ──
      this.wallA = picked;
      this.setHighlight(picked, "A");
      return;
    }

    // ── Second click: compute join & apply ──
    const wallB = picked;
    if (wallB.id === this.wallA.id) return;            // same wall — ignore

    const pt = wallIntersection(this.wallA, wallB);
    if (!pt) {
      // Parallel walls — cannot join.  Reset and let user retry.
      this.reset();
      return;
    }

    // Apply both patches in one undo-able transaction
    this.doc.transaction(() => {
      this.doc.update(this.wallA!.id, wallPatch(this.wallA!, pt));
      this.doc.update(wallB.id, wallPatch(wallB, pt));
    });

    this.reset();
  }

  async onPointerMove(event: PointerEvent, _intersection: THREE.Vector3 | null) {
    const hovered = await this.pickWall(event);

    // ── No wall under cursor ──
    if (!hovered) {
      this.clearHighlight("B");
      this.indicator.visible = false;
      return;
    }

    // ── Wall A not yet chosen — just highlight on hover ──
    if (!this.wallA) {
      this.setHighlight(hovered, "B");
      this.indicator.visible = false;
      return;
    }

    // ── Wall A chosen — preview the intersection ──
    if (hovered.id === this.wallA.id) {
      this.clearHighlight("B");
      this.indicator.visible = false;
      return;
    }

    this.setHighlight(hovered, "B");

    const pt = wallIntersection(this.wallA, hovered);
    if (pt) {
      this.indicator.position.set(pt[0], pt[1], pt[2]);
      this.indicator.visible = true;
    } else {
      this.indicator.visible = false;
    }
  }

  onPointerUp() {}

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") this.reset();
  }

  // ── picking ────────────────────────────────────────────────────

  private async pickWall(event: PointerEvent): Promise<WallContract | null> {
    const mouse = new THREE.Vector2(event.clientX, event.clientY);
    const data = { camera: this.camera, mouse, dom: this.canvas };

    let best: { localId: number; distance: number } | null = null;
    for (const [, model] of this.mgr.fragments.models.list) {
      const result = await model.raycast(data);
      if (result && (!best || result.distance < best.distance)) {
        best = { localId: result.localId, distance: result.distance };
      }
    }
    if (!best) return null;

    const contract = this.doc.getContractByFragmentId(best.localId);
    if (!contract || !isWall(contract)) return null;
    return contract;
  }

  // ── highlights ─────────────────────────────────────────────────

  private setHighlight(wall: WallContract, slot: "A" | "B") {
    const existing = slot === "A" ? this.highlightA : this.highlightB;
    // Reuse if same wall
    if (existing && (existing.userData as any).wallId === wall.id) return;
    this.clearHighlight(slot);

    const s = new THREE.Vector3(...wall.start);
    const e = new THREE.Vector3(...wall.end);
    const len = s.distanceTo(e);
    if (len < 0.001) return;

    const color = slot === "A" ? 0x00aaff : 0xffaa00;
    const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 8);
    geo.rotateZ(Math.PI / 2);
    geo.translate(len / 2, 0, 0);
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 199;

    // Orient along wall direction
    const dir = new THREE.Vector3().subVectors(e, s).normalize();
    const up = new THREE.Vector3(1, 0, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    mesh.quaternion.copy(quat);
    mesh.position.copy(s);

    (mesh.userData as any).wallId = wall.id;
    this.scene.add(mesh);
    if (slot === "A") this.highlightA = mesh;
    else this.highlightB = mesh;
  }

  private clearHighlight(slot: "A" | "B") {
    const mesh = slot === "A" ? this.highlightA : this.highlightB;
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    if (slot === "A") this.highlightA = null;
    else this.highlightB = null;
  }

  // ── reset ──────────────────────────────────────────────────────

  private reset() {
    this.wallA = null;
    this.clearHighlight("A");
    this.clearHighlight("B");
    this.indicator.visible = false;
  }
}
