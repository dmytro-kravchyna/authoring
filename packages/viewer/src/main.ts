/**
 * Standalone entry point for the viewer.
 * When run directly (npm run dev from packages/viewer), this creates
 * the viewer in a full-page layout with toolbar and side panel.
 */
import { createViewer } from "./index";
import { SidePanel } from "./ui/side-panel";
import { createToolbar } from "./ui/toolbar";
import { createSnapPanel } from "./ui/snap-panel";

async function main() {
  const container = document.getElementById("canvas-container")!;
  const viewer = await createViewer(container);

  // --- Status bar ---
  const statusBar = document.createElement("div");
  statusBar.id = "status-bar";
  document.body.appendChild(statusBar);
  viewer.onStatusChanged = (msg) => { statusBar.textContent = msg; };
  statusBar.textContent = "Ready. Select a tool to begin.";

  // --- Side panel ---
  const sidePanel = new SidePanel();
  sidePanel.addTab("levels", "Levels", () => {
    viewer.levelsTab.render(sidePanel.content);
  });
  sidePanel.addTab("types", "Types", () => {
    viewer.typesTab.render(sidePanel.content);
  });
  sidePanel.addTab("materials", "Materials", () => {
    viewer.materialsTab.render(sidePanel.content);
  });
  sidePanel.addTab("properties", "Properties", () => {
    const selected = viewer.selectTool.getSelectedContract();
    if (selected) {
      viewer.propsPanel.show(selected, sidePanel.content);
    } else {
      viewer.propsPanel.showEmpty(sidePanel.content);
    }
  });

  // Wire selection → properties tab
  viewer.onSelectionChanged = (contract) => {
    if (contract) {
      sidePanel.switchTab("properties");
      viewer.propsPanel.show(contract, sidePanel.content);
    } else if (sidePanel.currentTab === "properties") {
      viewer.propsPanel.showEmpty(sidePanel.content);
    }
  };

  // Update properties panel on contract changes
  viewer.doc.onUpdated.add(({ contract }) => {
    if (viewer.sync.isDragging) return;
    if (
      viewer.selectTool.getSelectedContract()?.id === contract.id &&
      sidePanel.currentTab === "properties"
    ) {
      viewer.propsPanel.show(contract, sidePanel.content);
    }
    if (viewer.registry.isDataOnly(contract.kind) && sidePanel.currentTab === "types") {
      viewer.typesTab.refresh();
    }
  });

  // --- Toolbar ---
  createToolbar(
    viewer.toolMgr,
    viewer.getToolDescriptors().map((d) => ({ tool: d.tool, label: d.label }))
  );
  createSnapPanel();

  // --- Undo/Redo buttons ---
  const toolbar = document.getElementById("toolbar")!;

  const undoBtn = document.createElement("button");
  undoBtn.textContent = "Undo";
  undoBtn.disabled = true;
  undoBtn.addEventListener("click", () => viewer.undoMgr.undo());
  toolbar.appendChild(undoBtn);

  const redoBtn = document.createElement("button");
  redoBtn.textContent = "Redo";
  redoBtn.disabled = true;
  redoBtn.addEventListener("click", () => viewer.undoMgr.redo());
  toolbar.appendChild(redoBtn);

  viewer.undoMgr.onStateChanged.add(() => {
    undoBtn.disabled = !viewer.undoMgr.canUndo;
    redoBtn.disabled = !viewer.undoMgr.canRedo;
  });

  // --- Save button ---
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    statusBar.textContent = "Saving...";
    try {
      const blob = await viewer.save();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project.bim";
      a.click();
      URL.revokeObjectURL(url);
      statusBar.textContent = "Saved successfully.";
    } catch (e) {
      console.error("Save failed:", e);
      statusBar.textContent = "Save failed. See console.";
    }
  });
  toolbar.appendChild(saveBtn);

  // --- Load button ---
  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bim";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await viewer.load(file);
        if (sidePanel.currentTab === "types") viewer.typesTab.refresh();
        if (sidePanel.currentTab === "levels") viewer.levelsTab.refresh();
      } catch (e) {
        console.error("Load failed:", e);
        statusBar.textContent = "Load failed. See console.";
      }
    });
    input.click();
  });
  toolbar.appendChild(loadBtn);
}

main().catch(console.error);
