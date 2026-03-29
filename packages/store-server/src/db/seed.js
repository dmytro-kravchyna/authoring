/**
 * Seed script — populates the extension store with demo AEC extensions.
 * Generates real local ESM bundle files so the download endpoint works.
 *
 * Usage:  node src/db/seed.js
 */

import { getDatabase, syncContributions } from "./database.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = join(__dirname, "../../store-data/packages");

const db = getDatabase();

// ─── Clear existing data ─────────────────────────────
db.exec("DELETE FROM extension_contributions");
db.exec("DELETE FROM extension_dependencies");
db.exec("DELETE FROM ratings");
db.exec("DELETE FROM versions");
db.exec("DELETE FROM extensions");
db.exec("DELETE FROM authors");

// ─── Authors ─────────────────────────────────────────

const authors = [
  {
    id: "author-structura",
    name: "structura-engineering",
    display_name: "Structura Engineering",
    email: "dev@structura.io",
    url: "https://structura.io",
    avatar_url: "",
    org: "Structura Engineering Ltd",
    verified: 1,
  },
  {
    id: "author-facade-studio",
    name: "facade-studio",
    display_name: "Facade Studio",
    email: "hello@facadestudio.com",
    url: "https://facadestudio.com",
    avatar_url: "",
    org: "Facade Studio Design",
    verified: 1,
  },
  {
    id: "author-mep-solutions",
    name: "mep-solutions",
    display_name: "MEP Solutions",
    email: "info@mepsolutions.dev",
    url: "https://mepsolutions.dev",
    avatar_url: "",
    org: "MEP Solutions Inc",
    verified: 1,
  },
  {
    id: "author-openbim-lab",
    name: "openbim-lab",
    display_name: "OpenBIM Lab",
    email: "contact@openbimlab.org",
    url: "https://openbimlab.org",
    avatar_url: "",
    org: "",
    verified: 1,
  },
];

const insertAuthor = db.prepare(
  "INSERT INTO authors (id, name, display_name, email, url, avatar_url, org, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
for (const a of authors) {
  insertAuthor.run(a.id, a.name, a.display_name, a.email, a.url, a.avatar_url, a.org, a.verified);
}

// ─── Bundle generation helper ────────────────────────

function writeBundleFile(extId, version, code) {
  const dir = join(PACKAGES_DIR, extId, version);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "bundle.mjs");
  writeFileSync(filePath, code, "utf-8");
  const hash = createHash("sha256").update(code).digest("hex");
  return { filePath, hash };
}

// ─── Extension bundles ───────────────────────────────
// Each bundle is a real ESM module that uses the ExtensionContext API
// to register elements, tools, and commands matching the manifest.

const bundles = {};

// ── 1. Steel Beam Tools ──────────────────────────────
// Structural extension: registers I-beam element type with parametric
// geometry (flanges + web), a placement tool, and mirror/rotate commands.
// All mutations are wrapped in doc.transaction() for undo support.

