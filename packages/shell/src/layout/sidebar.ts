export type SidebarViewRenderer = (container: HTMLElement) => void;

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const STORAGE_KEY = "bim-ide-sidebar-width";

export class Sidebar {
  readonly element: HTMLElement;
  readonly resizeHandle: HTMLElement;
  private header: HTMLElement;
  private content: HTMLElement;
  private views = new Map<string, { title: string; render: SidebarViewRenderer }>();
  private activeView: string | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "sidebar";

    // Restore persisted width
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) this.element.style.width = `${saved}px`;

    this.header = document.createElement("div");
    this.header.className = "sidebar-header";
    this.element.appendChild(this.header);

    this.content = document.createElement("div");
    this.content.className = "sidebar-content";
    this.element.appendChild(this.content);

    // Resize handle (sits to the right of the sidebar in the DOM)
    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "sidebar-resize-handle";
    this.initResize();
  }

  private initResize() {
    const handle = this.resizeHandle;
    const el = this.element;

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)));
      el.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      handle.classList.remove("active");
      localStorage.setItem(STORAGE_KEY, String(el.offsetWidth));
    };

    handle.addEventListener("mousedown", (e) => {
      if (el.classList.contains("collapsed")) return;
      e.preventDefault();
      startX = e.clientX;
      startWidth = el.offsetWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      handle.classList.add("active");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
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
