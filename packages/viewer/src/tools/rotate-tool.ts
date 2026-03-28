import * as THREE from "three";
import type { Tool, ToolManager } from "./tool-manager";
import type { SelectTool } from "./select-tool";
import type { BimDocument } from "../core/document";
import type { AnyContract, ContractId } from "../core/contracts";
import type { ElementRegistry } from "../core/registry";
import type { FragmentSync } from "../fragments/sync";
import { snapPoint, SnapIndicator, recordStickySnap } from "../utils/snap";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type RotateState = "idle" | "pickPivot" | "pickReference" | "rotating";

export class RotateTool implements Tool {
  name = "rotate";

  typeId: ContractId | null = null;
  levelId: ContractId | null = null;

  private scene: THREE.Scene;
  private doc: BimDocument;
  private toolMgr: ToolManager;
  private sync: FragmentSync;
  private registry: ElementRegistry;
  private selectTool: SelectTool;
  private controls: OrbitControls;

  private state: RotateState = "idle";
  private selectedIds: ContractId[] = [];
  private originalContracts = new Map<ContractId, AnyContract>();
  private snapIndicator: SnapIndicator;

  private pivotPoint: THREE.Vector3 | null = null;
  private referencePoint: THREE.Vector3 | null = null;
  private referenceAngle = 0; // angle of reference direction in XZ

  // Visual feedback
  private pivotMarker: THREE.Mesh | null = null;
  private refLine: THREE.Line;
  private refLineGeo: THREE.BufferGeometry;
  private angleLine: THREE.Line;
  private angleLineGeo: THREE.BufferGeometry;

  // RAF throttle
  private pendingIntersection: THREE.Vector3 | null = null;
  private pendingShiftKey = false;
  private rafId: number | null = null;

  /** Called when drag begins (true) or ends (false). */
  onDragStateChanged: ((dragging: boolean) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    doc: BimDocument,
    toolMgr: ToolManager,
    sync: FragmentSync,
    registry: ElementRegistry,
    selectTool: SelectTool,
    controls: OrbitControls
  ) {
    this.scene = scene;
    this.doc = doc;
    this.toolMgr = toolMgr;
    this.sync = sync;
    this.registry = registry;
    this.selectTool = selectTool;
    this.controls = controls;
    this.snapIndicator = new SnapIndicator(scene);

    // Reference line (dashed blue)
    this.refLineGeo = new THREE.BufferGeometry();
    this.refLineGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const refMat = new THREE.LineDashedMaterial({ color: 0x4488ff, dashSize: 0.1, gapSize: 0.05, depthTest: false });
    this.refLine = new THREE.Line(this.refLineGeo, refMat);
    this.refLine.renderOrder = 999;
    this.refLine.visible = false;
    scene.add(this.refLine);

    // Angle line (dashed orange)
    this.angleLineGeo = new THREE.BufferGeometry();
    this.angleLineGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const angleMat = new THREE.LineDashedMaterial({ color: 0xff8844, dashSize: 0.1, gapSize: 0.05, depthTest: false });
    this.angleLine = new THREE.Line(this.angleLineGeo, angleMat);
    this.angleLine.renderOrder = 999;
    this.angleLine.visible = false;
    scene.add(this.angleLine);
  }

  activate() {
    const selected = this.selectTool.getSelectedContractsAll();
    if (selected.length === 0) {
      this.toolMgr.setTool(this.selectTool);
      return;
    }

    document.body.style.cursor = "crosshair";
    this.state = "pickPivot";
    this.selectedIds = selected.map((c) => c.id);

    // Snapshot original contracts
    this.originalContracts.clear();
    for (const c of selected) {
      this.originalContracts.set(c.id, { ...c });
    }

    // Start drag mode for all selected elements
    this.doc.transactionGroupId = "rotate-" + Date.now();
    for (const id of this.selectedIds) {
      this.sync.startDrag(id, true);
    }

    this.onDragStateChanged?.(true);
  }

  deactivate() {
    document.body.style.cursor = "default";
    this.snapIndicator.hide();
    this.refLine.visible = false;
    this.angleLine.visible = false;

    if (this.state !== "idle") {
      this.cancelInternal(false);
    }
    this.state = "idle";
  }

