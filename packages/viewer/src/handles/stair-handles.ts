import * as THREE from "three";
import type { BimDocument } from "../core/document";
import type { AnyContract, ContractId } from "../core/contracts";
import type { ToolManager } from "../tools/tool-manager";
import { HandleMesh } from "./base";
import { snapPoint, SnapIndicator, recordStickySnap } from "../utils/snap";
import type { StairContract } from "../elements/stair";
import type { ElementHandles } from "../core/registry";

export type StairDragTarget = "start" | "end" | null;

export class StairHandles implements ElementHandles {
  contract: StairContract;
  activeTarget: StairDragTarget = null;
  snapExcludeIds: ContractId[] = [];

  private startHandle: HandleMesh;
  private endHandle: HandleMesh;
  private snapIndicator: SnapIndicator;
  private doc: BimDocument;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, doc: BimDocument, contract: StairContract) {
    this.scene = scene;
    this.doc = doc;
    this.contract = contract;

    const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);

    const s = new THREE.Vector3(...contract.start);
    const e = new THREE.Vector3(...contract.end);

    this.startHandle = new HandleMesh(sphereGeo, 0x44ff44, s);
    this.endHandle = new HandleMesh(sphereGeo.clone(), 0x44ff44, e);
    this.snapIndicator = new SnapIndicator(scene);

    scene.add(this.startHandle.mesh);
    scene.add(this.endHandle.mesh);
  }

  checkHit(
    event: PointerEvent,
    toolMgr: ToolManager,
    _camera: THREE.PerspectiveCamera
  ): boolean {
    const hits = toolMgr.raycastObjects(event, [
      this.startHandle.mesh,
      this.endHandle.mesh,
    ]);
    if (hits.length === 0) return false;

    const hitObj = hits[0].object;
    if (hitObj === this.startHandle.mesh) {
      this.activeTarget = "start";
      this.startHandle.mesh.visible = false;
    } else if (hitObj === this.endHandle.mesh) {
      this.activeTarget = "end";
      this.endHandle.mesh.visible = false;
    } else {
      return false;
    }
    return true;
  }

  onDrag(groundPoint: THREE.Vector3) {
    if (!this.activeTarget) return;

    const anchor =
      this.activeTarget === "start"
        ? new THREE.Vector3(...this.contract.end)
        : new THREE.Vector3(...this.contract.start);

    const result = snapPoint(groundPoint, this.doc, {
      excludeIds: [this.contract.id, ...this.snapExcludeIds],
      anchor,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    const snapped = result.position;

    if (this.activeTarget === "start") {
      // Preserve Y — stair height is defined by the Y difference
      const pos = new THREE.Vector3(snapped.x, this.contract.start[1], snapped.z);
      this.startHandle.setPosition(pos);
      this.contract = {
        ...this.contract,
        start: [pos.x, pos.y, pos.z],
      };
    } else {
      const pos = new THREE.Vector3(snapped.x, this.contract.end[1], snapped.z);
      this.endHandle.setPosition(pos);
      this.contract = {
        ...this.contract,
        end: [pos.x, pos.y, pos.z],
      };
    }

    this.doc.update(this.contract.id, this.contract);
  }

  onDragEnd() {
    if (!this.activeTarget) return;
    const handle =
      this.activeTarget === "start" ? this.startHandle : this.endHandle;
    handle.mesh.visible = true;
    this.activeTarget = null;
    this.snapIndicator.hide();
  }

  updateFromContract(contract: AnyContract) {
    this.contract = contract as StairContract;
    const s = new THREE.Vector3(...this.contract.start);
    const e = new THREE.Vector3(...this.contract.end);
    this.startHandle.setPosition(s);
    this.endHandle.setPosition(e);
  }

  dispose() {
    this.scene.remove(this.startHandle.mesh);
    this.scene.remove(this.endHandle.mesh);
    this.startHandle.dispose();
    this.endHandle.dispose();
    this.snapIndicator.dispose();
  }
}
