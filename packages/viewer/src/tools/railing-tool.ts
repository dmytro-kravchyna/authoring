import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { ContractId } from "../core/contracts";
import { createRailing } from "../elements/railing";
import { snapPoint, SnapIndicator, recordStickySnap, clearStickySnaps } from "../utils/snap";

export class RailingTool implements Tool {
  name = "railing";
  typeKind = "railingType";

  private scene: THREE.Scene;
  private doc: BimDocument;
  private toolMgr: ToolManager;
  private snapIndicator: SnapIndicator;

  private positions: THREE.Vector3[] = [];
  private markers: THREE.Mesh[] = [];
  private previewLine: THREE.Line | null = null;

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
      anchor: this.positions.length > 0 ? this.positions[this.positions.length - 1] : undefined,
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    const snapped = result.position;

    // Double-click detection: if close to last point and ≥2 points, commit
    if (this.positions.length >= 2) {
      const last = this.positions[this.positions.length - 1];
      if (snapped.distanceTo(last) < 0.1) {
        this.commitRailing();
        return;
      }
    }

    this.positions.push(snapped.clone());
    this.addMarker(snapped);
    this.updatePreviewLine(snapped);
  }

  onPointerMove(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (!intersection) {
      this.snapIndicator.hide();
      this.toolMgr.hideCursor();
      return;
    }

    const result = snapPoint(intersection, this.doc, {
      anchor: this.positions.length > 0 ? this.positions[this.positions.length - 1] : undefined,
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    this.toolMgr.setCursorPosition(result.position);

    if (this.positions.length > 0) {
      this.updatePreviewLine(result.position);
    }
  }

  onPointerUp(_event: PointerEvent) {}

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.clearPreview();
    } else if (event.key === "Enter") {
      if (this.positions.length >= 2) {
        this.commitRailing();
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private commitRailing() {
    if (!this.typeId || this.positions.length < 2) return;

    const path = this.positions.map(
      (p) => [p.x, p.y, p.z] as [number, number, number]
    );
    const railing = createRailing(path, this.typeId);
    if (this.levelId) railing.levelId = this.levelId;

    this.clearPreview();
    this.doc.add(railing);
  }

  private addMarker(position: THREE.Vector3) {
    const geo = new THREE.SphereGeometry(0.08, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x44cc88, depthTest: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.renderOrder = 10;
    this.scene.add(mesh);
    this.markers.push(mesh);
  }

  private updatePreviewLine(cursorPos: THREE.Vector3) {
    // Remove old line
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine = null;
    }

    // Build polyline: all clicked positions + cursor (open, no closing)
    const linePoints: THREE.Vector3[] = [];
    for (const p of this.positions) {
      linePoints.push(new THREE.Vector3(p.x, p.y + 0.01, p.z));
    }
    linePoints.push(new THREE.Vector3(cursorPos.x, cursorPos.y + 0.01, cursorPos.z));

    if (linePoints.length < 2) return;

    const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const mat = new THREE.LineBasicMaterial({ color: 0x44cc88, depthTest: false });
    this.previewLine = new THREE.Line(geo, mat);
    this.previewLine.renderOrder = 10;
    this.scene.add(this.previewLine);
  }

  private clearPreview() {
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine = null;
    }
    for (const m of this.markers) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.markers = [];
    this.positions = [];
  }
}
