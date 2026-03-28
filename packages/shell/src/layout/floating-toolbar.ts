import type { ToolDescriptor, ViewerInstance } from "@bim-ide/viewer";

export class FloatingToolbar {
  readonly element: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(viewer: ViewerInstance) {
    this.element = document.createElement("div");
    this.element.className = "floating-toolbar";

    const descriptors = viewer.getToolDescriptors();
    const createTools = descriptors.filter((d) => d.category === "create");
    const editTools = descriptors.filter((d) => d.category === "edit");

    for (const desc of createTools) {
      this.addButton(desc, viewer);
    }

    if (createTools.length > 0 && editTools.length > 0) {
      const sep = document.createElement("div");
      sep.className = "separator";
      this.element.appendChild(sep);
    }

    for (const desc of editTools) {
      this.addButton(desc, viewer);
    }

    // Separator before undo/redo
    const sep2 = document.createElement("div");
    sep2.className = "separator";
    this.element.appendChild(sep2);

    // Undo button
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    undoBtn.disabled = true;
    undoBtn.addEventListener("click", () => viewer.undoMgr.undo());
    this.element.appendChild(undoBtn);

    // Redo button
    const redoBtn = document.createElement("button");
    redoBtn.textContent = "Redo";
    redoBtn.disabled = true;
    redoBtn.addEventListener("click", () => viewer.undoMgr.redo());
    this.element.appendChild(redoBtn);

    viewer.undoMgr.onStateChanged.add(() => {
      undoBtn.disabled = !viewer.undoMgr.canUndo;
      redoBtn.disabled = !viewer.undoMgr.canRedo;
    });

    // Separator before save/load
    const sep3 = document.createElement("div");
    sep3.className = "separator";
    this.element.appendChild(sep3);

    // Save
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", async () => {
      viewer.setStatus("Saving...");
      try {
        const blob = await viewer.save();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "project.bim";
        a.click();
        URL.revokeObjectURL(url);
        viewer.setStatus("Saved.");
      } catch (e) {
        console.error("Save failed:", e);
        viewer.setStatus("Save failed.");
      }
    });
    this.element.appendChild(saveBtn);

    // Load
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
          viewer.setStatus("Loaded.");
        } catch (e) {
          console.error("Load failed:", e);
          viewer.setStatus("Load failed.");
        }
      });
      input.click();
    });
    this.element.appendChild(loadBtn);

    // Wire active state
    viewer.toolMgr.onToolChanged = (name) => {
      for (const [toolName, btn] of this.buttons) {
        btn.classList.toggle("active", toolName === name);
      }
    };
  }

  private addButton(desc: ToolDescriptor, viewer: ViewerInstance) {
    const btn = document.createElement("button");
    btn.textContent = desc.label;
    btn.addEventListener("click", () => {
      if (viewer.toolMgr.getActiveTool()?.name === desc.tool.name) {
        viewer.toolMgr.setTool(null);
      } else {
        viewer.toolMgr.setTool(desc.tool);
      }
    });
    this.element.appendChild(btn);
    this.buttons.set(desc.tool.name, btn);
  }
}
