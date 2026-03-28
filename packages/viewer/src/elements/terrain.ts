import * as THREE from "three";
import type { ElementTypeDefinition, ElementRelationship } from "../core/registry";
import type { BaseContract, ContractId } from "../core/contracts";
import { TerrainHandles } from "../handles/terrain-handles";
import { generateTerrainGeometry } from "../generators/terrain";

// ── Shared vertex selection state (handles ↔ properties panel) ───

/** Selected vertex indices for the currently active terrain. Written by TerrainHandles, read by renderCustomProperties. */
export const terrainVertexSelection = {
  contractId: null as string | null,
  selected: new Set<number>(),
  /** Called by properties panel to refresh when selection changes. */
  onChanged: null as (() => void) | null,
};

// ── Contract ──────────────────────────────────────────────────────

export interface TerrainContract extends BaseContract {
  kind: "terrain";
  typeId: ContractId;
  points: [number, number, number][]; // elevation points, ≥3
}

export function isTerrain(c: BaseContract): c is TerrainContract {
  return c.kind === "terrain";
}

export function createTerrain(
  points: [number, number, number][],
  typeId: ContractId
): TerrainContract {
  return {
    id: crypto.randomUUID(),
    kind: "terrain",
    typeId,
    points,
  };
}

// ── Vertex section renderer ──────────────────────────────────────

import type { PropertyFieldHelpers } from "../core/registry";

function renderVertexSection(
  terrain: TerrainContract,
  container: HTMLElement,
  helpers: PropertyFieldHelpers,
  sel: typeof terrainVertexSelection
) {
  const selectedIndices = [...sel.selected].filter(i => i >= 0 && i < terrain.points.length);
  const count = selectedIndices.length;

  if (count === 0) {
    const hint = document.createElement("div");
    hint.style.cssText = "font-size: 11px; color: #666; padding: 4px 0;";
    hint.textContent = `${terrain.points.length} points \u2014 click handles to select`;
    container.appendChild(hint);
    return;
  }

  const label = document.createElement("div");
  label.style.cssText = "font-size: 11px; color: #aaa; padding: 2px 0;";
  label.textContent = count === 1
    ? `Point ${selectedIndices[0] + 1} selected`
    : `${count} points selected`;
  container.appendChild(label);

  // Determine common height (or empty if mixed)
  const heights = selectedIndices.map(i => terrain.points[i][1]);
  const allSame = heights.every(h => Math.abs(h - heights[0]) < 0.001);
  const displayValue = allSame ? heights[0] : NaN;

  const row = document.createElement("label");
  row.textContent = "Height";
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.1";
  input.value = allSame ? displayValue.toFixed(2) : "";
  input.placeholder = allSame ? "" : "mixed";
  input.style.cssText = "width: 80px;";
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    if (isNaN(v)) return;
    const newPoints = [...terrain.points];
    for (const idx of selectedIndices) {
      newPoints[idx] = [newPoints[idx][0], v, newPoints[idx][2]];
    }
    helpers.debouncedUpdate(terrain.id, { points: newPoints });
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  row.appendChild(input);
  container.appendChild(row);
}

// ── Element definition ────────────────────────────────────────────

export const terrainElement: ElementTypeDefinition = {
  kind: "terrain",
  typeKind: "terrainType",

  // Called when element is deselected or removed — clean up shared state
  onRemove() {
    terrainVertexSelection.contractId = null;
    terrainVertexSelection.selected.clear();
    terrainVertexSelection.onChanged = null;
  },

  generateGeometry(_engine, contract) {
    const terrain = contract as TerrainContract;
    return generateTerrainGeometry(terrain.points);
  },

  getVoidGeometry(_engine, contract) {
    const terrain = contract as TerrainContract;
    const geo = generateTerrainGeometry(terrain.points);
    if (geo.getAttribute("position")?.count === 0) return null;
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
  },

  getRelationships(contract, _doc) {
    const terrain = contract as TerrainContract;
    const rels: ElementRelationship[] = [];
    if (terrain.typeId) {
      rels.push({ type: "instanceOf", targetId: terrain.typeId });
    }
    if (terrain.levelId) {
      rels.push({ type: "belongsToLevel", targetId: terrain.levelId as string });
    }
    return rels;
  },

  getSnapPoints(contract) {
    const terrain = contract as TerrainContract;
    return terrain.points.map((p) => ({
      position: new THREE.Vector3(...p),
      type: "endpoint" as const,
    }));
  },

  createHandles(scene, doc, _engine, contract) {
    return new TerrainHandles(scene, doc, contract as TerrainContract);
  },

  renderCustomProperties(contract, container, helpers) {
    const terrain = contract as TerrainContract;
    const sel = terrainVertexSelection;

    // Wire refresh: when handle selection changes, re-render properties
    sel.onChanged = () => {
      // Re-render by clearing and re-calling this function
      const section = container.querySelector("[data-terrain-vertices]");
      if (section) {
        section.innerHTML = "";
        renderVertexSection(terrain, section as HTMLElement, helpers, sel);
      }
    };

    const section = document.createElement("div");
    section.setAttribute("data-terrain-vertices", "");
    section.style.cssText = "margin-top: 8px;";
    container.appendChild(section);
    renderVertexSection(terrain, section, helpers, sel);
  },

  applyTranslation(contract, delta) {
    const terrain = contract as TerrainContract;
    return {
      ...terrain,
      points: terrain.points.map((p) => [
        p[0] + delta[0],
        p[1] + delta[1],
        p[2] + delta[2],
      ] as [number, number, number]),
    };
  },

  applyRotation(contract, angle, pivot) {
    const terrain = contract as TerrainContract;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return {
      ...terrain,
      points: terrain.points.map((p) => {
        const dx = p[0] - pivot[0], dz = p[2] - pivot[2];
        return [pivot[0] + dx * cos - dz * sin, p[1], pivot[2] + dx * sin + dz * cos] as [number, number, number];
      }),
    };
  },

  remapIds(contract) {
    return contract; // no internal ID references
  },
};
