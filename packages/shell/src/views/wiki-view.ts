/**
 * BIM Wiki view — browsable knowledge base with markdown articles.
 */

interface WikiArticle {
  id: string;
  title: string;
  category: string;
  content: string;
}

// Seed content — 5 foundational articles
const WIKI_ARTICLES: WikiArticle[] = [
  {
    id: "ifc-wall",
    title: "IFC Wall (IfcWall)",
    category: "IFC Entities",
    content: `# IfcWall

An **IfcWall** represents a vertical construction element that bounds or subdivides spaces. Walls are one of the most fundamental building elements in BIM.

## Key Properties

- **Height**: The vertical extent of the wall
- **Thickness**: The wall's cross-section width
- **Start/End Points**: Define the wall's centerline path
- **Offset**: Lateral offset from the centerline

## Relationships

- **IfcWallType**: Defines shared properties (height, thickness) for multiple wall instances
- **Hosts**: Walls can host openings (windows, doors) via IfcOpeningElement
- **Connections**: Walls connect to other walls at joints (L, T, or cross junctions)

## In This Engine

Walls in the BIM authoring engine follow the **type/instance pattern**:
- **WallType** contracts hold shared parameters (height, thickness, material)
- **Wall** contracts hold instance-specific data (start point, end point, joins)

The geometry is generated from these parameters — never hand-edited.

## IFC Schema Reference

- Entity: \`IfcWall\` / \`IfcWallStandardCase\`
- Property Sets: \`Pset_WallCommon\`
- Quantity Sets: \`Qto_WallBaseQuantities\`
`,
  },
  {
    id: "ifc-window",
    title: "IFC Window (IfcWindow)",
    category: "IFC Entities",
    content: `# IfcWindow

An **IfcWindow** is a hosted element that fills an opening in a wall. Windows provide light and ventilation.

## Key Properties

- **Width**: Overall frame width
- **Height**: Overall frame height
- **Sill Height**: Distance from the floor to the bottom of the window

## Hosting Relationship

Windows are always **hosted** by a wall:
- The wall maintains a list of hosted element IDs
- When a wall is deleted, its hosted windows are cascade-deleted
- When a wall's geometry changes, hosted windows are repositioned

## Material Slots

Windows typically have two material slots:
- **frame**: The window frame material
- **glass**: The glazing material

## IFC Schema Reference

- Entity: \`IfcWindow\`
- Property Sets: \`Pset_WindowCommon\`
- Quantity Sets: \`Qto_WindowBaseQuantities\`
`,
  },
  {
    id: "ifc-slab",
    title: "IFC Slab (IfcSlab)",
    category: "IFC Entities",
    content: `# IfcSlab

An **IfcSlab** represents a horizontal construction element — floors, roofs, or landings.

## Key Properties

- **Boundary**: The slab's outline defined by boundary edges (walls or freeform points)
- **Thickness**: The slab's depth
- **Elevation**: The vertical position (typically from a level)

## Floor Tool

In this engine, floors are created with the **Floor Tool**:
1. Click walls to define boundary edges
2. The floor boundary resolves wall endpoints into a closed polygon
3. Geometry is extruded downward from the boundary

## Boolean Cuts

Slabs support boolean operations:
- Columns and other elements can **cut** through slabs
- The \`cuts\` relationship creates voids automatically

## IFC Schema Reference

- Entity: \`IfcSlab\`
- Predefined Types: \`FLOOR\`, \`ROOF\`, \`LANDING\`, \`BASESLAB\`
- Property Sets: \`Pset_SlabCommon\`
`,
  },
  {
    id: "type-instance",
    title: "Type/Instance Pattern",
    category: "Concepts",
    content: `# Type/Instance Pattern

The **Type/Instance** pattern is fundamental to BIM modeling. It separates shared properties from instance-specific properties.

## How It Works

- A **Type** contract holds shared parameters (e.g., wall height = 3m, thickness = 200mm)
- An **Instance** contract holds placement data (e.g., start point, end point) and references a type
- Many instances can share the same type
- Changing a type parameter updates all instances simultaneously

## Benefits

1. **Consistency**: All walls of the same type have identical dimensions
2. **Efficiency**: Change one type, update hundreds of instances
3. **Standards**: Types map to manufacturer catalogs (e.g., door sizes)

## In This Engine

The system uses \`ElementTypeDefinition\` with:
- \`typeKind\`: The type contract kind (e.g., "wallType")
- \`instanceKind\`: The instance contract kind (e.g., "wall")
- \`typeParams\`: Descriptors for generic UI rendering

Types are managed in the **Types Tab** in the sidebar.

## Example

\`\`\`
WallType (id: "wt-001")
  height: 3.0
  thickness: 0.2

Wall (id: "w-001", typeId: "wt-001")
  start: [0, 0, 0]
  end: [5, 0, 0]

Wall (id: "w-002", typeId: "wt-001")
  start: [5, 0, 0]
  end: [5, 0, 4]
\`\`\`

Both walls share height=3.0 and thickness=0.2 from their type.
`,
  },
  {
    id: "getting-started",
    title: "Getting Started with BIM Authoring",
    category: "Tutorials",
    content: `# Getting Started with BIM Authoring

This tutorial walks you through creating your first BIM model.

## 1. Understanding the Interface

- **3D Viewer** (center): The main modeling canvas
- **Toolbar** (top): Select tools for creating and editing elements
- **Explorer** (left sidebar): Manage levels, types, and materials
- **Properties** (right sidebar): View/edit selected element properties

## 2. Working with Levels

Levels define horizontal planes at specific elevations:
1. Open the **Explorer** panel
2. Expand the **LEVELS** section
3. The default levels are "Level 0" (0m) and "Level 1" (3m)
4. Click a level to make it active — all new elements are placed on the active level

## 3. Placing Your First Wall

1. Select the **Wall** tool from the toolbar
2. Click in the 3D view to set the start point
3. Click again to set the end point — the wall appears
4. Press **Escape** to deselect the tool

## 4. Adding a Window

1. Select the **Window** tool
2. Hover over an existing wall — it highlights
3. Click to place the window on the wall
4. The window is automatically hosted by the wall

## 5. Editing Elements

1. Use the **Select** tool to click on any element
2. Drag handles appear at endpoints
3. Drag handles to resize or reposition
4. View properties in the right sidebar

## 6. Undo/Redo

- **Ctrl+Z** (Cmd+Z on Mac): Undo
- **Ctrl+Y** (Cmd+Shift+Z): Redo

## 7. Save/Load

- Click **Save** to download your project as a .bim file
- Click **Load** to open a previously saved project
`,
  },
];

