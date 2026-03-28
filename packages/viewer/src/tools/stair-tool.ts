import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { ContractId } from "../core/contracts";
import type { StairTypeContract } from "../elements/stair-type";
import { createStair } from "../elements/stair";
import { snapPoint, SnapIndicator, recordStickySnap, clearStickySnaps } from "../utils/snap";
import { PREVIEW_MATERIAL } from "../utils/material-resolve";

export class StairTool implements Tool {
  name = "stair";
  typeKind = "stairType";

  private scene: THREE.Scene;
  private doc: BimDocument;
  private toolMgr: ToolManager;

  private startPoint: THREE.Vector3 | null = null;
  private previewMesh: THREE.Mesh | null = null;
  private startMarker: THREE.Mesh | null = null;
  private snapIndicator: SnapIndicator;

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
    this.startPoint = null;
    clearStickySnaps();
  }

  onPointerDown(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (event.button !== 0 || !intersection || !this.typeId) return;

    const result = snapPoint(intersection, this.doc, {
      anchor: this.startPoint ?? undefined,
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    const snapped = result.position;

    if (!this.startPoint) {
      this.startPoint = snapped.clone();
      this.showStartMarker(snapped);
    } else {
      if (this.startPoint.distanceTo(snapped) < 0.1) return;

      const start: [number, number, number] = [this.startPoint.x, this.startPoint.y, this.startPoint.z];
      const end: [number, number, number] = [snapped.x, snapped.y, snapped.z];

      // If start and end are at the same Y, assume one level height (3m)
      if (Math.abs(end[1] - start[1]) < 0.01) {
        end[1] = start[1] + 3.0;
      }

      const stair = createStair(start, end, this.typeId);
      if (this.levelId) stair.levelId = this.levelId;

      this.clearPreview();
      this.doc.add(stair);
      this.startPoint = null;
    }
  }

  onPointerMove(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (!intersection) {
      this.snapIndicator.hide();
      this.toolMgr.hideCursor();
      return;
    }

    const result = snapPoint(intersection, this.doc, {
      anchor: this.startPoint ?? undefined,
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    this.toolMgr.setCursorPosition(result.position);

    if (!this.startPoint) return;
    this.updatePreview(this.startPoint, result.position);
  }

  onPointerUp(_event: PointerEvent) {}

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.clearPreview();
      this.startPoint = null;
    }
  }

  private updatePreview(start: THREE.Vector3, end: THREE.Vector3) {
    const dist = start.distanceTo(end);
    if (dist < 0.1) return;

    // Get type params for preview sizing
    const typeContract = this.typeId
      ? (this.doc.contracts.get(this.typeId) as StairTypeContract | undefined)
      : undefined;
    const width = typeContract?.width ?? 1.2;
    const riserHeight = typeContract?.riserHeight ?? 0.17;
    const treadDepth = typeContract?.treadDepth ?? 0.28;

    // Compute preview bounding box
    let totalRise = end.y - start.y;
    if (Math.abs(totalRise) < 0.01) totalRise = 3.0;
    const numRisers = Math.max(1, Math.round(Math.abs(totalRise) / riserHeight));
    const totalRun = numRisers * treadDepth;

    // Direction from start to end in XZ
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const xzLen = Math.sqrt(dx * dx + dz * dz);
    const dirX = xzLen > 0.001 ? dx / xzLen : 1;
    const dirZ = xzLen > 0.001 ? dz / xzLen : 0;

    // Preview as angled box (simplified stair silhouette)
    const midX = start.x + dirX * totalRun / 2;
    const midZ = start.z + dirZ * totalRun / 2;
    const midY = start.y + totalRise / 2;

    const geo = new THREE.BoxGeometry(totalRun, Math.abs(totalRise), width);
    // Rotate to align with direction
    const angle = -Math.atan2(dirZ, dirX);
    geo.rotateY(angle);
    geo.translate(midX, midY, midZ);

    if (this.previewMesh) {
      this.previewMesh.geometry.dispose();
      this.previewMesh.geometry = geo;
    } else {
      this.previewMesh = new THREE.Mesh(geo, PREVIEW_MATERIAL);
      this.previewMesh.renderOrder = 5;
      this.scene.add(this.previewMesh);
    }
  }

  private showStartMarker(position: THREE.Vector3) {
    if (!this.startMarker) {
      const geo = new THREE.SphereGeometry(0.08, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
      this.startMarker = new THREE.Mesh(geo, mat);
      this.scene.add(this.startMarker);
    }
    this.startMarker.position.copy(position);
    this.startMarker.visible = true;
  }

  private clearPreview() {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      this.previewMesh = null;
    }
    if (this.startMarker) {
      this.startMarker.visible = false;
    }
  }
}
