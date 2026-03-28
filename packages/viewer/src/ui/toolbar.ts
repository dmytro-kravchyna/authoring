import type { ToolManager } from "../tools/tool-manager";
import type { Tool } from "../tools/tool-manager";

export function createToolbar(
  toolMgr: ToolManager,
  tools: { tool: Tool; label: string; icon?: string }[]
) {
  const container = document.getElementById("toolbar")!;

  const buttons = new Map<string, HTMLButtonElement>();

  for (const { tool, label } of tools) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (toolMgr.getActiveTool()?.name === tool.name) {
        toolMgr.setTool(null);
      } else {
        toolMgr.setTool(tool);
      }
    });
    container.appendChild(btn);
    buttons.set(tool.name, btn);
  }

  // Update active states
  toolMgr.onToolChanged = (name) => {
    for (const [toolName, btn] of buttons) {
      btn.classList.toggle("active", toolName === name);
    }
  };
}
