import * as THREE from "three";
import type { BimDocument } from "../core/document";
import type { AnyContract, ContractId } from "../core/contracts";
import type { ToolManager } from "../tools/tool-manager";
import { HandleMesh } from "./base";
import { snapPoint, SnapIndicator, recordStickySnap } from "../utils/snap";
import type { TerrainContract } from "../elements/terrain";
import { terrainVertexSelection } from "../elements/terrain";
import type { ElementHandles } from "../core/registry";

const HANDLE_COLOR = 0x88aa44;
const HANDLE_SELECTED_COLOR = 0xffcc00;

export class TerrainHandles implements ElementHandles {
  contract: TerrainContract;
  activeTarget: string | null = null;
  snapExcludeIds: ContractId[] = [];

  private vertexHandles: HandleMesh[] = [];
  private snapIndicator: SnapIndicator;
  private doc: BimDocument;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, doc: BimDocument, contract: TerrainContract) {
    this.scene = scene;
    this.doc = doc;
    this.contract = contract;
    this.snapIndicator = new SnapIndicator(scene);

    // Initialize shared selection state for this terrain
    terrainVertexSelection.contractId = contract.id;
    terrainVertexSelection.selected.clear();

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

    // Multi-select with shift, single-select without
    const sel = terrainVertexSelection;
    if (event.shiftKey) {
      if (sel.selected.has(idx)) {
        sel.selected.delete(idx);
      } else {
        sel.selected.add(idx);
      }
    } else {
      sel.selected.clear();
      sel.selected.add(idx);
    }
    this.updateHandleColors();
    sel.onChanged?.();

    this.activeTarget = `v${idx}`;
    this.vertexHandles[idx].mesh.visible = false;
    return true;
  }

  onDrag(groundPoint: THREE.Vector3) {
    if (!this.activeTarget) return;

    const idx = parseInt(this.activeTarget.slice(1));
    if (isNaN(idx) || idx < 0 || idx >= this.contract.points.length) return;

    const result = snapPoint(groundPoint, this.doc, {
      excludeIds: [this.contract.id, ...this.snapExcludeIds],
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    const snapped = result.position;

    // Preserve Y elevation of the point (drag in XZ only)
    const newPoints = [...this.contract.points];
    newPoints[idx] = [snapped.x, this.contract.points[idx][1], snapped.z];

    this.contract = { ...this.contract, points: newPoints };
    this.doc.update(this.contract.id, this.contract);

    this.vertexHandles[idx].setPosition(
      new THREE.Vector3(snapped.x, this.contract.points[idx][1], snapped.z)
    );
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
    this.contract = contract as TerrainContract;
    if (this.vertexHandles.length !== this.contract.points.length) {
      this.disposeHandles();
      this.buildHandles();
    } else {
      for (let i = 0; i < this.contract.points.length; i++) {
        this.vertexHandles[i].setPosition(new THREE.Vector3(...this.contract.points[i]));
      }
    }
  }

  dispose() {
    terrainVertexSelection.contractId = null;
    terrainVertexSelection.selected.clear();
    terrainVertexSelection.onChanged = null;
    this.disposeHandles();
    this.snapIndicator.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────

  private buildHandles() {
    const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
    for (let i = 0; i < this.contract.points.length; i++) {
      const pos = new THREE.Vector3(...this.contract.points[i]);
      const geo = i === 0 ? sphereGeo : sphereGeo.clone();
      const isSelected = terrainVertexSelection.selected.has(i);
      const handle = new HandleMesh(geo, isSelected ? HANDLE_SELECTED_COLOR : HANDLE_COLOR, pos);
      this.scene.add(handle.mesh);
      this.vertexHandles.push(handle);
    }
  }

  private updateHandleColors() {
    for (let i = 0; i < this.vertexHandles.length; i++) {
      const color = terrainVertexSelection.selected.has(i) ? HANDLE_SELECTED_COLOR : HANDLE_COLOR;
      (this.vertexHandles[i].mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  private disposeHandles() {
    for (const h of this.vertexHandles) {
      this.scene.remove(h.mesh);
      h.dispose();
    }
    this.vertexHandles = [];
  }
}
