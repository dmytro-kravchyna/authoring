/**
 * @bim-ide/extension-sdk — SDK for building BIM IDE extensions.
 *
 * Extensions implement the ExtensionModule interface and declare
 * their contributions in a bim-extension.json manifest.
 */

import type {
  BimDocument,
  ElementRegistry,
  ElementTypeDefinition,
  Tool,
  ToolDescriptor,
} from "@bim-ide/viewer";
import type * as THREE from "three";

// ── Extension Manifest ────────────────────────────────

export interface ExtensionManifest {
  /** Unique extension ID (reverse domain notation) */
  id: string;
  /** Display name */
  name: string;
  /** Semantic version */
  version: string;
  /** Short description */
  description: string;
  /** Author name */
  author: string;
  /** License identifier */
  license?: string;
  /** Contribution declarations */
  contributes?: ExtensionContributions;
  /** Main entry point (ESM bundle) */
  main: string;
}

export interface ExtensionContributions {
  elements?: ElementContribution[];
  tools?: ToolContribution[];
  commands?: CommandContribution[];
  views?: ViewContribution[];
  wiki?: WikiContribution[];
  aiSkills?: AISkillContribution[];
}

export interface ElementContribution {
  kind: string;
  entrypoint: string;
}

export interface ToolContribution {
  id: string;
  label: string;
  icon?: string;
  entrypoint: string;
}

export interface CommandContribution {
  id: string;
  label: string;
  keybinding?: string;
}

export interface ViewContribution {
  id: string;
  label: string;
  location: "sidebar" | "panel";
  entrypoint: string;
}

export interface WikiContribution {
  path: string;
  category: string;
  title: string;
}

export interface AISkillContribution {
  id: string;
  name: string;
  description?: string;
  entrypoint: string;
}

// ── Extension Context ─────────────────────────────────

export interface Disposable {
  dispose(): void;
}

export interface Command {
  id: string;
  label: string;
  category?: string;
  keybinding?: string;
  handler: () => void | Promise<void>;
}

export interface SelectionAPI {
  /** Get all currently selected contracts */
  getAll(): any[];
  /** Get IDs of all currently selected contracts */
  getIds(): string[];
  /** Get the first (primary) selected contract, or null */
  getFirst(): any | null;
  /** Clear the current selection */
  clear(): void;
}

export interface ExtensionContext {
  /** Access to the BIM document */
  readonly doc: BimDocument;
  /** Access to the element registry */
  readonly registry: ElementRegistry;
  /** Access to the Three.js scene */
  readonly scene: THREE.Scene;
  /** THREE.js module for creating geometry, materials, meshes, etc. */
  readonly THREE: typeof THREE;

  /** Selection state — query and clear the current element selection */
  readonly selection: SelectionAPI;

  /** Raycasting utilities for element picking */
  readonly raycast: {
    /** Raycast onto the active work plane, returns [x,y,z] or null */
    ground(event: PointerEvent): [number, number, number] | null;
    /** Raycast against scene objects, returns intersections with [x,y,z] points */
    objects(event: PointerEvent, objects?: THREE.Object3D[]): Array<{
      point: [number, number, number];
      distance: number;
      object: THREE.Object3D;
    }>;
  };

  /** Mutation APIs */
  readonly editor: {
    registerElement(def: ElementTypeDefinition): void;
    registerTool(tool: Tool, descriptor: Omit<ToolDescriptor, "tool">): void;
    registerCommand(cmd: Command): void;
  };

  /** UI APIs */
  readonly ui: {
    createSidebarPanel(id: string, title: string): HTMLElement;
    showNotification(message: string, severity?: "info" | "warning" | "error"): void;
  };

  /** Per-extension storage (persisted to localStorage) */
  readonly storage: {
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };

  /** Disposables — cleaned up when extension deactivates */
  subscriptions: Disposable[];
}

// ── Extension Module ──────────────────────────────────

export interface ExtensionModule {
  /** Called when the extension is activated */
  activate(context: ExtensionContext): void | Promise<void>;
  /** Called when the extension is deactivated (optional) */
  deactivate?(): void | Promise<void>;
}

// ── AI Skill ──────────────────────────────────────────

export interface AISkill {
  id: string;
  name: string;
  description: string;
  /** System prompt content that teaches the AI about this domain */
  systemPrompt: string;
  /** API reference snippets the AI should know */
  apiReference?: string;
  /** Example input/output pairs for few-shot learning */
  examples?: Array<{ input: string; output: string }>;
}
