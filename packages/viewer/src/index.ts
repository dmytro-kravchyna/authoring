/**
 * @bim-ide/viewer — public API
 *
 * The viewer is a self-contained BIM authoring engine that can be
 * embedded in any container element.  The shell imports this module
 * and calls `createViewer(container)` to mount the 3D canvas.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TypedEvent } from "./core/events";
import type { GeometryEngine } from "@thatopen/fragments";
import { BimDocument } from "./core/document";
import { ElementRegistry, type ElementTypeDefinition } from "./core/registry";
import { UndoManager } from "./core/undo-manager";
import { getGeometryEngine } from "./generators/engine";
import { FragmentManager } from "./fragments/manager";
import { FragmentSync } from "./fragments/sync";
import { ToolManager, type Tool } from "./tools/tool-manager";
import { WallTool } from "./tools/wall-tool";
import { SelectTool } from "./tools/select-tool";
import { WindowTool } from "./tools/window-tool";
import { FloorTool } from "./tools/floor-tool";
import { ColumnTool } from "./tools/column-tool";
import { DoorTool } from "./tools/door-tool";
import { MoveTool } from "./tools/move-tool";
import { PasteTool } from "./tools/paste-tool";
import { wallElement } from "./elements/wall";
import { windowElement } from "./elements/window";
import { floorElement } from "./elements/floor";
import { columnElement } from "./elements/column";
import { doorElement } from "./elements/door";
import { wallTypeElement, createWallType } from "./elements/wall-type";
import { windowTypeElement, createWindowType } from "./elements/window-type";
import { columnTypeElement, createColumnType } from "./elements/column-type";
import { doorTypeElement, createDoorType } from "./elements/door-type";
import { levelElement, createLevel } from "./elements/level";
import { materialElement } from "./elements/material";
import { TypesTab } from "./ui/types-tab";
import { LevelsTab } from "./ui/levels-tab";
import { MaterialsTab } from "./ui/materials-tab";
import { PropertiesPanel } from "./ui/properties";
import { TempDimensionRenderer } from "./ui/temp-dimensions";
import { SpatialIndex } from "./utils/spatial-index";
import { SnapGroupManager, syncLevelSnapGroups } from "./utils/snap-groups";
import { ModelClipboard } from "./utils/clipboard";
import { GisLayer3d } from "./gis/gis-layer-3d";
import { TextureRenderer } from "./ai/texture-renderer";
import { TextureGenerator } from "./ai/texture-generator";

// ── Public types ──────────────────────────────────────────────────

export interface ToolDescriptor {
  tool: Tool;
  label: string;
  icon?: string;
  category: "create" | "edit" | "view";
}

export interface ViewerInstance {
  // Core objects
  doc: BimDocument;
  registry: ElementRegistry;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  toolMgr: ToolManager;
  undoMgr: UndoManager;
  fragMgr: FragmentManager;
  sync: FragmentSync;
  engine: GeometryEngine;
  selectTool: SelectTool;
  allTools: Tool[];
  clipboard: ModelClipboard;
  gisLayer: GisLayer3d;
  textureRenderer: TextureRenderer;
  textureGenerator: TextureGenerator;

  // UI panels (render into shell-provided containers)
  typesTab: TypesTab;
  levelsTab: LevelsTab;
  materialsTab: MaterialsTab;
  propsPanel: PropertiesPanel;

  // Extension points
  registerElement(def: ElementTypeDefinition): void;
  registerTool(tool: Tool, label: string, category?: "create" | "edit"): void;
  unregisterTool(tool: Tool): void;
  getToolDescriptors(): ToolDescriptor[];
  onToolsChanged: TypedEvent<void>;

  // Status
  setStatus(msg: string): void;
  onStatusChanged: ((msg: string) => void) | null;

  // Selection event (for shell to wire properties panel)
  onSelectionChanged: ((contract: any | null) => void) | null;

  // Lifecycle
  dispose(): void;
  resize(): void;
  save(): Promise<Blob>;
  load(file: File): Promise<void>;
}

// ── Factory ───────────────────────────────────────────────────────

export async function createViewer(container: HTMLElement): Promise<ViewerInstance> {
  // --- Three.js Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(15, 12, 15);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Grid + axes
  const grid = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
  scene.add(grid);
  scene.add(new THREE.AxesHelper(2));

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  // Resize
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  requestAnimationFrame(resize);

  // --- Status ---
  let statusMsg = "Initializing...";
  let onStatusChanged: ((msg: string) => void) | null = null;
  const setStatus = (msg: string) => {
    statusMsg = msg;
    onStatusChanged?.(msg);
  };

  // --- Geometry Engine ---
  setStatus("Loading geometry engine (WASM)...");
  const engine = await getGeometryEngine();
  setStatus("Geometry engine ready.");

  // --- Fragments ---
  setStatus("Initializing fragments...");
  const fragMgr = await FragmentManager.create(scene, camera);
  setStatus("Fragments ready.");

  // --- Registry ---
  const registry = new ElementRegistry();
  registry.register(wallElement);
  registry.register(wallTypeElement);
  registry.register(windowElement);
  registry.register(windowTypeElement);
  registry.register(floorElement);
  registry.register(columnElement);
  registry.register(columnTypeElement);
  registry.register(doorElement);
  registry.register(doorTypeElement);
  registry.register(levelElement);
  registry.register(materialElement);

  // --- Document + Sync ---
  const doc = new BimDocument();
  doc.registry = registry;

  const spatialIndex = new SpatialIndex(doc);
  spatialIndex.connect();
  doc.spatialIndex = spatialIndex;
  doc.setCascadeResolver((id, d) => registry.resolveCascadeDelete(id, d));

  const sync = new FragmentSync(doc, fragMgr, engine, scene, registry);
  await sync.init();

  // --- Temporary Dimensions ---
  const tempDims = new TempDimensionRenderer(container, camera, renderer.domElement, doc, scene);

  // --- Default types ---
  const defaultWallType = createWallType({ height: 3.0, thickness: 0.2 });
  const defaultWindowType = createWindowType({ width: 1.2, height: 1.0, sillHeight: 1.0 });
  const defaultColumnType = createColumnType({ height: 3.0, width: 0.3 });
  const defaultDoorType = createDoorType({ width: 0.9, height: 2.1 });
  doc.add(defaultWallType);
  doc.add(defaultWindowType);
  doc.add(defaultColumnType);
  doc.add(defaultDoorType);

  // --- Default levels ---
  doc.add(createLevel("Level 0", 0));
  doc.add(createLevel("Level 1", 3));

  // --- Tools ---
  const toolMgr = new ToolManager(container, camera, scene);
  const wallTool = new WallTool(scene, doc, engine, toolMgr, sync, tempDims);
  wallTool.typeId = defaultWallType.id;
  const windowTool = new WindowTool(scene, doc, engine, camera, renderer.domElement, fragMgr, toolMgr);
  windowTool.typeId = defaultWindowType.id;
  const floorTool = new FloorTool(scene, doc, engine, toolMgr, sync);
  const columnTool = new ColumnTool(doc, scene, toolMgr);
  columnTool.typeId = defaultColumnType.id;
  const doorTool = new DoorTool(scene, doc, engine, camera, renderer.domElement, fragMgr, toolMgr);
  doorTool.typeId = defaultDoorType.id;
  const selectTool = new SelectTool(scene, camera, renderer.domElement, doc, fragMgr, toolMgr, controls, engine, sync, registry);
  const moveTool = new MoveTool(scene, doc, toolMgr, sync, registry, selectTool, controls);

  // Hide temp dimensions during drags
  moveTool.onDragStateChanged = (dragging) => {
    if (dragging) {
      tempDims.onSelectionChanged([]);
    } else {
      const sel = selectTool.getSelectedContractsAll();
      if (sel.length > 0) tempDims.onSelectionChanged(sel);
    }
  };
  selectTool.onDragStateChanged = (dragging) => {
    if (dragging) {
      tempDims.onSelectionChanged([]);
    } else {
      const sel = selectTool.getSelectedContractsAll();
      if (sel.length > 0) tempDims.onSelectionChanged(sel);
    }
  };

  // Clipboard & Paste
  const clipboard = new ModelClipboard();
  const pasteTool = new PasteTool(scene, doc, toolMgr, sync, registry, selectTool, clipboard);

  const allTools: Tool[] = [wallTool, windowTool, doorTool, floorTool, columnTool, selectTool, moveTool, pasteTool];

  // --- Tool descriptors ---
  const onToolsChanged = new TypedEvent<void>();
  const toolDescriptors: ToolDescriptor[] = [
    { tool: wallTool, label: "Wall", category: "create" },
    { tool: windowTool, label: "Window", category: "create" },
    { tool: doorTool, label: "Door", category: "create" },
    { tool: floorTool, label: "Floor", category: "create" },
    { tool: columnTool, label: "Column", category: "create" },
    { tool: selectTool, label: "Select", category: "edit" },
    { tool: moveTool, label: "Move", category: "edit" },
  ];

  // --- UI Panels ---
  const typesTab = new TypesTab(doc, registry);
  const propsPanel = new PropertiesPanel(doc, registry);
  const levelsTab = new LevelsTab(doc);
  const materialsTab = new MaterialsTab(doc, registry);

  // Wire type selection → tools
  typesTab.onBeforeTypeEdit = () => selectTool.clearSelection();
  typesTab.onSelectionChanged = (sel) => {
    for (const tool of allTools) {
      if (tool.typeKind) {
        tool.typeId = sel.get(tool.typeKind) ?? null;
      }
    }
  };

  // --- Snap Groups ---
  const snapGroupMgr = new SnapGroupManager();
  toolMgr.snapGroupManager = snapGroupMgr;
  levelsTab.snapGroupManager = snapGroupMgr;
  levelsTab.onLevelChanged = (levelId, elevation) => {
    toolMgr.setActiveLevel(levelId, elevation);
    for (const tool of allTools) {
      tool.levelId = levelId;
    }
    grid.position.y = elevation;
    syncLevelSnapGroups(doc, snapGroupMgr, levelId);
    levelsTab.refresh();
  };

  doc.onAdded.add(() => syncLevelSnapGroups(doc, snapGroupMgr, toolMgr.activeLevelId, false));
  doc.onRemoved.add(() => syncLevelSnapGroups(doc, snapGroupMgr, toolMgr.activeLevelId, false));

  materialsTab.onBeforeEdit = () => selectTool.clearSelection();

  // Auto-select defaults
  typesTab.autoSelect();
  levelsTab.autoSelect();
  syncLevelSnapGroups(doc, snapGroupMgr, toolMgr.activeLevelId);

  // --- Undo/Redo ---
  const undoMgr = new UndoManager(doc, sync);
  doc.onTransactionCommit.add((record) => undoMgr.recordTransaction(record));
  undoMgr.onBeforeUndoRedo = () => selectTool.clearSelection();

  // Global keyboard shortcuts
  const keyHandler = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undoMgr.undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      undoMgr.redo();
    } else if (e.key === "c") {
      e.preventDefault();
      const selected = selectTool.getSelectedContractsAll();
      if (selected.length > 0) clipboard.copy(selected, doc, registry);
    } else if (e.key === "v") {
      e.preventDefault();
      if (clipboard.hasContent) toolMgr.setTool(pasteTool);
    }
  };
  window.addEventListener("keydown", keyHandler);

  // --- Selection → shell event ---
  let userOnSelectionChanged: ((contract: any | null) => void) | null = null;

  selectTool.onSelectionChanged = (contract) => {
    if (contract) {
      tempDims.onSelectionChanged([contract]);
    } else {
      tempDims.onSelectionChanged([]);
      undoMgr.finalizeSelectionRecord();
    }
    userOnSelectionChanged?.(contract);
  };

  // Update properties and temp dimensions on contract changes
  doc.onUpdated.add(({ contract }) => {
    if (sync.isDragging) return;
    tempDims.onContractUpdated(contract);
  });

  // --- Render Loop ---
  let animating = true;
  function animate() {
    if (!animating) return;
    requestAnimationFrame(animate);
    controls.update();
    fragMgr.fragments.update();
    renderer.render(scene, camera);
  }
  animate();

  // --- GIS Layer ---
  const gisLayer = new GisLayer3d(scene, camera, renderer);

  // --- Texture Renderer ---
  const textureRenderer = new TextureRenderer(renderer, scene, camera, container);
  const textureGenerator = new TextureGenerator();

  // Default to select tool so click-to-select works immediately
  toolMgr.setTool(selectTool);

  setStatus("Ready. Select a tool to begin.");

  // --- Save ---
  async function save(): Promise<Blob> {
    selectTool.clearSelection();
    undoMgr.finalizePendingGroup();
    await undoMgr.awaitRecording();
    await sync.flush();
    await fragMgr.editor.save(fragMgr.modelId);
    await new Promise((r) => setTimeout(r, 500));
    await fragMgr.update(true);

    const buffer = await fragMgr.getBuffer();
    const docData = doc.toJSON((kind) => registry.getVersion(kind));

    let binary = "";
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const fragBuffer = btoa(binary);

    const bimFile = JSON.stringify({
      version: 1,
      contracts: docData.contracts,
      fragmentIds: docData.fragmentIds,
      typeReprIds: docData.typeReprIds,
      fragBuffer,
    });
    return new Blob([bimFile], { type: "application/json" });
  }

  // --- Load ---
  async function load(file: File): Promise<void> {
    setStatus("Loading...");
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.version !== 1) throw new Error(`Unsupported .bim version: ${data.version}`);

    selectTool.clearSelection();
    await undoMgr.awaitRecording();
    await sync.flush();
    undoMgr.reset();
    sync.reset();
    await fragMgr.disposeModel(scene);

    const bin = atob(data.fragBuffer);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    await fragMgr.loadModel(buf, scene, camera);

    doc.loadFromJSON(
      { contracts: data.contracts, fragmentIds: data.fragmentIds, typeReprIds: data.typeReprIds },
      (contracts) => registry.migrateAll(contracts)
    );

    spatialIndex.rebuild();
    sync.rebuildDependentsIndex();
    if (!data.typeReprIds) sync.rebuildTypeReprIds();

    typesTab.autoSelect();
    levelsTab.autoSelect();
    syncLevelSnapGroups(doc, snapGroupMgr, toolMgr.activeLevelId);
    const sel = typesTab.getSelection();
    for (const tool of allTools) {
      if (tool.typeKind) tool.typeId = sel.get(tool.typeKind) ?? null;
    }

    setStatus("Loaded successfully.");
  }

  // --- Dispose ---
  function dispose() {
    animating = false;
    resizeObserver.disconnect();
    window.removeEventListener("keydown", keyHandler);
    renderer.dispose();
  }

  // --- Build instance ---
  const instance: ViewerInstance = {
    doc,
    registry,
    scene,
    camera,
    renderer,
    controls,
    toolMgr,
    undoMgr,
    fragMgr,
    sync,
    engine,
    selectTool,
    allTools,
    clipboard,
    gisLayer,
    textureRenderer,
    textureGenerator,
    typesTab,
    levelsTab,
    materialsTab,
    propsPanel,
    setStatus,
    get onStatusChanged() { return onStatusChanged; },
    set onStatusChanged(cb) { onStatusChanged = cb; },
    get onSelectionChanged() { return userOnSelectionChanged; },
    set onSelectionChanged(cb) { userOnSelectionChanged = cb; },
    registerElement(def: ElementTypeDefinition) {
      registry.register(def);
    },
    registerTool(tool: Tool, label: string, category: "create" | "edit" = "create") {
      allTools.push(tool);
      toolDescriptors.push({ tool, label, category });
      onToolsChanged.trigger();
    },
    unregisterTool(tool: Tool) {
      const toolIdx = allTools.indexOf(tool);
      if (toolIdx !== -1) allTools.splice(toolIdx, 1);
      const descIdx = toolDescriptors.findIndex(d => d.tool === tool);
      if (descIdx !== -1) toolDescriptors.splice(descIdx, 1);
      if (toolMgr.getActiveTool() === tool) {
        toolMgr.setTool(null);
      }
      onToolsChanged.trigger();
    },
    getToolDescriptors() {
      return [...toolDescriptors];
    },
    onToolsChanged,
    dispose,
    resize,
    save,
    load,
  };

  // Expose for debugging
  (window as any).__bim = instance;

  return instance;
}

// Re-export key types for extension SDK
export { BimDocument } from "./core/document";
export { ElementRegistry } from "./core/registry";
export type { ElementTypeDefinition, ElementRelationship, RelationshipBehavior } from "./core/registry";
export type { AnyContract, ContractId } from "./core/contracts";
export type { Tool } from "./tools/tool-manager";
export { ToolManager } from "./tools/tool-manager";
export { AiChatTab } from "./ai/chat-tab";
export type { ToolRegistrationHost } from "./ai/chat-tab";
export { TypesTab } from "./ui/types-tab";
export { LevelsTab } from "./ui/levels-tab";
export { MaterialsTab } from "./ui/materials-tab";
export { PropertiesPanel } from "./ui/properties";

// AI / GIS
export { TextureRenderer } from "./ai/texture-renderer";
export { TextureGenerator } from "./ai/texture-generator";
export { GisLayer3d } from "./gis/gis-layer-3d";
export { interceptAndAugment, classifyIntent, augmentPrompt } from "./ai/prompt-interceptor";
export type { ContributionIntent, InterceptionResult } from "./ai/prompt-interceptor";
export type { ToolDescriptorMeta, CommandDescriptorMeta } from "./ai/session-tracker";
export type { SelectionAPI } from "./ai/executor";

// Factory functions for creating default type contracts
export { createColumnType } from "./elements/column-type";
export { createWallType } from "./elements/wall-type";
export { createWindowType } from "./elements/window-type";
export { createDoorType } from "./elements/door-type";
