import * as THREE from "three";
import type { GeometryEngine } from "@thatopen/fragments";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { ContractId } from "../core/contracts";
import type { BeamTypeContract } from "../elements/beam-type";
import { createBeam, resolveBeamParams } from "../elements/beam";
import { snapPoint, SnapIndicator, recordStickySnap, clearStickySnaps } from "../utils/snap";
import { PREVIEW_MATERIAL } from "../utils/material-resolve";
import { createBeamPreviewGeometry } from "../elements/beam";

export class BeamTool implements Tool {
  name = "beam";
  typeKind = "beamType";

  private scene: THREE.Scene;
  private doc: BimDocument;
  private engine: GeometryEngine;
  private toolMgr: ToolManager;

  private startPoint: THREE.Vector3 | null = null;
  private previewMesh: THREE.Mesh | null = null;
  private startMarker: THREE.Mesh | null = null;
  private snapIndicator: SnapIndicator;

  /** Active beam type ID — must be set before placing beams. */
  typeId: ContractId | null = null;
  levelId: ContractId | null = null;

  constructor(
    scene: THREE.Scene,
    doc: BimDocument,
    engine: GeometryEngine,
    toolMgr: ToolManager,
  ) {
    this.scene = scene;
    this.doc = doc;
    this.engine = engine;
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
      // First click — set start
      this.startPoint = snapped.clone();
      this.showStartMarker(snapped);
    } else {
      // Second click — commit beam
      if (this.startPoint.distanceTo(snapped) < 0.05) return;

      const start: [number, number, number] = [
        this.startPoint.x,
        this.startPoint.y,
        this.startPoint.z,
      ];
      const end: [number, number, number] = [snapped.x, snapped.y, snapped.z];

      const beam = createBeam(start, end, this.typeId);
      if (this.levelId) beam.levelId = this.levelId;

      this.clearPreview();
      this.doc.add(beam);

      // Chain from end point (like walls)
      this.startPoint = snapped.clone();
      this.showStartMarker(snapped);
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
    if (start.distanceTo(end) < 0.05) return;

    // Get type params
    const typeContract = this.typeId
      ? (this.doc.contracts.get(this.typeId) as BeamTypeContract | undefined)
      : undefined;
    const height = typeContract?.height ?? 0.3;
    const width = typeContract?.width ?? 0.2;
    const profileType = typeContract?.profileType ?? "rectangle";

    // Generate preview with correct profile orientation
    const geo = createBeamPreviewGeometry(
      this.engine,
      [start.x, start.y, start.z],
      [end.x, end.y, end.z],
      profileType,
      width,
      height,
    );

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