bundles["com.structura.steel-beams"] = `
/**
 * Steel Beam Tools — structural steel beam elements for BIM modeling.
 *
 * Registers:
 *  - "steelBeam" element kind with parametric I-section geometry
 *  - "steelBeamType" type kind with configurable flange/web dimensions
 *  - "Place Steel Beam" creation tool
 *  - "Mirror Beam" and "Rotate Beam 90°" editing commands
 *
 * All model mutations use doc.transaction() for full undo/redo support.
 */

// ── Geometry: parametric I-beam cross-section extruded along a line ──

function createIBeamGeometry(length, flangeW, flangeT, webH, webT) {
  // Simplified box-composite: two flange boxes + one web box
  const positions = [];
  const indices = [];
  let vi = 0;

  function addBox(cx, cy, cz, sx, sy, sz) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const base = vi;
    // 8 corners
    for (const dx of [-1, 1])
      for (const dy of [-1, 1])
        for (const dz of [-1, 1])
          positions.push(cx + dx * hx, cy + dy * hy, cz + dz * hz);
    // 6 faces (2 triangles each)
    const faces = [
      [0,1,3,2],[4,6,7,5],[0,4,5,1],
      [2,3,7,6],[0,2,6,4],[1,5,7,3],
    ];
    for (const f of faces) {
      indices.push(base+f[0], base+f[1], base+f[2]);
      indices.push(base+f[0], base+f[2], base+f[3]);
    }
    vi += 8;
  }

  const halfLen = length / 2;
  const totalH = webH + 2 * flangeT;

  // Bottom flange
  addBox(0, -totalH/2 + flangeT/2, halfLen, flangeW, flangeT, length);
  // Top flange
  addBox(0, totalH/2 - flangeT/2, halfLen, flangeW, flangeT, length);
  // Web
  addBox(0, 0, halfLen, webT, webH, length);

  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

// ── Element type definition ──

const steelBeamTypeDef = {
  kind: "steelBeamType",
  dataOnly: true,
  typeParams: [
    { key: "flangeWidth",     label: "Flange Width (mm)",     type: "number", default: 200 },
    { key: "flangeThickness", label: "Flange Thickness (mm)", type: "number", default: 15  },
    { key: "webHeight",       label: "Web Height (mm)",       type: "number", default: 300 },
    { key: "webThickness",    label: "Web Thickness (mm)",    type: "number", default: 10  },
  ],
  generateGeometry() { return null; },
  getRelationships() { return []; },
};

const steelBeamDef = {
  kind: "steelBeam",
  typeKind: "steelBeamType",
  instanceKind: "steelBeam",

  generateGeometry(engine, contract, doc) {
    const typeContract = contract.typeId
      ? doc.get(contract.typeId)
      : null;

    const flangeW = (typeContract?.flangeWidth  ?? 200) / 1000;
    const flangeT = (typeContract?.flangeThickness ?? 15) / 1000;
    const webH    = (typeContract?.webHeight    ?? 300) / 1000;
    const webT    = (typeContract?.webThickness ?? 10)  / 1000;

    const sx = contract.startX ?? 0;
    const sz = contract.startZ ?? 0;
    const ex = contract.endX   ?? sx + 3;
    const ez = contract.endZ   ?? sz;
    const length = Math.sqrt((ex - sx) ** 2 + (ez - sz) ** 2) || 1;

    const { positions, indices } = createIBeamGeometry(length, flangeW, flangeT, webH, webT);

    const geo = new engine.BufferGeometry();
    geo.setAttribute("position", new engine.BufferAttribute(positions, 3));
    geo.setIndex(new engine.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    // Orient along the beam line
    const angle = Math.atan2(ex - sx, ez - sz);
    const elev  = contract.elevation ?? 0;
    geo.rotateY(angle);
    geo.translate((sx + ex) / 2, elev, (sz + ez) / 2);

    return geo;
  },

  getRelationships(contract, doc) {
    const rels = [];
    if (contract.typeId)  rels.push({ type: "instanceOf",  target: contract.typeId });
    if (contract.levelId) rels.push({ type: "belongsToLevel", target: contract.levelId });
    return rels;
  },

  getSnapPoints(contract) {
    const sx = contract.startX ?? 0, sz = contract.startZ ?? 0;
    const ex = contract.endX ?? sx + 3, ez = contract.endZ ?? sz;
    return [
      { position: { x: sx, y: contract.elevation ?? 0, z: sz }, type: "endpoint" },
      { position: { x: ex, y: contract.elevation ?? 0, z: ez }, type: "endpoint" },
      { position: { x: (sx+ex)/2, y: contract.elevation ?? 0, z: (sz+ez)/2 }, type: "midpoint" },
    ];
  },
};

// ── Placement tool ──

function createPlaceTool(context) {
  let startPt = null;

  return {
    name: "steel-beam-place",
    typeKind: "steelBeamType",
    typeId: null,
    levelId: null,

    activate()   { startPt = null; },
    deactivate() { startPt = null; },

    onPointerDown(event, intersection) {
      if (!intersection) return;
      if (!startPt) {
        startPt = { x: intersection.point.x, z: intersection.point.z };
      } else {
        const end = { x: intersection.point.x, z: intersection.point.z };
        context.doc.transaction(() => {
          context.doc.add({
            kind: "steelBeam",
            startX: startPt.x, startZ: startPt.z,
            endX: end.x, endZ: end.z,
            elevation: 0,
            typeId: this.typeId || null,
            levelId: this.levelId || null,
          });
        });
        startPt = null;
      }
    },
    onPointerMove() {},
    onPointerUp() {},
    onKeyDown(event) {
      if (event.key === "Escape") startPt = null;
    },
  };
}

// ── Commands ──

function registerCommands(context) {
  context.editor.registerCommand({
    id: "mirror-beam",
    label: "Mirror Beam",
    category: "structural",
    keybinding: "Ctrl+Shift+M",
    handler() {
      const sel = context.selection.getFirst();
      if (!sel || sel.kind !== "steelBeam") {
        context.ui.showNotification("Select a steel beam first", "warning");
        return;
      }
      context.doc.transaction(() => {
        context.doc.update(sel.id, { startX: sel.endX, startZ: sel.endZ, endX: sel.startX, endZ: sel.startZ });
      });
    },
  });

  context.editor.registerCommand({
    id: "rotate-beam",
    label: "Rotate Beam 90°",
    category: "structural",
    keybinding: "Ctrl+Shift+R",
    handler() {
      const sel = context.selection.getFirst();
      if (!sel || sel.kind !== "steelBeam") {
        context.ui.showNotification("Select a steel beam first", "warning");
        return;
      }
      const cx = (sel.startX + sel.endX) / 2;
      const cz = (sel.startZ + sel.endZ) / 2;
      const dx = sel.endX - sel.startX;
      const dz = sel.endZ - sel.startZ;
      context.doc.transaction(() => {
        context.doc.update(sel.id, {
          startX: cx - dz / 2, startZ: cz + dx / 2,
          endX:   cx + dz / 2, endZ:   cz - dx / 2,
        });
      });
    },
  });
}

// ── Activate ──

export function activate(context) {
  context.editor.registerElement(steelBeamTypeDef);
  context.editor.registerElement(steelBeamDef);
  context.editor.registerTool(createPlaceTool(context), {
    label: "Place Steel Beam",
    icon: "codicon-symbol-structure",
    category: "create",
  });
  registerCommands(context);
  context.ui.showNotification("Steel Beam Tools activated");
}

export function deactivate() {}
`;

// ── 2. Curtain Wall System ───────────────────────────
// Architectural extension: registers curtain wall and panel elements,
// a drawing tool, and a sidebar panel configurator for setting
// panel width, mullion size, and glass material.