export function createWikiView(container: HTMLElement) {
  container.innerHTML = "";

  // Search
  const searchWrap = document.createElement("div");
  searchWrap.style.padding = "8px 12px";
  const searchInput = document.createElement("input");
  searchInput.className = "search-input";
  searchInput.placeholder = "Search BIM Wiki";
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // Split: nav + article
  const navArea = document.createElement("div");
  const articleArea = document.createElement("div");
  articleArea.className = "wiki-article";

  // Group by category
  const categories = new Map<string, WikiArticle[]>();
  for (const article of WIKI_ARTICLES) {
    if (!categories.has(article.category)) categories.set(article.category, []);
    categories.get(article.category)!.push(article);
  }

  function renderNav(filter = "") {
    navArea.innerHTML = "";
    const lowerFilter = filter.toLowerCase();

    for (const [category, articles] of categories) {
      const filtered = filter
        ? articles.filter(
            (a) =>
              a.title.toLowerCase().includes(lowerFilter) ||
              a.content.toLowerCase().includes(lowerFilter)
          )
        : articles;
      if (filtered.length === 0) continue;

      const catEl = document.createElement("div");
      catEl.className = "wiki-nav-category";
      const chevron = document.createElement("i");
      chevron.className = "codicon codicon-chevron-down";
      catEl.appendChild(chevron);
      catEl.appendChild(document.createTextNode(category));
      navArea.appendChild(catEl);

      const catItems = document.createElement("div");
      catItems.className = "wiki-nav-items";
      for (const article of filtered) {
        const item = document.createElement("div");
        item.className = "wiki-nav-item";
        const fileIcon = document.createElement("i");
        fileIcon.className = "codicon codicon-file";
        item.appendChild(fileIcon);
        item.appendChild(document.createTextNode(article.title));
        item.addEventListener("click", () => showArticle(article, navArea));
        catItems.appendChild(item);
      }
      navArea.appendChild(catItems);

      catEl.addEventListener("click", () => {
        catItems.classList.toggle("collapsed");
        chevron.style.transform = catItems.classList.contains("collapsed")
          ? "rotate(-90deg)"
          : "";
      });
    }
  }

  function showArticle(article: WikiArticle, navEl: HTMLElement) {
    // Highlight active
    navEl.querySelectorAll(".wiki-nav-item").forEach((el) => el.classList.remove("active"));
    // Simple markdown rendering (basic subset)
    articleArea.innerHTML = renderMarkdown(article.content);
  }

  searchInput.addEventListener("input", () => {
    renderNav(searchInput.value);
  });

  renderNav();
  container.appendChild(navArea);
  container.appendChild(articleArea);

  // Show first article by default
  if (WIKI_ARTICLES.length > 0) {
    showArticle(WIKI_ARTICLES[0], navArea);
  }
}

/** Simple markdown-to-HTML renderer (handles headers, code blocks, bold, lists) */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html += "</code></pre>";
        inCodeBlock = false;
      } else {
        html += "<pre><code>";
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      html += escapeHtml(line) + "\n";
      continue;
    }

    // Close list if line doesn't start with -
    if (inList && !line.startsWith("- ") && !line.startsWith("  ") && line.trim() !== "") {
      html += "</ul>";
      inList = false;
    }

    if (line.startsWith("# ")) {
      html += `<h1>${inline(line.slice(2))}</h1>`;
    } else if (line.startsWith("## ")) {
      html += `<h2>${inline(line.slice(3))}</h2>`;
    } else if (line.startsWith("### ")) {
      html += `<h3>${inline(line.slice(4))}</h3>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(line.slice(2))}</li>`;
    } else if (line.trim() === "") {
      if (!inList) html += "<br>";
    } else {
      html += `<p>${inline(line)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  if (inCodeBlock) html += "</code></pre>";

  return html;
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
