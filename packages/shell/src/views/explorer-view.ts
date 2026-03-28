import type { ViewerInstance } from "@bim-ide/viewer";

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
}
