export interface ActivityBarItem {
  id: string;
  icon: string; // codicon name (without "codicon-" prefix)
  tooltip: string;
  position?: "top" | "bottom";
}

export class ActivityBar {
  readonly element: HTMLElement;
  private items = new Map<string, HTMLElement>();
  private activeId: string | null = null;
  onItemClicked: ((id: string) => void) | null = null;

  constructor(items: ActivityBarItem[]) {
    this.element = document.createElement("div");
    this.element.className = "activity-bar";

    const topItems = items.filter((i) => i.position !== "bottom");
    const bottomItems = items.filter((i) => i.position === "bottom");

    for (const item of topItems) {
      this.element.appendChild(this.createIcon(item));
    }

    const spacer = document.createElement("div");
    spacer.className = "activity-bar-spacer";
    this.element.appendChild(spacer);

    for (const item of bottomItems) {
      this.element.appendChild(this.createIcon(item));
    }
  }

  private createIcon(item: ActivityBarItem): HTMLElement {
    const el = document.createElement("div");
    el.className = "activity-bar-icon";
    el.title = item.tooltip;

    const icon = document.createElement("i");
    icon.className = `codicon codicon-${item.icon}`;
    el.appendChild(icon);

    el.addEventListener("click", () => {
      this.onItemClicked?.(item.id);
    });

    this.items.set(item.id, el);
    return el;
  }

  setActive(id: string | null) {
    for (const [itemId, el] of this.items) {
      el.classList.toggle("active", itemId === id);
    }
    this.activeId = id;
  }

  getActive(): string | null {
    return this.activeId;
  }
}
