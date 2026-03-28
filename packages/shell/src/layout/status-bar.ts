export class StatusBar {
  readonly element: HTMLElement;
  private items = new Map<string, HTMLElement>();

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "status-bar";
  }

  addItem(id: string, text: string, position: "left" | "right" = "left"): HTMLElement {
    const item = document.createElement("div");
    item.className = "status-bar-item";
    item.textContent = text;
    this.items.set(id, item);

    if (position === "right") {
      this.element.appendChild(item);
    } else {
      // Insert before spacer or at beginning
      const spacer = this.element.querySelector(".status-bar-spacer");
      if (spacer) {
        this.element.insertBefore(item, spacer);
      } else {
        // Create spacer if none exists, insert item before it
        const sp = document.createElement("div");
        sp.className = "status-bar-spacer";
        this.element.appendChild(item);
        this.element.appendChild(sp);
      }
    }

    return item;
  }

  updateItem(id: string, text: string) {
    const item = this.items.get(id);
    if (item) item.textContent = text;
  }

  ensureSpacer() {
    if (!this.element.querySelector(".status-bar-spacer")) {
      const sp = document.createElement("div");
      sp.className = "status-bar-spacer";
      this.element.appendChild(sp);
    }
  }
}
