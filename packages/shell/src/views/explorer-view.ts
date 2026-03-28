import { snapSettings, type ViewerInstance } from "@bim-ide/viewer";

/**
 * Explorer view — wraps the viewer's Levels, Types, and Materials panels
 * in collapsible sections matching VS Code's sidebar style.
 */
export function createExplorerView(
  container: HTMLElement,
  viewer: ViewerInstance,
  onRefresh: () => void
) {
  container.innerHTML = "";

  // Helper: create a collapsible section
  function addSection(title: string, defaultOpen: boolean, renderBody: (body: HTMLElement) => void) {
    const section = document.createElement("div");
    section.className = "sidebar-section";

    const header = document.createElement("div");
    header.className = `sidebar-section-header${defaultOpen ? "" : " collapsed"}`;

    const chevron = document.createElement("i");
    chevron.className = "codicon codicon-chevron-down";
    header.appendChild(chevron);

    const label = document.createTextNode(title);
    header.appendChild(label);

    section.appendChild(header);

    const body = document.createElement("div");
    body.className = `sidebar-section-body${defaultOpen ? "" : " collapsed"}`;
    section.appendChild(body);

    renderBody(body);

    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      body.classList.toggle("collapsed");
    });

    container.appendChild(section);
  }

  addSection("LEVELS", true, (body) => {
    viewer.levelsTab.render(body);
  });

  addSection("TYPES", true, (body) => {
    viewer.typesTab.render(body);
  });

  addSection("MATERIALS", false, (body) => {
    viewer.materialsTab.render(body);
  });

  addSection("SNAP SETTINGS", false, (body) => {
    function addCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void) {
      const lbl = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      lbl.appendChild(input);
      lbl.appendChild(document.createTextNode(` ${label}`));
      body.appendChild(lbl);
    }

    function addNumber(label: string, value: number, step: number, min: number, max: number, onChange: (v: number) => void) {
      const lbl = document.createElement("label");
      lbl.appendChild(document.createTextNode(label));
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(value);
      input.step = String(step);
      input.min = String(min);
      input.max = String(max);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (v > 0) onChange(v);
      });
      lbl.appendChild(input);
      body.appendChild(lbl);
    }

    addCheckbox("Grid", snapSettings.gridEnabled, (v) => { snapSettings.gridEnabled = v; });
    addNumber("Grid step", snapSettings.gridStep, 0.05, 0.01, 5, (v) => { snapSettings.gridStep = v; });
    addCheckbox("Endpoint", snapSettings.endpointEnabled, (v) => { snapSettings.endpointEnabled = v; });
    addCheckbox("Midpoint", snapSettings.midpointEnabled, (v) => { snapSettings.midpointEnabled = v; });
    addCheckbox("Extension", snapSettings.extensionEnabled, (v) => { snapSettings.extensionEnabled = v; });
    addCheckbox("Perpendicular", snapSettings.perpendicularEnabled, (v) => { snapSettings.perpendicularEnabled = v; });
    addNumber("Threshold", snapSettings.endpointThreshold, 0.05, 0.05, 2, (v) => { snapSettings.endpointThreshold = v; });
  });
}
