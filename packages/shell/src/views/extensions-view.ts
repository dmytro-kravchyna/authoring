/**
 * Extensions view — browse, install, and manage BIM extensions.
 * Connects to the Extension Store server API.
 */

import type { ExtensionHost } from "../services/extension-host";

interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
}

interface InstalledExtensionInfo extends ExtensionInfo {
  enabled: boolean;
  bundleUrl: string;
}

// In-memory list of installed extensions
const installedExtensions = new Map<string, InstalledExtensionInfo>();

// Store server URL (configurable)
const STORE_URL = "http://localhost:4000/api";

export function createExtensionsView(container: HTMLElement, extensionHost?: ExtensionHost) {
  container.innerHTML = "";

  // Search bar
  const searchWrap = document.createElement("div");
  searchWrap.style.padding = "8px 12px";
  const searchInput = document.createElement("input");
  searchInput.className = "search-input";
  searchInput.placeholder = "Search Extensions in Marketplace";
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // Tabs: Marketplace | Installed
  const tabs = document.createElement("div");
  tabs.style.cssText = "display: flex; padding: 0 12px; gap: 0; border-bottom: 1px solid var(--vscode-panel-border);";

  let activeTab = "marketplace";

  const mkTab = (id: string, label: string) => {
    const btn = document.createElement("button");
    btn.className = `bottom-panel-tab${id === activeTab ? " active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeTab = id;
      tabs.querySelectorAll(".bottom-panel-tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
    tabs.appendChild(btn);
    return btn;
  };

  mkTab("marketplace", "Marketplace");
  mkTab("installed", "Installed");
  container.appendChild(tabs);

  // List area
  const listArea = document.createElement("div");
  container.appendChild(listArea);

  async function renderList() {
    listArea.innerHTML = "";

    if (activeTab === "marketplace") {
      // Try to fetch from store server
      try {
        const q = searchInput.value.trim();
        const res = await fetch(`${STORE_URL}/extensions${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        if (res.ok) {
          const extensions: ExtensionInfo[] = await res.json();
          if (extensions.length === 0) {
            showEmpty(listArea, "No extensions found.");
          } else {
            for (const ext of extensions) {
              listArea.appendChild(createMarketplaceCard(ext, extensionHost));
            }
          }
          return;
        }
      } catch {
        // Store server not available
      }

      // Show sample extensions when store is unavailable
      showSampleExtensions(listArea, extensionHost);
    } else {
      // Installed
      if (installedExtensions.size === 0) {
        showEmpty(listArea, "No extensions installed.");
      } else {
        for (const ext of installedExtensions.values()) {
          listArea.appendChild(createInstalledCard(ext, extensionHost));
        }
      }
    }
  }

  searchInput.addEventListener("input", () => {
    if (activeTab === "marketplace") renderList();
  });

  // Close dropdown menus when clicking outside
  document.addEventListener("click", () => {
    container.querySelectorAll(".ext-dropdown.open").forEach((d) => d.classList.remove("open"));
  });

  renderList();
}

function createMarketplaceCard(ext: ExtensionInfo, extensionHost?: ExtensionHost): HTMLElement {
  const card = document.createElement("div");
  card.className = "extension-card";

  card.appendChild(createCardIcon());
  card.appendChild(createCardInfo(ext));

  const btn = document.createElement("button");
  const isInstalled = installedExtensions.has(ext.id);
  btn.className = isInstalled ? "btn-secondary" : "btn-primary";
  btn.textContent = isInstalled ? "Installed" : "Install";
  btn.disabled = isInstalled;
  btn.style.cssText = "align-self: center; flex-shrink: 0;";
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const bundleUrl = `${STORE_URL}/extensions/${ext.id}/download`;
      if (extensionHost) {
        await extensionHost.loadExtension(
          { id: ext.id, name: ext.name, version: ext.version, description: ext.description, author: ext.author, main: bundleUrl },
          bundleUrl
        );
      }
      installedExtensions.set(ext.id, { ...ext, enabled: true, bundleUrl });
      btn.textContent = "Installed";
      btn.className = "btn-secondary";
      btn.disabled = true;
    } catch (err) {
      console.error(`Failed to install ${ext.name}:`, err);
      btn.textContent = "Error";
      setTimeout(() => { btn.textContent = "Install"; }, 2000);
    }
  });
  card.appendChild(btn);

  return card;
}

