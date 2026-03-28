/**
 * Full-height right sidebar with switchable tabs.
 * Hosts the Types and Properties tabs (more can be added later).
 */
export class SidePanel {
  private container: HTMLElement;
  private tabBar: HTMLElement;
  private contentArea: HTMLElement;
  private tabs = new Map<string, { button: HTMLButtonElement; render: () => void }>();
  private activeTab = "";

  constructor() {
    this.container = document.getElementById("side-panel")!;

    this.tabBar = document.createElement("div");
    this.tabBar.className = "side-panel-tabs";
    this.container.appendChild(this.tabBar);

    this.contentArea = document.createElement("div");
    this.contentArea.className = "side-panel-content";
    this.container.appendChild(this.contentArea);
  }

  /** Register a tab. First registered tab is shown by default. */
  addTab(id: string, label: string, render: () => void) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => this.switchTab(id));
    this.tabBar.appendChild(btn);
    this.tabs.set(id, { button: btn, render });

    if (this.tabs.size === 1) this.switchTab(id);
  }

  /** Remove a tab. If it's the active tab, switch to the first remaining tab. */
  removeTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.tabBar.removeChild(tab.button);
    this.tabs.delete(id);
    if (this.activeTab === id) {
      const first = this.tabs.keys().next().value;
      if (first) {
        this.activeTab = ""; // clear so switchTab doesn't early-return
        this.switchTab(first);
      } else {
        this.activeTab = "";
        this.contentArea.innerHTML = "";
      }
    }
  }

  switchTab(id: string) {
    if (this.activeTab === id) return;
    this.activeTab = id;
    for (const [tabId, tab] of this.tabs) {
      tab.button.classList.toggle("active", tabId === id);
    }
    this.contentArea.innerHTML = "";
    this.tabs.get(id)?.render();
  }

  /** Get the content container (for tabs that need direct DOM access). */
  get content(): HTMLElement {
    return this.contentArea;
  }

  /** Re-render the currently active tab. */
  refresh() {
    if (this.activeTab) {
      this.contentArea.innerHTML = "";
      this.tabs.get(this.activeTab)?.render();
    }
  }

  get currentTab(): string {
    return this.activeTab;
  }
}