  onPointerDown(event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (event.button !== 0 || !intersection) return;

    const result = snapPoint(intersection, this.doc, {
      anchor: this.pivotPoint ?? undefined,
      shiftKey: event.shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    const snapped = result.position;

    if (this.state === "pickPivot") {
      this.pivotPoint = snapped.clone();
      this.showPivotMarker(snapped);
      this.state = "pickReference";
    } else if (this.state === "pickReference") {
      if (!this.pivotPoint) return;
      this.referencePoint = snapped.clone();
      this.referenceAngle = Math.atan2(
        snapped.z - this.pivotPoint.z,
        snapped.x - this.pivotPoint.x
      );
      this.updateRefLine(this.pivotPoint, snapped);
      this.state = "rotating";
    } else if (this.state === "rotating") {
      this.commit();
    }
  }

  onPointerMove(_event: PointerEvent, intersection: THREE.Vector3 | null) {
    if (!intersection) {
      this.snapIndicator.hide();
      this.toolMgr.hideCursor();
      return;
    }

    this.pendingIntersection = intersection.clone();
    this.pendingShiftKey = _event.shiftKey;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.processFrame();
      });
    }
  }

  onPointerUp(_event: PointerEvent) {}

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.cancelInternal(true);
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private processFrame() {
    if (!this.pendingIntersection) return;
    const intersection = this.pendingIntersection;
    const shiftKey = this.pendingShiftKey;
    this.pendingIntersection = null;

    const result = snapPoint(intersection, this.doc, {
      anchor: this.pivotPoint ?? undefined,
      shiftKey,
      elevation: this.toolMgr.workPlane.origin.y,
      snapGroupManager: this.toolMgr.snapGroupManager ?? undefined,
    });
    recordStickySnap(result);
    this.snapIndicator.update(result);
    this.toolMgr.setCursorPosition(result.position);

    if (this.state === "rotating" && this.pivotPoint) {
      const snapped = result.position;
      let currentAngle = Math.atan2(
        snapped.z - this.pivotPoint.z,
        snapped.x - this.pivotPoint.x
      );
      let delta = currentAngle - this.referenceAngle;

      // Snap to 15° increments when shift held
      if (shiftKey) {
        const step = Math.PI / 12;
        delta = Math.round(delta / step) * step;
      }

      this.applyRotation(delta);
      this.updateAngleLine(this.pivotPoint, snapped);
    }
  }

  private applyRotation(angle: number) {
    const pivot = this.pivotPoint;
    if (!pivot) return;
    const pivotArr: [number, number, number] = [pivot.x, pivot.y, pivot.z];

    const groupId = this.doc.transactionGroupId ?? undefined;
    this.doc.transaction(() => {
      for (const id of this.selectedIds) {
        const original = this.originalContracts.get(id);
        if (!original) continue;
        const def = this.registry.get(original.kind);
        const rotated = def?.applyRotation?.(original, angle, pivotArr);
        if (rotated) {
          this.doc.update(id, rotated);
        }
      }
    }, groupId ? { groupId } : undefined);
  }

  private commit() {
    this.flushPendingRAF();
    this.doc.transactionGroupId = null;
    this.sync.endDragAll(this.selectedIds);
    this.onDragStateChanged?.(false);
    this.cleanup();
    this.toolMgr.setTool(this.selectTool);
  }

  private cancelInternal(switchTool: boolean) {
    this.cancelPendingRAF();

    // Revert all selected elements to original state
    for (const [id, original] of this.originalContracts) {
      this.doc.update(id, original);
    }

    this.doc.transactionGroupId = null;
    this.sync.endDragAll(this.selectedIds);
    this.onDragStateChanged?.(false);
    this.cleanup();
    if (switchTool) {
      this.toolMgr.setTool(this.selectTool);
    }
  }

  private flushPendingRAF() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.processFrame();
  }

  private cancelPendingRAF() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingIntersection = null;
  }

  private cleanup() {
    this.cancelPendingRAF();
    this.refLine.visible = false;
    this.angleLine.visible = false;
    this.snapIndicator.hide();
    this.hidePivotMarker();
    this.state = "idle";
    this.pivotPoint = null;
    this.referencePoint = null;
    this.referenceAngle = 0;
    this.originalContracts.clear();
    this.selectedIds = [];
  }

  // ── Visual feedback ────────────────────────────────────────────

  private showPivotMarker(pos: THREE.Vector3) {
    if (!this.pivotMarker) {
      const geo = new THREE.SphereGeometry(0.1, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false });
      this.pivotMarker = new THREE.Mesh(geo, mat);
      this.pivotMarker.renderOrder = 999;
      this.scene.add(this.pivotMarker);
    }
    this.pivotMarker.position.copy(pos);
    this.pivotMarker.visible = true;
  }

  private hidePivotMarker() {
    if (this.pivotMarker) {
      this.pivotMarker.visible = false;
    }
  }

  private updateRefLine(from: THREE.Vector3, to: THREE.Vector3) {
    const positions = this.refLineGeo.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y + 0.01, from.z);
    positions.setXYZ(1, to.x, to.y + 0.01, to.z);
    positions.needsUpdate = true;
    this.refLineGeo.computeBoundingSphere();
    this.refLine.computeLineDistances();
    this.refLine.visible = true;
  }

  private updateAngleLine(from: THREE.Vector3, to: THREE.Vector3) {
    const positions = this.angleLineGeo.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y + 0.01, from.z);
    positions.setXYZ(1, to.x, to.y + 0.01, to.z);
    positions.needsUpdate = true;
    this.angleLineGeo.computeBoundingSphere();
    this.angleLine.computeLineDistances();
    this.angleLine.visible = true;
  }
}
