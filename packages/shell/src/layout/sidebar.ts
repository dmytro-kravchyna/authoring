export type SidebarViewRenderer = (container: HTMLElement) => void;

export class Sidebar {
  readonly element: HTMLElement;
  private header: HTMLElement;
  private content: HTMLElement;
  private views = new Map<string, { title: string; render: SidebarViewRenderer }>();
  private activeView: string | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "sidebar";

    this.header = document.createElement("div");
    this.header.className = "sidebar-header";
    this.element.appendChild(this.header);

    this.content = document.createElement("div");
    this.content.className = "sidebar-content";
    this.element.appendChild(this.content);
  }

  registerView(id: string, title: string, render: SidebarViewRenderer) {
    this.views.set(id, { title, render });
  }

  showView(id: string) {
    const view = this.views.get(id);
    if (!view) return;

    this.activeView = id;
    this.header.textContent = view.title;
    this.content.innerHTML = "";
    view.render(this.content);
    this.element.classList.remove("collapsed");
  }

  hide() {
    this.element.classList.add("collapsed");
    this.activeView = null;
  }

  toggle(id: string) {
    if (this.activeView === id) {
      this.hide();
    } else {
      this.showView(id);
    }
  }

  refresh() {
    if (this.activeView) {
      this.showView(this.activeView);
    }
  }

  getActiveView(): string | null {
    return this.activeView;
  }

  getContent(): HTMLElement {
    return this.content;
  }
}
