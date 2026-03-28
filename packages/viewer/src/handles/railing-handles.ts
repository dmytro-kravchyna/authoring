import * as THREE from "three";
import type { BimDocument } from "../core/document";
import type { AnyContract, ContractId } from "../core/contracts";
import type { ToolManager } from "../tools/tool-manager";
import { HandleMesh } from "./base";
import { snapPoint, SnapIndicator, recordStickySnap } from "../utils/snap";
import type { RailingContract } from "../elements/railing";
import type { ElementHandles } from "../core/registry";

export class RailingHandles implements ElementHandles {
  contract: RailingContract;
  activeTarget: string | null = null;
  snapExcludeIds: ContractId[] = [];

  private vertexHandles: HandleMesh[] = [];
  private profileLine: THREE.Line | null = null;
  private snapIndicator: SnapIndicator;
  private doc: BimDocument;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, doc: BimDocument, contract: RailingContract) {
    this.scene = scene;
    this.doc = doc;
    this.contract = contract;
    this.snapIndicator = new SnapIndicator(scene);
    this.buildHandles();
  }

  checkHit(
    event: PointerEvent,
    toolMgr: ToolManager,
    _camera: THREE.PerspectiveCamera
  ): boolean {
    const meshes = this.vertexHandles.map((h) => h.mesh);
    const hits = toolMgr.raycastObjects(event, meshes);
    if (hits.length === 0) return false;

    const hitObj = hits[0].object;
    const idx = meshes.indexOf(hitObj as THREE.Mesh);
    if (idx < 0) return false;

    this.activeTarget = `v${idx}`;
    this.vertexHandles[idx].mesh.visible = false;
    return true;
  }

  onDrag(groundPoint: THREE.Vector3) {
    if (!this.activeTarget) return;

    const idx = parseInt(this.activeTarget.slice(1));
    if (isNaN(idx) || idx < 0 || idx >= this.contract.path.length) return;

    const result = snapPoint(groundPoint, this.doc, {
      excludeIds: [this.contract.id, ...this.snapExcludeIds],
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    const snapped = result.position;

    const newPath = [...this.contract.path];
    newPath[idx] = [snapped.x, snapped.y, snapped.z];

    this.contract = { ...this.contract, path: newPath };
    this.doc.update(this.contract.id, this.contract);

    this.vertexHandles[idx].setPosition(snapped);
    this.updateProfileLine();
  }

  onDragEnd() {
    if (!this.activeTarget) return;
    const idx = parseInt(this.activeTarget.slice(1));
    if (!isNaN(idx) && idx >= 0 && idx < this.vertexHandles.length) {
      this.vertexHandles[idx].mesh.visible = true;
    }
    this.activeTarget = null;
    this.snapIndicator.hide();
  }

  updateFromContract(contract: AnyContract) {
    this.contract = contract as RailingContract;
    // Rebuild if vertex count changed, reposition otherwise
    if (this.vertexHandles.length !== this.contract.path.length) {
      this.disposeHandles();
      this.buildHandles();
    } else {
      for (let i = 0; i < this.contract.path.length; i++) {
        this.vertexHandles[i].setPosition(new THREE.Vector3(...this.contract.path[i]));
      }
      this.updateProfileLine();
    }
  }

  dispose() {
    this.disposeHandles();
    this.snapIndicator.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────

  private buildHandles() {
    const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
    for (let i = 0; i < this.contract.path.length; i++) {
      const pos = new THREE.Vector3(...this.contract.path[i]);
      const geo = i === 0 ? sphereGeo : sphereGeo.clone();
      const handle = new HandleMesh(geo, 0x44cc88, pos);
      this.scene.add(handle.mesh);
      this.vertexHandles.push(handle);
    }
    this.updateProfileLine();
  }

  private updateProfileLine() {
    if (this.profileLine) {
      this.scene.remove(this.profileLine);
      this.profileLine.geometry.dispose();
      this.profileLine = null;
    }

    if (this.contract.path.length < 2) return;

    const points = this.contract.path.map(
      (p) => new THREE.Vector3(p[0], p[1] + 0.01, p[2])
    );
    // Open polyline — no closing segment
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x44cc88, depthTest: false });
    this.profileLine = new THREE.Line(geo, mat);
    this.profileLine.renderOrder = 10;
    this.scene.add(this.profileLine);
  }

  private disposeHandles() {
    for (const h of this.vertexHandles) {
      this.scene.remove(h.mesh);
      h.dispose();
    }
    this.vertexHandles = [];
    if (this.profileLine) {
      this.scene.remove(this.profileLine);
      this.profileLine.geometry.dispose();
      this.profileLine = null;
    }
  }
}
