/**
 * DraftFeaturePanel — floating panel over the 3D editor
 * that signals the user is iterating on a draft BIM feature
 * via the AI Builder. Dashed border, "DRAFT" badge,
 * status text, and Run / Bundle / Discard actions.
 *
 * Test mode lifecycle:
 *   Run → (executing) → TESTING → Stop Test → back to DRAFT
 *   While TESTING the user inspects the 3D preview.
 *   Sending a new prompt or clicking Stop Test exits test mode.
 */

export class DraftFeaturePanel {
  readonly element: HTMLElement;

  onRun: (() => void) | null = null;
  onStopTest: (() => void) | null = null;
  onBundle: (() => void) | null = null;
  onDiscard: (() => void) | null = null;

  private titleEl: HTMLElement;
  private statusEl: HTMLElement;
  private runBtn: HTMLButtonElement;
  private bundleBtn: HTMLButtonElement;
  private draftBadge: HTMLElement;
  private testingBadge: HTMLElement;
  private _isTesting = false;

  get isTesting() { return this._isTesting; }

  constructor() {
    const el = document.createElement("div");
    el.className = "draft-feature-panel hidden";

    // Draft badge
    this.draftBadge = document.createElement("span");
    this.draftBadge.className = "draft-badge";
    this.draftBadge.textContent = "DRAFT";
    el.appendChild(this.draftBadge);

    // Testing badge (shown when in test mode)
    this.testingBadge = document.createElement("span");
    this.testingBadge.className = "draft-badge draft-badge-testing";
    this.testingBadge.textContent = "TESTING";
    this.testingBadge.style.display = "none";
    el.appendChild(this.testingBadge);

    // Info section
    const info = document.createElement("div");
    info.className = "draft-info";

    this.titleEl = document.createElement("div");
    this.titleEl.className = "draft-title";
    info.appendChild(this.titleEl);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "draft-status";
    info.appendChild(this.statusEl);

    el.appendChild(info);

    // Actions
    const actions = document.createElement("div");
    actions.className = "draft-actions";

    this.runBtn = document.createElement("button");
    this.runBtn.className = "btn-primary draft-btn-run";
    this.runBtn.textContent = "Run";
    this.runBtn.title = "Test the feature — clears and re-runs all steps as a preview";
    this.runBtn.addEventListener("click", () => {
      if (this._isTesting) {
        this.onStopTest?.();
      } else {
        this.onRun?.();
      }
    });
    actions.appendChild(this.runBtn);

    this.bundleBtn = document.createElement("button");
    this.bundleBtn.className = "btn-primary";
    this.bundleBtn.textContent = "Bundle";
    this.bundleBtn.addEventListener("click", () => this.onBundle?.());
    actions.appendChild(this.bundleBtn);

    const discardBtn = document.createElement("button");
    discardBtn.className = "btn-secondary";
    discardBtn.textContent = "Discard";
    discardBtn.addEventListener("click", () => this.onDiscard?.());
    actions.appendChild(discardBtn);

    el.appendChild(actions);
    this.element = el;
  }

  show(title: string) {
    this.titleEl.textContent = title;
    this.statusEl.textContent = "";
    this.element.classList.remove("hidden", "bundle-transition");
    this.exitTesting();
  }

  hide() {
    this.element.classList.add("hidden");
    this.element.classList.remove("reasoning", "bundle-transition", "testing");
    this._isTesting = false;
    this.testingBadge.style.display = "none";
    this.draftBadge.style.display = "";
    this.runBtn.textContent = "Run";
    this.runBtn.title = "Test the feature — clears and re-runs all steps as a preview";
  }

  setTitle(name: string) {
    this.titleEl.textContent = name;
  }

  updateStatus(iteration: number, elementCount: number, kindCount: number) {
    const parts = [
      `Iteration ${iteration}`,
      `${elementCount} element${elementCount !== 1 ? "s" : ""} created`,
    ];
    if (kindCount > 0) {
      parts.push(`${kindCount} new type${kindCount !== 1 ? "s" : ""}`);
    }
    this.statusEl.textContent = parts.join(" \u2022 ");
  }

  setReasoning(active: boolean) {
    this.element.classList.toggle("reasoning", active);
  }

  /** Enter test mode — shows TESTING badge, hides DRAFT badge, Run becomes "Stop Test" */
  enterTesting() {
    this._isTesting = true;
    this.testingBadge.style.display = "";
    this.draftBadge.style.display = "none";
    this.element.classList.add("testing");
    this.runBtn.textContent = "Stop Test";
    this.runBtn.title = "Exit test mode and return to draft editing";
    this.runBtn.disabled = false;
  }

  /** Exit test mode — restores DRAFT badge, Run button label */
  exitTesting() {
    this._isTesting = false;
    this.testingBadge.style.display = "none";
    this.draftBadge.style.display = "";
    this.element.classList.remove("testing");
    this.runBtn.textContent = "Run";
    this.runBtn.title = "Test the feature — clears and re-runs all steps as a preview";
    this.runBtn.disabled = false;
  }

  /** Show running spinner state while steps execute */
  setRunning(active: boolean) {
    this.runBtn.disabled = active;
    if (active) {
      this.runBtn.textContent = "Running...";
    } else if (this._isTesting) {
      this.runBtn.textContent = "Stop Test";
    } else {
      this.runBtn.textContent = "Run";
    }
  }

  animateBundleTransition(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        this.element.removeEventListener("transitionend", handler);
        resolve();
      };
      this.element.addEventListener("transitionend", handler);
      this.element.classList.add("bundle-transition");
      // Safety timeout in case transitionend doesn't fire
      setTimeout(resolve, 600);
    });
  }
}