bundles["com.facade-studio.curtain-wall"] = `
/**
 * Curtain Wall System — parametric curtain wall with configurable panels.
 *
 * Registers:
 *  - "curtainWall" element kind (line-based, auto-subdivides into panels)
 *  - "curtainPanel" element kind (hosted on curtain wall)
 *  - "Draw Curtain Wall" creation tool
 *  - "Panel Configurator" sidebar view for setting panel width, mullion profile, glass type
 *
 * All model mutations use doc.transaction() for full undo/redo support.
 */

// ── Geometry helpers ──

function createQuadGeo(engine, width, height, depth) {
  const geo = new engine.BoxGeometry(width, height, depth);
  return geo;
}

// ── Element definitions ──

const curtainWallDef = {
  kind: "curtainWall",
  materialSlots: ["mullion"],

  generateGeometry(engine, contract, doc) {
    const sx = contract.startX ?? 0, sz = contract.startZ ?? 0;
    const ex = contract.endX ?? sx + 6, ez = contract.endZ ?? sz;
    const height    = contract.height ?? 3;
    const panelW    = contract.panelWidth ?? 1.2;
    const mullionW  = contract.mullionWidth ?? 0.05;
    const elev      = contract.elevation ?? 0;

    const dx = ex - sx, dz = ez - sz;
    const wallLen = Math.sqrt(dx * dx + dz * dz) || 1;
    const angle   = Math.atan2(dx, dz);
    const panelCount = Math.max(1, Math.round(wallLen / panelW));

    const group = new engine.Group();

    // Mullion verticals
    for (let i = 0; i <= panelCount; i++) {
      const t = i / panelCount;
      const mx = sx + dx * t;
      const mz = sz + dz * t;
      const mullion = new engine.Mesh(
        createQuadGeo(engine, mullionW, height, mullionW),
        new engine.MeshStandardMaterial({ color: 0x666666 })
      );
      mullion.position.set(mx, elev + height / 2, mz);
      group.add(mullion);
    }

    // Glass panels
    for (let i = 0; i < panelCount; i++) {
      const t = (i + 0.5) / panelCount;
      const px = sx + dx * t;
      const pz = sz + dz * t;
      const actualW = wallLen / panelCount - mullionW;
      const glass = new engine.Mesh(
        createQuadGeo(engine, actualW, height - mullionW * 2, 0.02),
        new engine.MeshPhysicalMaterial({
          color: 0x88ccff, transparent: true, opacity: 0.35,
          roughness: 0.05, metalness: 0.1,
        })
      );
      glass.position.set(px, elev + height / 2, pz);
      glass.rotation.y = angle;
      group.add(glass);
    }

    return group;
  },

  getRelationships(contract) {
    const rels = [];
    if (contract.levelId) rels.push({ type: "belongsToLevel", target: contract.levelId });
    return rels;
  },

  getSnapPoints(contract) {
    const sx = contract.startX ?? 0, sz = contract.startZ ?? 0;
    const ex = contract.endX ?? sx + 6, ez = contract.endZ ?? sz;
    const elev = contract.elevation ?? 0;
    return [
      { position: { x: sx, y: elev, z: sz }, type: "endpoint" },
      { position: { x: ex, y: elev, z: ez }, type: "endpoint" },
    ];
  },
};

const curtainPanelDef = {
  kind: "curtainPanel",
  dataOnly: true,
  generateGeometry() { return null; },
  getRelationships(contract) {
    return contract.wallId
      ? [{ type: "hostedBy", target: contract.wallId }]
      : [];
  },
};

// ── Drawing tool ──

function createDrawTool(context) {
  let startPt = null;

  return {
    name: "curtain-wall-draw",
    typeKind: null,
    typeId: null,
    levelId: null,

    activate()   { startPt = null; },
    deactivate() { startPt = null; },

    onPointerDown(event, intersection) {
      if (!intersection) return;
      if (!startPt) {
        startPt = { x: intersection.point.x, z: intersection.point.z };
      } else {
        const end = { x: intersection.point.x, z: intersection.point.z };
        const cfg = context.storage.get("curtainWallConfig") || {};
        context.doc.transaction(() => {
          context.doc.add({
            kind: "curtainWall",
            startX: startPt.x, startZ: startPt.z,
            endX: end.x, endZ: end.z,
            height: cfg.height ?? 3,
            panelWidth: cfg.panelWidth ?? 1.2,
            mullionWidth: cfg.mullionWidth ?? 0.05,
            glassType: cfg.glassType ?? "clear",
            elevation: 0,
            levelId: this.levelId || null,
          });
        });
        startPt = null;
      }
    },
    onPointerMove() {},
    onPointerUp() {},
    onKeyDown(event) {
      if (event.key === "Escape") startPt = null;
    },
  };
}

// ── Sidebar configurator view ──

function createConfiguratorPanel(context) {
  const panel = context.ui.createSidebarPanel("panel-configurator", "Panel Configurator");

  const defaults = context.storage.get("curtainWallConfig") || {
    height: 3, panelWidth: 1.2, mullionWidth: 0.05, glassType: "clear",
  };

  panel.innerHTML = \`
    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">
      <label>Wall Height (m)
        <input type="number" id="cw-height" value="\${defaults.height}" step="0.1"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Panel Width (m)
        <input type="number" id="cw-panelW" value="\${defaults.panelWidth}" step="0.1"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Mullion Width (m)
        <input type="number" id="cw-mullionW" value="\${defaults.mullionWidth}" step="0.01"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Glass Type
        <select id="cw-glass"
                style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
          <option value="clear" \${defaults.glassType === "clear" ? "selected" : ""}>Clear</option>
          <option value="tinted" \${defaults.glassType === "tinted" ? "selected" : ""}>Tinted</option>
          <option value="frosted" \${defaults.glassType === "frosted" ? "selected" : ""}>Frosted</option>
          <option value="low-e" \${defaults.glassType === "low-e" ? "selected" : ""}>Low-E</option>
        </select>
      </label>
      <button id="cw-apply"
              style="padding:6px; cursor:pointer; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none;">
        Apply to New Walls
      </button>
    </div>
  \`;

  panel.querySelector("#cw-apply").addEventListener("click", () => {
    const cfg = {
      height:       parseFloat(panel.querySelector("#cw-height").value) || 3,
      panelWidth:   parseFloat(panel.querySelector("#cw-panelW").value) || 1.2,
      mullionWidth: parseFloat(panel.querySelector("#cw-mullionW").value) || 0.05,
      glassType:    panel.querySelector("#cw-glass").value || "clear",
    };
    context.storage.set("curtainWallConfig", cfg);
    context.ui.showNotification("Panel configuration saved");
  });
}

// ── Activate ──

export function activate(context) {
  context.editor.registerElement(curtainWallDef);
  context.editor.registerElement(curtainPanelDef);
  context.editor.registerTool(createDrawTool(context), {
    label: "Draw Curtain Wall",
    icon: "codicon-window",
    category: "create",
  });
  createConfiguratorPanel(context);
  context.ui.showNotification("Curtain Wall System activated");
}

export function deactivate() {}
`;

// ── 3. Duct Router ───────────────────────────────────
// MEP extension: registers duct segment and fitting elements,
// a routing tool that auto-creates fittings at bends, a duct
// auto-sizing command, and a sidebar with sizing calculator.

