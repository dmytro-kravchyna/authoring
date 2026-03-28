import * as THREE from "three";
import type { BimDocument } from "../core/document";
import type { MaterialContract } from "../elements/material";
import type { FragmentManager } from "./manager";
import { addTriplanarUVs } from "../utils/uv-projection";

/**
 * Applies AI-generated textures to fragment materials using the fragments
 * library's hook system (materials.list.onItemSet + tiles.onItemSet).
 *
 * Based on: https://docs.thatopen.com/Tutorials/Fragments/Fragments/FragmentsModels/Materials
 */
export class TextureApplicator {
  /** Cache: materialContractId → THREE.MeshStandardMaterial with loaded texture */
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  /** Cache: materialContractId → THREE.Texture (to avoid re-creating) */
  private textureCache = new Map<string, THREE.Texture>();
  private hooked = false;
  /** Re-entry guard: prevents onItemSet → set → onItemSet infinite loop */
  private settingMaterial = false;

  /**
   * Register hooks on the fragment manager's material and tile systems.
   * Call once after FragmentManager is created.
   */
  setupHooks(doc: BimDocument, mgr: FragmentManager): void {
    if (this.hooked) return;
    this.hooked = true;

    // Hook: intercept material assignment and replace with textured version.
    // Only applies to plain materials whose color matches a MaterialContract
    // that has textureData. Non-textured materials pass through unchanged.
    mgr.fragments.models.materials.list.onItemSet.add(
      ({ key: id, value: material }) => {
        // Guard: skip re-entry (our own set() call triggers this again)
        if (this.settingMaterial) return;
        // Skip materials that already have a texture map (already processed)
        if (!material || (material as any).map) return;
        if (!(material as any).color) return;

        const c = (material as any).color as THREE.Color;
        const contract = this.findMatchingContract(c, doc);
        if (!contract) return;

        const texturedMat = this.getOrCreateTexturedMaterial(contract);
        // Replace the fragment material with our textured version
        this.settingMaterial = true;
        try {
          mgr.fragments.models.materials.list.set(id, texturedMat as any);
        } finally {
          this.settingMaterial = false;
        }
      }
    );

    // Hook: add UV coordinates to tile geometries for texture mapping
    mgr.fragments.models.list.onItemSet.add(({ value: model }) => {
      model.tiles.onItemSet.add(({ value: mesh }) => {
        const geometry = (mesh as any).geometry as THREE.BufferGeometry | undefined;
        if (geometry && !geometry.attributes.uv) {
          addTriplanarUVs(geometry);
        }
      });
    });
  }

  /**
   * Apply textures to all fragment meshes whose source material has textureData.
   * Call this after every fragment update (mgr.update).
   */
  applyTextures(doc: BimDocument, mgr: FragmentManager, _scene: THREE.Scene): void {
    // Collect all materials with textures, keyed by their RGB color
    const texturedMaterials = this.collectTexturedMaterials(doc);
    if (texturedMaterials.size === 0) return;

    // Walk both base AND delta model meshes (edited elements live in delta)
    const base = mgr.fragments.models.list.get(mgr.modelId);
    if (!base) return;
    const deltaId = (base as any).deltaModelId;
    const delta = deltaId ? mgr.fragments.models.list.get(deltaId) : null;
    const models = [base, delta].filter(Boolean);

    for (const model of models) {
      for (const child of model!.object.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const replacements: THREE.Material[] = [];
        let changed = false;

        for (const mat of materials) {
          // Skip materials without color or already textured (map present)
          if (!mat || !(mat as any).color || (mat as any).map) {
            replacements.push(mat);
            continue;
          }

          const c = (mat as any).color as THREE.Color;
          const contract = this.findMatchingContract(c, doc, texturedMaterials);

          if (contract) {
            if (mesh.geometry && !mesh.geometry.attributes.uv) {
              addTriplanarUVs(mesh.geometry);
            }
            replacements.push(this.getOrCreateTexturedMaterial(contract));
            changed = true;
          } else {
            replacements.push(mat);
          }
        }

        if (changed) {
          mesh.material = replacements.length === 1 ? replacements[0] : replacements;
        }
      }
    }
  }

  /** Invalidate cache for a specific material (call when textureData changes). */
  invalidate(materialId: string): void {
    this.materialCache.delete(materialId);
    const tex = this.textureCache.get(materialId);
    if (tex) {
      tex.dispose();
      this.textureCache.delete(materialId);
    }
  }

  /** Collect all MaterialContracts that have textureData, keyed by sRGB color. */
  private collectTexturedMaterials(doc: BimDocument): Map<string, MaterialContract> {
    const result = new Map<string, MaterialContract>();
    for (const [, contract] of doc.contracts) {
      if (contract.kind === "material" && (contract as MaterialContract).textureData) {
        const mat = contract as MaterialContract;
        const key = this.colorKey(mat.color[0], mat.color[1], mat.color[2]);
        result.set(key, mat);
      }
    }
    return result;
  }

  /**
   * Find a MaterialContract matching a THREE.Color from a fragment material.
   * The fragment library stores colors as sRGB bytes but THREE.js materials
   * use linear RGB internally, so we convert linear → sRGB before matching.
   */
  private findMatchingContract(
    linearColor: THREE.Color,
    doc: BimDocument,
    precomputed?: Map<string, MaterialContract>
  ): MaterialContract | undefined {
    const texturedMaterials = precomputed ?? this.collectTexturedMaterials(doc);
    if (texturedMaterials.size === 0) return undefined;

    // Convert the fragment material's linear color to sRGB to match contract values
    const srgb = linearColor.clone().convertLinearToSRGB();
    const key = this.colorKey(srgb.r, srgb.g, srgb.b);

    let contract = texturedMaterials.get(key);
    if (contract) return contract;

    // Tolerance fallback: match within +-2 per channel to handle conversion rounding
    const mr = Math.floor(srgb.r * 255);
    const mg = Math.floor(srgb.g * 255);
    const mb = Math.floor(srgb.b * 255);
    for (const [k, c] of texturedMaterials) {
      const [kr, kg, kb] = k.split(":").map(Number);
      if (Math.abs(kr - mr) <= 2 && Math.abs(kg - mg) <= 2 && Math.abs(kb - mb) <= 2) {
        return c;
      }
    }
    return undefined;
  }

  private getOrCreateTexturedMaterial(contract: MaterialContract): THREE.MeshStandardMaterial {
    const cached = this.materialCache.get(contract.id);
    if (cached) return cached;

    const texture = this.loadTexture(contract);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      color: new THREE.Color(1, 1, 1),
      roughness: 0.7,
      metalness: 0.05,
      transparent: contract.opacity < 1,
      opacity: contract.opacity,
      side: contract.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });

    this.materialCache.set(contract.id, mat);
    return mat;
  }

  private loadTexture(contract: MaterialContract): THREE.Texture {
    const cached = this.textureCache.get(contract.id);
    if (cached) return cached;

    const img = new Image();
    img.src = contract.textureData!;

    const texture = new THREE.Texture(img);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    img.onload = () => {
      texture.needsUpdate = true;
    };

    if (img.complete) {
      texture.needsUpdate = true;
    }

    this.textureCache.set(contract.id, texture);
    return texture;
  }

  /** Create a color key from sRGB 0-1 values. */
  private colorKey(r: number, g: number, b: number): string {
    return `${Math.floor(r * 255)}:${Math.floor(g * 255)}:${Math.floor(b * 255)}`;
  }
}
