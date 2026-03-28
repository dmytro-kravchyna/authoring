/**
 * ExtensionHost — manages the lifecycle of BIM IDE extensions.
 *
 * Loads/unloads extensions via dynamic import(),
 * creates scoped ExtensionContext for each extension,
 * and manages cleanup on deactivation.
 */

import type { ViewerInstance } from "@bim-ide/viewer";
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
}

export class ExtensionHost {
  private extensions = new Map<string, LoadedExtension>();
  private viewer: ViewerInstance;
  private commands = new Map<string, Command>();

  constructor(viewer: ViewerInstance) {
    this.viewer = viewer;
  }

  async loadExtension(manifest: ExtensionManifest, bundleUrl: string): Promise<void> {
    if (this.extensions.has(manifest.id)) {
      await this.unloadExtension(manifest.id);
    }

    // Dynamic import of the extension bundle
    const module = (await import(/* @vite-ignore */ bundleUrl)) as ExtensionModule;

    // Create scoped context
    const context = this.createContext(manifest);

    // Activate
    await module.activate(context);

    this.extensions.set(manifest.id, { manifest, module, context });
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

    // Remove registered commands
    if (ext.manifest.contributes?.commands) {
      for (const cmd of ext.manifest.contributes.commands) {
        this.commands.delete(`${ext.manifest.id}.${cmd.id}`);
      }
    }

    this.extensions.delete(id);
    console.log(`[ExtensionHost] Unloaded: ${ext.manifest.name}`);
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

  private createContext(manifest: ExtensionManifest): ExtensionContext {
    const viewer = this.viewer;
    const commands = this.commands;
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

      editor: {
        registerElement(def) {
          viewer.registerElement(def);
        },
        registerTool(tool, descriptor) {
          viewer.registerTool(tool, descriptor.label, descriptor.category);
        },
        registerCommand(cmd) {
          const fullId = `${manifest.id}.${cmd.id}`;
          commands.set(fullId, { ...cmd, id: fullId });
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