bundles["com.mep-solutions.duct-router"] = `
/**
 * Duct Router — HVAC duct routing with automatic fittings.
 *
 * Registers:
 *  - "ductSegment" element kind (rectangular duct between two points)
 *  - "ductFitting" element kind (elbow/tee at connection points)
 *  - "Route Duct" creation tool (click-click routing, auto-inserts fittings at bends)
 *  - "Auto-Size Ducts" command (recalculates duct dimensions based on airflow)
 *  - "Duct Sizing" sidebar view (airflow calculator + duct dimension reference)
 *
 * All placement/sizing mutations use doc.transaction() for full undo/redo.
 */

// ── Geometry ──

function createDuctBoxGeo(engine, width, height, length) {
  return new engine.BoxGeometry(width, height, length);
}

// ── Element definitions ──

const ductSegmentDef = {
  kind: "ductSegment",
  materialSlots: ["sheet-metal"],

  generateGeometry(engine, contract) {
    const sx = contract.startX ?? 0, sz = contract.startZ ?? 0;
    const ex = contract.endX ?? sx + 2, ez = contract.endZ ?? sz;
    const w = contract.width ?? 0.4;
    const h = contract.height ?? 0.3;
    const elev = contract.elevation ?? 2.8;

    const dx = ex - sx, dz = ez - sz;
    const len = Math.sqrt(dx * dx + dz * dz) || 0.1;
    const angle = Math.atan2(dx, dz);

    const geo = createDuctBoxGeo(engine, w, h, len);
    geo.rotateY(angle);
    geo.translate((sx + ex) / 2, elev, (sz + ez) / 2);
    return geo;
  },

  getRelationships(contract) {
    const rels = [];
    if (contract.levelId) rels.push({ type: "belongsToLevel", target: contract.levelId });
    return rels;
  },

  getSnapPoints(contract) {
    const sx = contract.startX ?? 0, sz = contract.startZ ?? 0;
    const ex = contract.endX ?? sx + 2, ez = contract.endZ ?? sz;
    const elev = contract.elevation ?? 2.8;
    return [
      { position: { x: sx, y: elev, z: sz }, type: "endpoint" },
      { position: { x: ex, y: elev, z: ez }, type: "endpoint" },
    ];
  },
};

const ductFittingDef = {
  kind: "ductFitting",

  generateGeometry(engine, contract) {
    const size = Math.max(contract.width ?? 0.4, contract.height ?? 0.3);
    const geo = new engine.SphereGeometry(size * 0.6, 8, 8);
    geo.translate(contract.x ?? 0, contract.elevation ?? 2.8, contract.z ?? 0);
    return geo;
  },

  getRelationships(contract) {
    const rels = [];
    if (contract.segmentA) rels.push({ type: "connectedTo", target: contract.segmentA });
    if (contract.segmentB) rels.push({ type: "connectedTo", target: contract.segmentB });
    return rels;
  },
};

// ── Routing tool ──

function createRouteTool(context) {
  const points = [];
  let prevSegmentId = null;

  return {
    name: "duct-route",
    typeKind: null,
    typeId: null,
    levelId: null,

    activate()   { points.length = 0; prevSegmentId = null; },
    deactivate() { points.length = 0; prevSegmentId = null; },

    onPointerDown(event, intersection) {
      if (!intersection) return;
      const pt = { x: intersection.point.x, z: intersection.point.z };
      points.push(pt);

      if (points.length >= 2) {
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        const cfg = context.storage.get("ductSizingConfig") || {};

        context.doc.transaction(() => {
          const segId = context.doc.add({
            kind: "ductSegment",
            startX: a.x, startZ: a.z,
            endX: b.x, endZ: b.z,
            width: cfg.width ?? 0.4,
            height: cfg.height ?? 0.3,
            elevation: cfg.elevation ?? 2.8,
            airflow: cfg.airflow ?? 500,
            levelId: this.levelId || null,
          });

          // Auto-insert fitting at bend points (3+ points means a bend)
          if (prevSegmentId && points.length >= 3) {
            context.doc.add({
              kind: "ductFitting",
              fittingType: "elbow",
              x: a.x, z: a.z,
              width: cfg.width ?? 0.4,
              height: cfg.height ?? 0.3,
              elevation: cfg.elevation ?? 2.8,
              segmentA: prevSegmentId,
              segmentB: segId,
            });
          }
          prevSegmentId = segId;
        });
      }
    },
    onPointerMove() {},
    onPointerUp() {},
    onKeyDown(event) {
      if (event.key === "Escape" || event.key === "Enter") {
        points.length = 0;
        prevSegmentId = null;
      }
    },
  };
}

// ── Auto-sizing command ──

function registerAutoSizeCommand(context) {
  context.editor.registerCommand({
    id: "auto-size-ducts",
    label: "Auto-Size Ducts",
    category: "mep",
    keybinding: "Ctrl+Shift+D",
    handler() {
      const allContracts = context.doc.all ? context.doc.all() : [];
      const ducts = allContracts.filter(c => c.kind === "ductSegment");
      if (ducts.length === 0) {
        context.ui.showNotification("No duct segments found", "warning");
        return;
      }

      context.doc.transaction(() => {
        for (const duct of ducts) {
          const airflow = duct.airflow ?? 500; // CFM
          // Simplified equal-friction sizing: area = airflow / velocity
          const velocity = 5; // m/s target
          const airflowM3s = airflow * 0.000472; // CFM → m³/s
          const area = airflowM3s / velocity;
          const aspect = 1.33; // width/height ratio
          const h = Math.sqrt(area / aspect);
          const w = area / h;
          context.doc.update(duct.id, {
            width: Math.round(w * 100) / 100,
            height: Math.round(h * 100) / 100,
          });
        }
      });
      context.ui.showNotification("Duct sizes recalculated based on airflow");
    },
  });
}

// ── Sizing sidebar ──

function createSizingSidebar(context) {
  const panel = context.ui.createSidebarPanel("duct-sizing", "Duct Sizing");

  const cfg = context.storage.get("ductSizingConfig") || {
    width: 0.4, height: 0.3, elevation: 2.8, airflow: 500,
  };

  panel.innerHTML = \`
    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">
      <h4 style="margin:0 0 4px;">Default Duct Parameters</h4>
      <label>Width (m)
        <input type="number" id="ds-w" value="\${cfg.width}" step="0.05"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Height (m)
        <input type="number" id="ds-h" value="\${cfg.height}" step="0.05"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Elevation (m)
        <input type="number" id="ds-elev" value="\${cfg.elevation}" step="0.1"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <label>Airflow (CFM)
        <input type="number" id="ds-air" value="\${cfg.airflow}" step="50"
               style="width:100%; padding:4px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);">
      </label>
      <button id="ds-save"
              style="padding:6px; cursor:pointer; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none;">
        Save Defaults
      </button>
      <hr style="border-color:var(--vscode-panel-border); margin:4px 0;">
      <h4 style="margin:0 0 4px;">Quick Reference</h4>
      <table style="width:100%; font-size:11px; border-collapse:collapse;">
        <tr style="border-bottom:1px solid var(--vscode-panel-border);">
          <th style="text-align:left; padding:2px;">Airflow (CFM)</th>
          <th style="text-align:left; padding:2px;">Size (mm)</th>
        </tr>
        <tr><td style="padding:2px;">200</td><td style="padding:2px;">250 × 200</td></tr>
        <tr><td style="padding:2px;">500</td><td style="padding:2px;">400 × 300</td></tr>
        <tr><td style="padding:2px;">1000</td><td style="padding:2px;">500 × 400</td></tr>
        <tr><td style="padding:2px;">2000</td><td style="padding:2px;">700 × 500</td></tr>
      </table>
    </div>
  \`;

  panel.querySelector("#ds-save").addEventListener("click", () => {
    const newCfg = {
      width:     parseFloat(panel.querySelector("#ds-w").value) || 0.4,
      height:    parseFloat(panel.querySelector("#ds-h").value) || 0.3,
      elevation: parseFloat(panel.querySelector("#ds-elev").value) || 2.8,
      airflow:   parseFloat(panel.querySelector("#ds-air").value) || 500,
    };
    context.storage.set("ductSizingConfig", newCfg);
    context.ui.showNotification("Duct sizing defaults saved");
  });
}

// ── Activate ──

export function activate(context) {
  context.editor.registerElement(ductSegmentDef);
  context.editor.registerElement(ductFittingDef);
  context.editor.registerTool(createRouteTool(context), {
    label: "Route Duct",
    icon: "codicon-git-merge",
    category: "create",
  });
  registerAutoSizeCommand(context);
  createSizingSidebar(context);
  context.ui.showNotification("Duct Router activated");
}

export function deactivate() {}
`;

