/**
 * BIM IDE — VS Code-like shell for BIM collaboration
 *
 * Assembles the shell layout, mounts the 3D viewer,
 * wires sidebar panels, and initializes subsystems.
 */
import "@vscode/codicons/dist/codicon.css";
// Import viewer component styles (types tab, properties panel, etc.)
import "../../viewer/src/ui/styles.css";
import { createViewer, type ViewerInstance } from "@bim-ide/viewer";
import { ActivityBar } from "./layout/activity-bar";
import { Sidebar } from "./layout/sidebar";
import { FloatingToolbar } from "./layout/floating-toolbar";
import { StatusBar } from "./layout/status-bar";
import { createExplorerView } from "./views/explorer-view";
import { createExtensionsView } from "./views/extensions-view";
import { createWikiView } from "./views/wiki-view";
import { createAIBuilderView } from "./views/ai-builder-view";
import { ExtensionHost } from "./services/extension-host";

async function bootstrap() {
  const shell = document.getElementById("shell")!;

  // ── Activity Bar ──
  const activityBar = new ActivityBar([
    { id: "explorer", icon: "files", tooltip: "Explorer" },
    { id: "wiki", icon: "book", tooltip: "BIM Wiki" },
    { id: "extensions", icon: "extensions", tooltip: "Extensions" },
    { id: "ai-builder", icon: "sparkle", tooltip: "AI Feature Builder" },
    { id: "settings", icon: "settings-gear", tooltip: "Settings", position: "bottom" },
  ]);

  // ── Primary Sidebar ──
  const sidebar = new Sidebar();

  // ── Editor Area ──
  const editorArea = document.createElement("div");
  editorArea.className = "editor-area";

  const viewerContainer = document.createElement("div");
  viewerContainer.className = "viewer-container";
  editorArea.appendChild(viewerContainer);

  // ── Right Sidebar ──
  const rightSidebar = document.createElement("div");
  rightSidebar.className = "right-sidebar collapsed";

  const rightHeader = document.createElement("div");
  rightHeader.className = "sidebar-header";
  rightHeader.textContent = "PROPERTIES";
  rightSidebar.appendChild(rightHeader);

  const rightContent = document.createElement("div");
  rightContent.className = "sidebar-content";
  rightSidebar.appendChild(rightContent);

  // ── Status Bar ──
  const statusBar = new StatusBar();
  statusBar.ensureSpacer();
  statusBar.addItem("status", "Initializing...", "left");
  statusBar.addItem("tool", "", "right");

  // ── Assemble shell ──
  shell.appendChild(activityBar.element);
  shell.appendChild(sidebar.element);
  shell.appendChild(sidebar.resizeHandle);
  shell.appendChild(editorArea);
  shell.appendChild(rightSidebar);
  shell.appendChild(statusBar.element);

  // ── Create viewer ──
  const viewer = await createViewer(viewerContainer);

  // Wire status
  viewer.onStatusChanged = (msg) => statusBar.updateItem("status", msg);
  statusBar.updateItem("status", "Ready");

  // ── Extension Host ──
  const extensionHost = new ExtensionHost(viewer);

  // ── Floating toolbar ──
  const toolbar = new FloatingToolbar(viewer, extensionHost);
  editorArea.appendChild(toolbar.element);

  // Wire tool name to status bar and toolbar highlight (after toolbar creation)
  viewer.toolMgr.onToolChanged = (name: string | null) => {
    statusBar.updateItem("tool", name ? `Tool: ${name}` : "");
    toolbar.highlightTool(name);
    // Hide properties panel when leaving select mode
    if (name !== "select") {
      rightSidebar.classList.add("collapsed");
    } else {
      // Re-show properties if there's an active selection
      const selected = viewer.selectTool.getSelectedContract();
      if (selected) {
        rightSidebar.classList.remove("collapsed");
        rightContent.innerHTML = "";
        viewer.propsPanel.show(selected, rightContent);
      }
    }
  };

  // ── Wire selection → right sidebar properties ──
  viewer.onSelectionChanged = (contract) => {
    // Only show properties when the select tool is active
    const isSelectMode = viewer.toolMgr.getActiveTool()?.name === "select";
    if (!isSelectMode) return;
    if (contract) {
      rightSidebar.classList.remove("collapsed");
      rightContent.innerHTML = "";
      viewer.propsPanel.show(contract, rightContent);
    } else {
      rightSidebar.classList.add("collapsed");
    }
  };

  // Update properties on contract change
  viewer.doc.onUpdated.add(({ contract }) => {
    if (viewer.sync.isDragging) return;
    if (
      viewer.selectTool.getSelectedContract()?.id === contract.id &&
      !rightSidebar.classList.contains("collapsed")
    ) {
      rightContent.innerHTML = "";
      viewer.propsPanel.show(contract, rightContent);
    }
  });

  // ── Register sidebar views ──
  sidebar.registerView("explorer", "Explorer", (container) => {
    createExplorerView(container, viewer, () => sidebar.refresh());
  });
  sidebar.registerView("wiki", "BIM Wiki", (container) => {
    createWikiView(container);
  });
  sidebar.registerView("extensions", "Extensions", (container) => {
    createExtensionsView(container, extensionHost);
  });
  sidebar.registerView("ai-builder", "AI Feature Builder", (container) => {
    createAIBuilderView(container, viewer);
  });

  // ── Wire activity bar ──
  activityBar.onItemClicked = (id) => {
    if (id === "settings") {
      // TODO: settings panel
      return;
    }
    sidebar.toggle(id);
    activityBar.setActive(sidebar.getActiveView());
  };

  // Show explorer by default
  sidebar.showView("explorer");
  activityBar.setActive("explorer");
}

bootstrap().catch(console.error);
