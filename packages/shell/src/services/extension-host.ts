/**
 * ExtensionHost — manages the lifecycle of BIM IDE extensions.
 *
 * Loads/unloads extensions via dynamic import(),
 * creates scoped ExtensionContext for each extension,
 * and manages cleanup on deactivation.
 */

import * as THREE from "three";
import type { ViewerInstance, Tool } from "@bim-ide/viewer";
import type {
  ExtensionManifest,
  ExtensionModule,
  ExtensionContext,
  Disposable,
  Command,
} from "@bim-ide/extension-sdk";

interface LoadedExtension {
  manifest: ExtensionManifest;
  module: ExtensionModule;
  context: ExtensionContext;
  registeredTools: Tool[];
}

export class ExtensionHost {
  private extensions = new Map<string, LoadedExtension>();
  private viewer: ViewerInstance;
  private commands = new Map<string, Command>();
  private disabledInfo = new Map<string, { manifest: ExtensionManifest; bundleUrl: string }>();
  private commandListeners: Array<() => void> = [];

  constructor(viewer: ViewerInstance) {
    this.viewer = viewer;
  }

  onCommandsChanged(fn: () => void): () => void {
    this.commandListeners.push(fn);
    return () => {
      const idx = this.commandListeners.indexOf(fn);
      if (idx >= 0) this.commandListeners.splice(idx, 1);
    };
  }

  private fireCommandsChanged() {
    for (const fn of this.commandListeners) fn();
  }

  async loadExtension(manifest: ExtensionManifest, bundleUrl: string): Promise<void> {
    if (this.extensions.has(manifest.id)) {
      await this.unloadExtension(manifest.id);
    }

    // Dynamic import of the extension bundle
    const module = (await import(/* @vite-ignore */ bundleUrl)) as ExtensionModule;

    // Create scoped context with tool tracking
    const registeredTools: Tool[] = [];
    const context = this.createContext(manifest, registeredTools);

    // Activate
    await module.activate(context);

    this.extensions.set(manifest.id, { manifest, module, context, registeredTools });
    this.fireCommandsChanged();
    console.log(`[ExtensionHost] Loaded: ${manifest.name} v${manifest.version}`);
  }

  async unloadExtension(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) return;

    // Deactivate
    await ext.module.deactivate?.();

    // Dispose all subscriptions
    for (const sub of ext.context.subscriptions) {
      sub.dispose();
    }

    // Remove registered tools from viewer
    for (const tool of ext.registeredTools) {
      this.viewer.unregisterTool(tool);
    }

    // Remove registered commands
    if (ext.manifest.contributes?.commands) {
      for (const cmd of ext.manifest.contributes.commands) {
        this.commands.delete(`${ext.manifest.id}.${cmd.id}`);
      }
    }

    this.extensions.delete(id);
    this.fireCommandsChanged();
    console.log(`[ExtensionHost] Unloaded: ${ext.manifest.name}`);
  }

  async disableExtension(id: string, bundleUrl: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) return;
    this.disabledInfo.set(id, { manifest: ext.manifest, bundleUrl });
    await this.unloadExtension(id);
  }

  async enableExtension(id: string): Promise<void> {
    const info = this.disabledInfo.get(id);
    if (!info) return;
    this.disabledInfo.delete(id);
    await this.loadExtension(info.manifest, info.bundleUrl);
  }

  isDisabled(id: string): boolean {
    return this.disabledInfo.has(id);
  }

  getLoadedExtensions(): ExtensionManifest[] {
    return [...this.extensions.values()].map((e) => e.manifest);
  }

  getCommands(): Command[] {
    return [...this.commands.values()];
  }

  async executeCommand(id: string): Promise<void> {
    const cmd = this.commands.get(id);
    if (cmd) await cmd.handler();
  }

  private createContext(manifest: ExtensionManifest, registeredTools: Tool[]): ExtensionContext {
    const viewer = this.viewer;
    const commands = this.commands;
    const fireCommandsChanged = () => this.fireCommandsChanged();
    const subscriptions: Disposable[] = [];
    const storagePrefix = `bim-ext-${manifest.id}-`;

    return {
      get doc() {
        return viewer.doc;
      },
      get registry() {
        return viewer.registry;
      },
      get scene() {
        return viewer.scene;
      },

      selection: {
        getAll() {
          return viewer.selectTool.getSelectedContractsAll();
        },
        getIds() {
          return viewer.selectTool.getSelectedIds();
        },
        getFirst() {
          return viewer.selectTool.getSelectedContract();
        },
        clear() {
          viewer.selectTool.clearSelection();
        },
      },

      editor: {
        registerElement(def) {
          // Wrap generateGeometry so extensions receive THREE as `engine`
          // (extensions expect THREE constructors; the registry passes GeometryEngine)
          const origGen = def.generateGeometry;
          const wrapped = {
            ...def,
            generateGeometry(_engine: unknown, contract: any, doc: any, options?: any) {
              return origGen(THREE as any, contract, doc, options);
            },
          };
          viewer.registerElement(wrapped);
        },
        registerTool(tool, descriptor) {
          // Pad missing lifecycle methods with no-ops so ToolManager
          // doesn't crash on extension tools that omit optional handlers.
          const noop = () => {};
          const safeTool = {
            ...tool,
            activate: tool.activate?.bind(tool) ?? noop,
            deactivate: tool.deactivate?.bind(tool) ?? noop,
            onPointerDown: tool.onPointerDown?.bind(tool) ?? noop,
            onPointerMove: tool.onPointerMove?.bind(tool) ?? noop,
            onPointerUp: tool.onPointerUp?.bind(tool) ?? noop,
            onKeyDown: tool.onKeyDown?.bind(tool) ?? noop,
          };
          viewer.registerTool(safeTool, descriptor.label, descriptor.category as "create" | "edit" | undefined);
          registeredTools.push(safeTool);
        },
        registerCommand(cmd) {
          const fullId = `${manifest.id}.${cmd.id}`;
          commands.set(fullId, { ...cmd, id: fullId });
          fireCommandsChanged();
        },
      },

      ui: {
        createSidebarPanel(_id, _title) {
          // Returns a container element for the extension to render into
          const panel = document.createElement("div");
          panel.style.padding = "8px";
          return panel;
        },
        showNotification(message, severity = "info") {
          console.log(`[${manifest.name}] ${severity}: ${message}`);
          viewer.setStatus(`[${manifest.name}] ${message}`);
        },
      },

      storage: {
        get<T = unknown>(key: string): T | undefined {
          const val = localStorage.getItem(storagePrefix + key);
          return val ? JSON.parse(val) : undefined;
        },
        set(key: string, value: unknown) {
          localStorage.setItem(storagePrefix + key, JSON.stringify(value));
        },
      },

      subscriptions,
    };
  }
}
