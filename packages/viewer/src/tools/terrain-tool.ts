import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { ContractId } from "../core/contracts";
import { createTerrain } from "../elements/terrain";
import { generateTerrainGeometry } from "../generators/terrain";
import { snapPoint, SnapIndicator, recordStickySnap, clearStickySnaps } from "../utils/snap";
import { PREVIEW_MATERIAL } from "../utils/material-resolve";

export class TerrainTool implements Tool {
  name = "terrain";
  typeKind = "terrainType";

  private scene: THREE.Scene;
  private doc: BimDocument;
  private toolMgr: ToolManager;
  private snapIndicator: SnapIndicator;

  private positions: THREE.Vector3[] = [];
  private markers: THREE.Mesh[] = [];
  private previewMesh: THREE.Mesh | null = null;

  /** Current elevation for newly placed points. Editable via creation options panel. */
  pointHeight = 0;

  typeId: ContractId | null = null;
  levelId: ContractId | null = null;

  constructor(scene: THREE.Scene, doc: BimDocument, toolMgr: ToolManager) {
    this.scene = scene;
    this.doc = doc;
    this.toolMgr = toolMgr;
    this.snapIndicator = new SnapIndicator(scene);
  }

  activate() {
    document.body.style.cursor = "crosshair";
  }

  deactivate() {
    document.body.style.cursor = "default";
    this.clearPreview();
    this.snapIndicator.hide();
    clearStickySnaps();
  }

  onPointerDown(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (event.button !== 0 || !intersection || !this.typeId) return;

    const result = snapPoint(intersection, this.doc, {
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    const snapped = result.position;

    // Apply current point height
    const pos = new THREE.Vector3(snapped.x, this.pointHeight, snapped.z);
    this.positions.push(pos.clone());
    this.addMarker(pos);
    this.updatePreview();
  }

  onPointerMove(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (!intersection) {
      this.snapIndicator.hide();
      this.toolMgr.hideCursor();
      return;
    }

    const result = snapPoint(intersection, this.doc, {
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    this.toolMgr.setCursorPosition(result.position);
  }

  onPointerUp(_event: PointerEvent) {}

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.clearPreview();
    } else if (event.key === "Enter") {
      if (this.positions.length >= 3) {
        this.commitTerrain();
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private commitTerrain() {
    if (!this.typeId || this.positions.length < 3) return;

    const points = this.positions.map(
      (p) => [p.x, p.y, p.z] as [number, number, number]
    );
    const terrain = createTerrain(points, this.typeId);
    if (this.levelId) terrain.levelId = this.levelId;

    this.clearPreview();
    this.doc.add(terrain);
  }

  private addMarker(position: THREE.Vector3) {
    const geo = new THREE.SphereGeometry(0.1, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88aa44, depthTest: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.renderOrder = 10;
    this.scene.add(mesh);
    this.markers.push(mesh);
  }

  private updatePreview() {
    // Remove old preview
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      this.previewMesh = null;
    }

    if (this.positions.length < 3) return;

    const points = this.positions.map(
      (p) => [p.x, p.y, p.z] as [number, number, number]
    );
    const geo = generateTerrainGeometry(points);
    if (geo.getAttribute("position")?.count === 0) return;

    this.previewMesh = new THREE.Mesh(geo, PREVIEW_MATERIAL);
    this.previewMesh.renderOrder = 5;
    this.scene.add(this.previewMesh);
  }

  private clearPreview() {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      this.previewMesh = null;
    }
    for (const m of this.markers) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.markers = [];
    this.positions = [];
  }

  renderCreationOptions(container: HTMLElement) {
    const label = document.createElement("label");
    label.textContent = "Point Height";
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(this.pointHeight);
    input.step = "0.1";
    input.style.cssText = "width: 80px; margin-left: 8px;";
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) this.pointHeight = v;
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    label.appendChild(input);
    container.appendChild(label);
  }
}