// ── 4. Clash Detection ───────────────────────────────
// Coordination extension: reads the model, performs AABB overlap
// checks between all elements, displays results in a panel,
// and provides a tool to navigate between clashes.
// Read-only — does NOT modify the model, so undo_aware = 0.

bundles["com.openbim.clash-detection"] = `
/**
 * Clash Detection — spatial clash checking for BIM coordination.
 *
 * Registers:
 *  - "Run Clash Detection" command — scans all elements for AABB overlaps
 *  - "Clash Results" panel view — lists detected clashes with element IDs
 *  - "Navigate Clashes" tool — click through clashes to zoom to each pair
 *
 * Read-only: does not mutate the model. No undo/redo required.
 */

let clashResults = [];
let currentClashIndex = 0;

// ── AABB overlap test ──

function aabbOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

function estimateBounds(contract) {
  // Rough bounding box from contract data (element-kind-aware)
  const kind = contract.kind;
  if (kind === "wall" || kind === "steelBeam" || kind === "curtainWall" || kind === "ductSegment") {
    const sx = contract.startX ?? contract.x ?? 0;
    const sz = contract.startZ ?? contract.z ?? 0;
    const ex = contract.endX ?? sx + 1;
    const ez = contract.endZ ?? sz;
    const elev = contract.elevation ?? 0;
    const h = contract.height ?? 3;
    const t = contract.thickness ?? contract.width ?? 0.3;
    return {
      min: { x: Math.min(sx, ex) - t, y: elev, z: Math.min(sz, ez) - t },
      max: { x: Math.max(sx, ex) + t, y: elev + h, z: Math.max(sz, ez) + t },
    };
  }
  if (kind === "column") {
    const x = contract.x ?? 0, z = contract.z ?? 0;
    const elev = contract.elevation ?? 0;
    const h = contract.height ?? 3;
    const s = contract.sectionSize ?? 0.3;
    return {
      min: { x: x - s, y: elev, z: z - s },
      max: { x: x + s, y: elev + h, z: z + s },
    };
  }
  // Generic fallback — point-sized
  const x = contract.x ?? contract.startX ?? 0;
  const z = contract.z ?? contract.startZ ?? 0;
  const y = contract.elevation ?? contract.y ?? 0;
  return { min: { x: x - 0.1, y, z: z - 0.1 }, max: { x: x + 0.1, y: y + 0.1, z: z + 0.1 } };
}

// ── Run clash detection command ──

function registerClashCommand(context, refreshPanel) {
  context.editor.registerCommand({
    id: "run-clash-detect",
    label: "Run Clash Detection",
    category: "coordination",
    keybinding: "Ctrl+Shift+K",
    handler() {
      const allContracts = context.doc.all ? context.doc.all() : [];
      // Only check geometric elements (skip data-only: levels, materials, types)
      const geometric = allContracts.filter(c =>
        !c.kind.endsWith("Type") && c.kind !== "level" && c.kind !== "material"
      );

      clashResults = [];
      for (let i = 0; i < geometric.length; i++) {
        const boundsA = estimateBounds(geometric[i]);
        for (let j = i + 1; j < geometric.length; j++) {
          // Skip elements in a host/hosted relationship
          if (geometric[i].id === geometric[j].hostId || geometric[j].id === geometric[i].hostId) continue;

          const boundsB = estimateBounds(geometric[j]);
          if (aabbOverlap(boundsA, boundsB)) {
            clashResults.push({
              idA: geometric[i].id,
              kindA: geometric[i].kind,
              idB: geometric[j].id,
              kindB: geometric[j].kind,
            });
          }
        }
      }
      currentClashIndex = 0;
      refreshPanel();
      context.ui.showNotification(
        clashResults.length > 0
          ? clashResults.length + " clash(es) detected"
          : "No clashes found"
      );
    },
  });
}

// ── Results panel ──

function createResultsPanel(context) {
  const panel = context.ui.createSidebarPanel("clash-results", "Clash Results");
  let listEl;

  function refresh() {
    panel.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "padding:4px 0; font-size:12px; font-weight:600;";
    header.textContent = clashResults.length + " clash(es)";
    panel.appendChild(header);

    if (clashResults.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:8px 0; font-size:11px; color:var(--vscode-descriptionForeground);";
      empty.textContent = "Run Clash Detection (Ctrl+Shift+K) to scan the model.";
      panel.appendChild(empty);
      return;
    }

    listEl = document.createElement("div");
    listEl.style.cssText = "display:flex; flex-direction:column; gap:4px; font-size:11px;";

    clashResults.forEach((clash, idx) => {
      const row = document.createElement("div");
      row.style.cssText = "padding:4px 6px; background:var(--vscode-list-hoverBackground); cursor:pointer; border-radius:3px;";
      row.textContent = "#" + (idx + 1) + ": " + clash.kindA + " ↔ " + clash.kindB;
      row.title = clash.idA.slice(0, 8) + " vs " + clash.idB.slice(0, 8);
      row.addEventListener("click", () => {
        currentClashIndex = idx;
        context.ui.showNotification("Clash #" + (idx + 1) + ": " + clash.kindA + " vs " + clash.kindB);
      });
      listEl.appendChild(row);
    });

    panel.appendChild(listEl);
  }

  refresh();
  return refresh;
}

// ── Navigate tool ──

function createNavigateTool(context) {
  return {
    name: "clash-navigate",
    typeKind: null,
    typeId: null,
    levelId: null,

    activate() {
      if (clashResults.length > 0) {
        context.ui.showNotification(
          "Clash " + (currentClashIndex + 1) + "/" + clashResults.length +
          " — click or press N for next, P for previous"
        );
      } else {
        context.ui.showNotification("No clashes to navigate. Run Clash Detection first.", "warning");
      }
    },
    deactivate() {},
    onPointerDown() {
      if (clashResults.length === 0) return;
      currentClashIndex = (currentClashIndex + 1) % clashResults.length;
      const c = clashResults[currentClashIndex];
      context.ui.showNotification("Clash #" + (currentClashIndex + 1) + ": " + c.kindA + " ↔ " + c.kindB);
    },
    onPointerMove() {},
    onPointerUp() {},
    onKeyDown(event) {
      if (clashResults.length === 0) return;
      if (event.key === "n" || event.key === "N") {
        currentClashIndex = (currentClashIndex + 1) % clashResults.length;
      } else if (event.key === "p" || event.key === "P") {
        currentClashIndex = (currentClashIndex - 1 + clashResults.length) % clashResults.length;
      } else return;
      const c = clashResults[currentClashIndex];
      context.ui.showNotification("Clash #" + (currentClashIndex + 1) + ": " + c.kindA + " ↔ " + c.kindB);
    },
  };
}

// ── Activate ──

export function activate(context) {
  const refreshPanel = createResultsPanel(context);
  registerClashCommand(context, refreshPanel);
  context.editor.registerTool(createNavigateTool(context), {
    label: "Navigate Clashes",
    icon: "codicon-warning",
    category: "edit",
  });
  context.ui.showNotification("Clash Detection activated");
}

export function deactivate() {
  clashResults = [];
  currentClashIndex = 0;
}
`;

