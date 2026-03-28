import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { BimDocument } from "../core/document";
import type { ContractId } from "../core/contracts";
import type { FurnitureTypeContract } from "../elements/furniture-type";
import { createFurniture } from "../elements/furniture";
import { generateFurniture } from "../generators/furniture";
import { snapPoint, SnapIndicator, recordStickySnap } from "../utils/snap";
import { PREVIEW_MATERIAL } from "../utils/material-resolve";

export class FurnitureTool implements Tool {
  name = "furniture";
  typeKind = "furnitureType";
  private doc: BimDocument;
  private scene: THREE.Scene;
  private toolMgr: ToolManager;
  private snapIndicator: SnapIndicator;
  private preview: THREE.Mesh | null = null;

  typeId: ContractId | null = null;
  levelId: ContractId | null = null;

  constructor(doc: BimDocument, scene: THREE.Scene, toolMgr: ToolManager) {
    this.doc = doc;
    this.scene = scene;
    this.toolMgr = toolMgr;
    this.snapIndicator = new SnapIndicator(scene);
  }

  activate() {
    document.body.style.cursor = "crosshair";
  }

  deactivate() {
    document.body.style.cursor = "default";
    this.snapIndicator.hide();
    this.clearPreview();
  }

  onPointerDown(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (event.button !== 0 || !intersection || !this.typeId) return;

    const result = snapPoint(intersection, this.doc, {
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    const pos = result.position;

    const furniture = createFurniture([pos.x, pos.y, pos.z], this.typeId);
    if (this.levelId) furniture.levelId = this.levelId;

    this.clearPreview();
    this.doc.add(furniture);
  }

  onPointerMove(_event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (!intersection) {
      this.snapIndicator.hide();
      this.toolMgr.hideCursor();
      this.clearPreview();
      return;
    }

    const result = snapPoint(intersection, this.doc, {
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    this.toolMgr.setCursorPosition(result.position);
    this.updatePreview(result.position);
  }

  onPointerUp() {}
  onKeyDown() {}

  private updatePreview(pos: THREE.Vector3) {
    const typeContract = this.typeId
      ? (this.doc.contracts.get(this.typeId) as FurnitureTypeContract | undefined)
      : undefined;
    const generator = typeContract?.generator ?? "desk";
    const width = typeContract?.width ?? 1.2;
    const depth = typeContract?.depth ?? 0.6;
    const height = typeContract?.height ?? 0.75;

    const geo = generateFurniture(generator, width, depth, height);
    geo.translate(pos.x, pos.y, pos.z);

    if (this.preview) {
      this.preview.geometry.dispose();
      this.preview.geometry = geo;
    } else {
      this.preview = new THREE.Mesh(geo, PREVIEW_MATERIAL);
      this.preview.renderOrder = 5;
      this.scene.add(this.preview);
    }
  }

  private clearPreview() {
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
  }
}
