/**
 * BIM IDE — VS Code-like shell for BIM collaboration
 *
 * Assembles the shell layout, mounts the 3D viewer,
 * wires sidebar panels, and initializes subsystems.
 */
import "@vscode/codicons/dist/codicon.css";
// Import viewer component styles (types tab, properties panel, etc.)
import "../../viewer/src/ui/styles.css";
import { createViewer, setGeminiEnvKey, type ViewerInstance } from "@bim-ide/viewer";
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

  // ── Right Sidebar (tabbed) ──
  const rightSidebar = document.createElement("div");
  rightSidebar.className = "right-sidebar collapsed";

  const rightHeader = document.createElement("div");
  rightHeader.className = "right-sidebar-header";
  rightHeader.textContent = "PROPERTIES";
  rightSidebar.appendChild(rightHeader);

  const rightTabBar = document.createElement("div");
  rightTabBar.className = "right-tab-bar";
  rightSidebar.appendChild(rightTabBar);

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

  // Inject Gemini API key from environment
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey) setGeminiEnvKey(geminiKey);

  // Wire status
  viewer.onStatusChanged = (msg) => statusBar.updateItem("status", msg);
  statusBar.updateItem("status", "Ready");

  // ── Extension Host ──
  const extensionHost = new ExtensionHost(viewer);

  // ── Floating toolbar ──
  const toolbar = new FloatingToolbar(viewer, extensionHost);
  editorArea.appendChild(toolbar.element);

  // ── Right sidebar tab management ──
  type RightTab = { id: string; label: string; render: () => void; button: HTMLButtonElement };
  const rightTabs: RightTab[] = [];
  let activeRightTab = "";

  function addRightTab(id: string, label: string, render: () => void) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => switchRightTab(id));
    rightTabBar.appendChild(btn);
    rightTabs.push({ id, label, render, button: btn });
    updateTabBarVisibility();
  }

  function removeRightTab(id: string) {
    const idx = rightTabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tab = rightTabs[idx];
    rightTabBar.removeChild(tab.button);
    rightTabs.splice(idx, 1);
    if (activeRightTab === id) {
      activeRightTab = "";
      if (rightTabs.length > 0) {
        switchRightTab(rightTabs[0].id);
      } else {
        rightContent.innerHTML = "";
      }
    }
    updateTabBarVisibility();
  }

  function switchRightTab(id: string) {
    activeRightTab = id;
    for (const tab of rightTabs) {
      tab.button.classList.toggle("active", tab.id === id);
    }
    rightContent.innerHTML = "";
    const tab = rightTabs.find(t => t.id === id);
    tab?.render();
  }

  function collapseRightSidebar() {
    rightSidebar.classList.add("collapsed");
    activeRightTab = "";
    rightContent.innerHTML = "";
  }

  function expandRightSidebar() {
    rightSidebar.classList.remove("collapsed");
  }

  function updateTabBarVisibility() {
    const multi = rightTabs.length > 1;
    rightTabBar.classList.toggle("single-tab", !multi);
    rightHeader.style.display = multi ? "none" : "";
  }

  // Register permanent tab (properties only — Levels/Types/Materials live in the Explorer)
  addRightTab("properties", "Properties", () => {
    const selected = viewer.selectTool.getSelectedContract();
    if (selected) {
      viewer.propsPanel.show(selected, rightContent);
    } else {
      viewer.propsPanel.showEmpty(rightContent);
    }
  });

  // Wire tool name to status bar, toolbar highlight, and creation options
  viewer.toolMgr.onToolChanged = (name: string | null) => {
    statusBar.updateItem("tool", name ? `Tool: ${name}` : "");
    toolbar.highlightTool(name);

    // Remove previous creation tab
    removeRightTab("create");

    // Add creation tab if active tool has renderCreationOptions
    const activeTool = viewer.toolMgr.getActiveTool();
    if (activeTool?.renderCreationOptions) {
      const tool = activeTool;
      addRightTab("create", "Create", () => {
        const header = document.createElement("h3");
        header.textContent = `${tool.name.charAt(0).toUpperCase() + tool.name.slice(1)} Options`;
        rightContent.appendChild(header);
        tool.renderCreationOptions!(rightContent);
      });
      expandRightSidebar();
      switchRightTab("create");
    } else if (name === "select") {
      // Switching to select tool — show properties if something is selected
      const selected = viewer.selectTool.getSelectedContract();
      if (selected) {
        expandRightSidebar();
        switchRightTab("properties");
      } else {
        collapseRightSidebar();
      }
    } else {
      // Non-create tool, no selection — collapse
      collapseRightSidebar();
    }
  };

  // ── Wire selection → right sidebar properties ──
  viewer.onSelectionChanged = (contract) => {
    if (contract) {
      expandRightSidebar();
      switchRightTab("properties");
    } else {
      // Selection cleared
      const hasCreateTab = rightTabs.some(t => t.id === "create");
      if (hasCreateTab) {
        switchRightTab("create");
      } else {
        collapseRightSidebar();
      }
    }
  };

  // Update properties on contract change
  viewer.doc.onUpdated.add(({ contract }) => {
    if (viewer.sync.isDragging) return;
    if (
      viewer.selectTool.getSelectedContract()?.id === contract.id &&
      activeRightTab === "properties"
    ) {
      rightContent.innerHTML = "";
      viewer.propsPanel.show(contract, rightContent);
    }
    if (viewer.registry.isDataOnly(contract.kind)) {
      viewer.typesTab.refresh();
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
    createAIBuilderView(container, viewer, extensionHost, editorArea);
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