// ─── Extension metadata ──────────────────────────────

const extensions = [
  {
    id: "com.structura.steel-beams",
    name: "Steel Beam Tools",
    version: "1.0.0",
    description: "Adds I-beam, H-beam, and channel section elements for structural steel modeling with automatic connection detection.",
    author: "Structura Engineering",
    author_id: "author-structura",
    license: "MIT",
    category: "elements",
    tags: ["elements", "structural", "steel"],
    undo_aware: 1,
    permissions: ["doc.write", "scene.modify"],
    min_app_version: "0.1.0",
    repository_url: "https://github.com/structura/steel-beams",
    action_categories: ["structural-modeling"],
    contributes: {
      elements: [
        { kind: "steelBeamType", entrypoint: "./elements/steel-beam-type.mjs" },
        { kind: "steelBeam", entrypoint: "./elements/steel-beam.mjs" },
      ],
      tools: [
        { id: "steel-beam-place", label: "Place Steel Beam", icon: "codicon-symbol-structure", entrypoint: "./tools/place-beam.mjs", category: "create" },
      ],
      commands: [
        { id: "mirror-beam", label: "Mirror Beam", keybinding: "Ctrl+Shift+M" },
        { id: "rotate-beam", label: "Rotate Beam 90°", keybinding: "Ctrl+Shift+R" },
      ],
    },
    readme: "# Steel Beam Tools\n\nParametric structural steel beam elements (I-beam section) with a placement tool and mirror/rotate commands.\n\n## Contributions\n- **steelBeamType** — type element with flange and web dimension parameters\n- **steelBeam** — instance element with start/end points and parametric I-section geometry\n- **Place Steel Beam** tool — two-click placement on the work plane\n- **Mirror Beam** command (Ctrl+Shift+M) — swaps beam start/end points\n- **Rotate Beam 90°** command (Ctrl+Shift+R) — rotates beam around its midpoint\n\nAll mutations are wrapped in `doc.transaction()` for full undo/redo support.",
    downloads: 487,
    extraVersions: [
      { version: "0.9.0", changelog: "Added snap points at endpoints and midpoint", min_app_version: "0.1.0", published_at: "2026-01-20 14:30:00" },
    ],
  },
  {
    id: "com.facade-studio.curtain-wall",
    name: "Curtain Wall System",
    version: "1.3.0",
    description: "Parametric curtain wall with configurable panel width, mullion profiles, and glass types. Includes a sidebar configurator.",
    author: "Facade Studio",
    author_id: "author-facade-studio",
    license: "MIT",
    category: "elements",
    tags: ["elements", "architectural", "facade"],
    undo_aware: 1,
    permissions: ["doc.write", "scene.modify"],
    min_app_version: "0.1.0",
    repository_url: "https://github.com/facade-studio/curtain-wall",
    action_categories: ["architectural-modeling"],
    contributes: {
      elements: [
        { kind: "curtainWall", entrypoint: "./elements/curtain-wall.mjs" },
        { kind: "curtainPanel", entrypoint: "./elements/curtain-panel.mjs" },
      ],
      tools: [
        { id: "curtain-wall-draw", label: "Draw Curtain Wall", icon: "codicon-window", entrypoint: "./tools/draw-wall.mjs", category: "create" },
      ],
      views: [
        { id: "panel-configurator", label: "Panel Configurator", location: "sidebar", entrypoint: "./views/configurator.mjs" },
      ],
    },
    readme: "# Curtain Wall System\n\nDraw parametric curtain walls with configurable panel grids, mullion profiles, and glazing materials.\n\n## Contributions\n- **curtainWall** — line-based element that auto-subdivides into panels with mullion verticals and glass infills\n- **curtainPanel** — hosted sub-element for individual panel overrides\n- **Draw Curtain Wall** tool — two-click placement\n- **Panel Configurator** sidebar — set wall height, panel width, mullion width, and glass type (clear/tinted/frosted/low-E)\n\nConfiguration is persisted to extension storage and applied to new walls.",
    downloads: 634,
    extraVersions: [
      { version: "1.0.0", changelog: "Initial release with basic curtain wall", min_app_version: "0.1.0", published_at: "2025-10-01 09:00:00" },
    ],
  },
  {
    id: "com.mep-solutions.duct-router",
    name: "Duct Router",
    version: "2.0.0",
    description: "HVAC duct routing with automatic fitting insertion at bends, airflow-based sizing, and a duct sizing sidebar.",
    author: "MEP Solutions",
    author_id: "author-mep-solutions",
    license: "MIT",
    category: "tools",
    tags: ["tools", "mep", "hvac"],
    undo_aware: 1,
    permissions: ["doc.write", "scene.modify"],
    min_app_version: "0.1.0",
    repository_url: "https://github.com/mep-solutions/duct-router",
    action_categories: ["mep-modeling"],
    contributes: {
      elements: [
        { kind: "ductSegment", entrypoint: "./elements/duct-segment.mjs" },
        { kind: "ductFitting", entrypoint: "./elements/duct-fitting.mjs" },
      ],
      tools: [
        { id: "duct-route", label: "Route Duct", icon: "codicon-git-merge", entrypoint: "./tools/route-duct.mjs", category: "create" },
      ],
      commands: [
        { id: "auto-size-ducts", label: "Auto-Size Ducts", keybinding: "Ctrl+Shift+D" },
      ],
      views: [
        { id: "duct-sizing", label: "Duct Sizing", location: "sidebar", entrypoint: "./views/sizing.mjs" },
      ],
    },
    readme: "# Duct Router\n\nRoute HVAC ducts through the model with automatic fitting generation at bends.\n\n## Contributions\n- **ductSegment** — rectangular duct between two points with width/height/airflow properties\n- **ductFitting** — elbow fitting auto-inserted at routing bends, connected to adjacent segments\n- **Route Duct** tool — multi-click routing; fittings placed automatically at bends; press Esc/Enter to finish\n- **Auto-Size Ducts** command (Ctrl+Shift+D) — recalculates width/height for all ducts based on airflow using equal-friction sizing\n- **Duct Sizing** sidebar — set default width, height, elevation, airflow; quick reference table for common sizes\n\nAll routing and sizing mutations are wrapped in `doc.transaction()`.",
    downloads: 1342,
    extraVersions: [
      { version: "1.0.0", changelog: "Initial release with basic rectangular duct routing", min_app_version: "0.1.0", published_at: "2025-09-10 08:00:00" },
      { version: "1.5.0", changelog: "Added auto-sizing and duct sizing sidebar", min_app_version: "0.1.0", published_at: "2025-12-15 16:00:00" },
    ],
  },
  {
    id: "com.openbim.clash-detection",
    name: "Clash Detection",
    version: "1.0.0",
    description: "Detect spatial clashes between building elements using AABB overlap checking. Navigate through issues in a results panel.",
    author: "OpenBIM Lab",
    author_id: "author-openbim-lab",
    license: "Apache-2.0",
    category: "analysis",
    tags: ["analysis", "coordination", "clash"],
    undo_aware: 0,
    permissions: ["doc.read", "scene.modify"],
    min_app_version: "0.1.0",
    repository_url: "https://github.com/openbim-lab/clash-detection",
    action_categories: ["coordination"],
    contributes: {
      tools: [
        { id: "clash-navigate", label: "Navigate Clashes", icon: "codicon-warning", entrypoint: "./tools/navigate.mjs", category: "edit" },
      ],
      commands: [
        { id: "run-clash-detect", label: "Run Clash Detection", keybinding: "Ctrl+Shift+K" },
      ],
      views: [
        { id: "clash-results", label: "Clash Results", location: "panel", entrypoint: "./views/results.mjs" },
      ],
    },
    readme: "# Clash Detection\n\nScan all geometric elements for AABB (axis-aligned bounding box) overlaps.\n\n## Contributions\n- **Run Clash Detection** command (Ctrl+Shift+K) — scans model, builds list of clashing element pairs, skips host/hosted pairs\n- **Clash Results** panel — lists all detected clashes with element kinds; click a row to highlight\n- **Navigate Clashes** tool — cycle through clashes with N/P keys or click\n\nRead-only: does not modify the model. Undo/redo is not required.",
    downloads: 2156,
  },
];

