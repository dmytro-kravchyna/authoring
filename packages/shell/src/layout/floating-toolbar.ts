import type { ToolDescriptor, ViewerInstance } from "@bim-ide/viewer";
import type { ExtensionHost } from "../services/extension-host";

export class FloatingToolbar {
  readonly element: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private viewer: ViewerInstance;
  private extensionHost: ExtensionHost;
  private toolSection: HTMLElement;
  private commandSection: HTMLElement;

  constructor(viewer: ViewerInstance, extensionHost: ExtensionHost) {
    this.viewer = viewer;
    this.extensionHost = extensionHost;
    this.element = document.createElement("div");
    this.element.className = "floating-toolbar";

    // Dynamic tool buttons section
    this.toolSection = document.createElement("span");
    this.toolSection.style.display = "contents";
    this.element.appendChild(this.toolSection);

    this.rebuildToolButtons();

    // Extension command buttons section
    this.commandSection = document.createElement("span");
    this.commandSection.style.display = "contents";
    this.element.appendChild(this.commandSection);
    this.rebuildCommandButtons();
    extensionHost.onCommandsChanged(() => this.rebuildCommandButtons());

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

    // Subscribe to tool registration changes
    viewer.onToolsChanged.add(() => this.rebuildToolButtons());
  }

  highlightTool(toolName: string | null) {
    for (const [name, btn] of this.buttons) {
      btn.classList.toggle("active", name === toolName);
    }
  }

  private rebuildToolButtons() {
    this.toolSection.innerHTML = "";
    this.buttons.clear();

    const descriptors: ToolDescriptor[] = this.viewer.getToolDescriptors();
    const createTools = descriptors.filter((d: ToolDescriptor) => d.category === "create");
    const editTools = descriptors.filter((d: ToolDescriptor) => d.category === "edit");

    for (const desc of createTools) {
      this.addButton(desc);
    }

    if (createTools.length > 0 && editTools.length > 0) {
      const sep = document.createElement("div");
      sep.className = "separator";
      this.toolSection.appendChild(sep);
    }

    for (const desc of editTools) {
      this.addButton(desc);
    }

    // Re-highlight the active tool if any
    const activeName = this.viewer.toolMgr.getActiveTool()?.name ?? null;
    if (activeName) {
      this.buttons.get(activeName)?.classList.add("active");
    }
  }

  private addButton(desc: ToolDescriptor) {
    const btn = document.createElement("button");
    btn.textContent = desc.label;
    btn.addEventListener("click", () => {
      if (this.viewer.toolMgr.getActiveTool()?.name === desc.tool.name) {
        this.viewer.toolMgr.setTool(null);
      } else {
        this.viewer.toolMgr.setTool(desc.tool);
      }
    });
    this.toolSection.appendChild(btn);
    this.buttons.set(desc.tool.name, btn);
  }

  private rebuildCommandButtons() {
    this.commandSection.innerHTML = "";
    const commands = this.extensionHost.getCommands();
    if (commands.length === 0) return;

    const sep = document.createElement("div");
    sep.className = "separator";
    this.commandSection.appendChild(sep);

    for (const cmd of commands) {
      const btn = document.createElement("button");
      btn.textContent = cmd.label;
      btn.title = cmd.id;
      btn.addEventListener("click", () => {
        this.extensionHost.executeCommand(cmd.id);
      });
      this.commandSection.appendChild(btn);
    }
  }
}