function createInstalledCard(ext: InstalledExtensionInfo, extensionHost?: ExtensionHost): HTMLElement {
  const card = document.createElement("div");
  card.className = `extension-card${ext.enabled ? "" : " extension-disabled"}`;

  card.appendChild(createCardIcon());
  card.appendChild(createCardInfo(ext));

  // Dropdown menu button
  const dropdown = document.createElement("div");
  dropdown.className = "ext-dropdown";

  const trigger = document.createElement("button");
  trigger.className = "ext-dropdown-trigger";
  trigger.innerHTML = `<i class="codicon codicon-ellipsis"></i>`;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = dropdown.classList.contains("open");
    // Close any other open dropdowns
    document.querySelectorAll(".ext-dropdown.open").forEach((d) => d.classList.remove("open"));
    if (!wasOpen) dropdown.classList.add("open");
  });
  dropdown.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "ext-dropdown-menu";

  // Enable/Disable item
  const toggleItem = document.createElement("div");
  toggleItem.className = "ext-dropdown-item";
  toggleItem.innerHTML = ext.enabled
    ? `<i class="codicon codicon-circle-slash"></i> Disable`
    : `<i class="codicon codicon-check"></i> Enable`;
  toggleItem.addEventListener("click", async (e) => {
    e.stopPropagation();
    dropdown.classList.remove("open");
    if (ext.enabled) {
      if (extensionHost) {
        await extensionHost.disableExtension(ext.id, ext.bundleUrl);
      }
      ext.enabled = false;
      toggleItem.innerHTML = `<i class="codicon codicon-check"></i> Enable`;
      card.classList.add("extension-disabled");
    } else {
      if (extensionHost) {
        await extensionHost.enableExtension(ext.id);
      }
      ext.enabled = true;
      toggleItem.innerHTML = `<i class="codicon codicon-circle-slash"></i> Disable`;
      card.classList.remove("extension-disabled");
    }
  });
  menu.appendChild(toggleItem);

  // Uninstall item
  const uninstallItem = document.createElement("div");
  uninstallItem.className = "ext-dropdown-item danger";
  uninstallItem.innerHTML = `<i class="codicon codicon-trash"></i> Uninstall`;
  uninstallItem.addEventListener("click", async (e) => {
    e.stopPropagation();
    dropdown.classList.remove("open");
    if (ext.enabled && extensionHost) {
      await extensionHost.unloadExtension(ext.id);
    }
    installedExtensions.delete(ext.id);
    card.remove();
  });
  menu.appendChild(uninstallItem);

  dropdown.appendChild(menu);
  card.appendChild(dropdown);

  return card;
}

function createCardIcon(): HTMLElement {
  const icon = document.createElement("div");
  icon.className = "extension-card-icon";
  icon.innerHTML = `<i class="codicon codicon-extensions"></i>`;
  return icon;
}

function createCardInfo(ext: ExtensionInfo): HTMLElement {
  const info = document.createElement("div");
  info.className = "extension-card-info";

  const name = document.createElement("div");
  name.className = "extension-card-name";
  name.textContent = ext.name;
  info.appendChild(name);

  const desc = document.createElement("div");
  desc.className = "extension-card-desc";
  desc.textContent = ext.description;
  info.appendChild(desc);

  const meta = document.createElement("div");
  meta.className = "extension-card-meta";
  meta.textContent = `${ext.author} | v${ext.version}`;
  if (ext.downloads > 0) meta.textContent += ` | ${ext.downloads} downloads`;
  info.appendChild(meta);

  return info;
}

function showEmpty(container: HTMLElement, message: string) {
  const empty = document.createElement("div");
  empty.style.cssText = "padding: 24px; text-align: center; color: var(--vscode-descriptionForeground);";
  empty.textContent = message;
  container.appendChild(empty);
}

function showSampleExtensions(container: HTMLElement, extensionHost?: ExtensionHost) {
  const samples: ExtensionInfo[] = [
    {
      id: "com.bim.steel-beams",
      name: "Steel Beam Tools",
      description: "Adds I-beam, H-beam, and channel section elements for structural modeling.",
      author: "BIM Community",
      version: "1.0.0",
      downloads: 342,
      rating: 4.5,
    },
    {
      id: "com.bim.mep-pipes",
      name: "MEP Pipe Router",
      description: "Mechanical, electrical, and plumbing pipe routing with automatic clash detection.",
      author: "MEP Team",
      version: "2.1.0",
      downloads: 1205,
      rating: 4.8,
    },
    {
      id: "com.bim.curtain-wall",
      name: "Curtain Wall System",
      description: "Parametric curtain wall with configurable panel width, mullion profiles, and glass types.",
      author: "Facade Studio",
      version: "1.3.0",
      downloads: 567,
      rating: 4.2,
    },
    {
      id: "com.bim.stair-tool",
      name: "Stair Generator",
      description: "Generate straight, L-shaped, and spiral stairs with configurable tread and riser dimensions.",
      author: "ArchTools",
      version: "0.9.0",
      downloads: 89,
      rating: 3.9,
    },
    {
      id: "com.bim.ifc-export",
      name: "IFC Exporter",
      description: "Export your BIM model to Industry Foundation Classes (IFC) format for interoperability.",
      author: "OpenBIM Lab",
      version: "1.0.0",
      downloads: 2340,
      rating: 4.7,
    },
  ];

  const notice = document.createElement("div");
  notice.style.cssText = "padding: 8px 14px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border);";
  notice.textContent = "Extension Store offline — showing sample extensions";
  container.appendChild(notice);

  for (const ext of samples) {
    const card = createMarketplaceCard(ext, extensionHost);
    // Disable install for sample extensions — no real bundle exists
    const btn = card.querySelector("button");
    if (btn) {
      btn.disabled = true;
      btn.title = "Store offline — cannot install";
    }
    container.appendChild(card);
  }
}