// ─── Insert extensions ───────────────────────────────

const insertExt = db.prepare(
  `INSERT INTO extensions
     (id, name, version, description, author, author_id, license, manifest, readme,
      downloads, rating_sum, rating_count, tags, entry_point, bundle_hash, permissions,
      min_app_version, icon_url, repository_url, category, undo_aware, action_categories)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertVersion = db.prepare(
  `INSERT INTO versions (extension_id, version, bundle_path, manifest, bundle_hash, changelog, min_app_version, published_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

for (const ext of extensions) {
  // Write bundle file
  const bundleCode = bundles[ext.id];
  const { filePath, hash } = writeBundleFile(ext.id, ext.version, bundleCode);

  const manifest = {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    description: ext.description,
    author: ext.author,
    author_id: ext.author_id,
    license: ext.license,
    main: `/api/extensions/${ext.id}/download`,
    contributes: ext.contributes,
    undoAware: !!ext.undo_aware,
    permissions: ext.permissions,
    min_app_version: ext.min_app_version,
    category: ext.category,
    actionCategories: ext.action_categories,
  };

  insertExt.run(
    ext.id, ext.name, ext.version, ext.description, ext.author, ext.author_id,
    ext.license, JSON.stringify(manifest), ext.readme,
    ext.downloads, 0, 0,
    JSON.stringify(ext.tags), manifest.main, hash,
    JSON.stringify(ext.permissions), ext.min_app_version, "",
    ext.repository_url, ext.category, ext.undo_aware ? 1 : 0,
    JSON.stringify(ext.action_categories || [])
  );

  // Current version
  insertVersion.run(
    ext.id, ext.version, filePath, JSON.stringify(manifest),
    hash, "", ext.min_app_version, new Date().toISOString().replace("T", " ").slice(0, 19)
  );

  // Historical versions (reuse current bundle for older versions in demo)
  if (ext.extraVersions) {
    for (const v of ext.extraVersions) {
      const { filePath: vPath, hash: vHash } = writeBundleFile(ext.id, v.version, bundleCode);
      const vManifest = { ...manifest, version: v.version };
      insertVersion.run(
        ext.id, v.version, vPath, JSON.stringify(vManifest),
        vHash, v.changelog, v.min_app_version, v.published_at
      );
    }
  }

  // Sync contributions table
  syncContributions(db, ext.id, manifest);
}

// ─── Ratings ─────────────────────────────────────────

const ratingData = [
  // Steel Beams
  { ext: "com.structura.steel-beams", user: "user-john-doe", rating: 5, review: "Essential for structural modeling. Great I-beam geometry and snap points." },
  { ext: "com.structura.steel-beams", user: "user-maria-chen", rating: 4, review: "Works well. Mirror and rotate commands save a lot of time." },
  { ext: "com.structura.steel-beams", user: "user-ahmed-hassan", rating: 5, review: "Perfect undo integration — every placement rolls back cleanly." },
  // Curtain Wall
  { ext: "com.facade-studio.curtain-wall", user: "user-john-doe", rating: 4, review: "Panel configurator sidebar is very intuitive." },
  { ext: "com.facade-studio.curtain-wall", user: "user-li-wei", rating: 5, review: "Best curtain wall tool I've used. Glass type options are great." },
  { ext: "com.facade-studio.curtain-wall", user: "user-sarah-jones", rating: 4, review: "Mullion auto-spacing works perfectly." },
  // Duct Router
  { ext: "com.mep-solutions.duct-router", user: "user-ahmed-hassan", rating: 5, review: "Auto-fitting insertion at bends is a game changer." },
  { ext: "com.mep-solutions.duct-router", user: "user-john-doe", rating: 5, review: "Finally a proper duct routing tool with sizing calculations." },
  { ext: "com.mep-solutions.duct-router", user: "user-emma-garcia", rating: 4, review: "Sizing sidebar reference table is very helpful on-the-go." },
  { ext: "com.mep-solutions.duct-router", user: "user-maria-chen", rating: 5, review: "Best MEP extension. Auto-size command recalculated 50 ducts in a second." },
  // Clash Detection
  { ext: "com.openbim.clash-detection", user: "user-john-doe", rating: 5, review: "Critical for coordination. Fast AABB checking." },
  { ext: "com.openbim.clash-detection", user: "user-li-wei", rating: 4, review: "Navigate-to-clash with N/P keys is very efficient." },
  { ext: "com.openbim.clash-detection", user: "user-sarah-jones", rating: 5, review: "Reliable clash panel. Caught 12 MEP-structural overlaps." },
];

const insertRating = db.prepare(
  "INSERT INTO ratings (extension_id, user_id, rating, review) VALUES (?, ?, ?, ?)"
);

const ratingSums = {};
const ratingCounts = {};

for (const r of ratingData) {
  insertRating.run(r.ext, r.user, r.rating, r.review);
  ratingSums[r.ext] = (ratingSums[r.ext] || 0) + r.rating;
  ratingCounts[r.ext] = (ratingCounts[r.ext] || 0) + 1;
}

const updateRating = db.prepare(
  "UPDATE extensions SET rating_sum = ?, rating_count = ? WHERE id = ?"
);
for (const [extId, sum] of Object.entries(ratingSums)) {
  updateRating.run(sum, ratingCounts[extId], extId);
}

// ─── Summary ─────────────────────────────────────────

const extCount = db.prepare("SELECT COUNT(*) as c FROM extensions").get().c;
const authorCount = db.prepare("SELECT COUNT(*) as c FROM authors").get().c;
const versionCount = db.prepare("SELECT COUNT(*) as c FROM versions").get().c;
const contribCount = db.prepare("SELECT COUNT(*) as c FROM extension_contributions").get().c;
const ratingCount = db.prepare("SELECT COUNT(*) as c FROM ratings").get().c;

console.log("Seed complete:");
console.log(`  ${authorCount} authors`);
console.log(`  ${extCount} extensions`);
console.log(`  ${versionCount} version records`);
console.log(`  ${contribCount} contributions`);
console.log(`  ${ratingCount} ratings`);

// List generated bundle files
console.log("\nBundle files:");
for (const ext of extensions) {
  const versions = [ext.version, ...(ext.extraVersions || []).map(v => v.version)];
  for (const v of versions) {
    console.log(`  store-data/packages/${ext.id}/${v}/bundle.mjs`);
  }
}
