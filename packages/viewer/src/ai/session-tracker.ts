import type { ContributionIntent } from "./prompt-interceptor";

export interface ToolDescriptorMeta {
  id: string;
  label: string;
  category: "create" | "edit";
}

export interface CommandDescriptorMeta {
  id: string;
  label: string;
  keybinding?: string;
}

export interface SessionAction {
  prompt: string;
  code: string;
  summary: string;
  createdIds: string[];
  removedIds: string[];
  timestamp: number;
  /** What kind of contribution this action produced */
  contributionType: ContributionIntent;
  /** Descriptor for a registered tool (when contributionType === 'tool') */
  toolDescriptor?: ToolDescriptorMeta;
  /** Descriptor for a registered command (when contributionType === 'command') */
  commandDescriptor?: CommandDescriptorMeta;
}

export class SessionTracker {
  actions: SessionAction[] = [];

  record(action: SessionAction) {
    this.actions.push(action);
  }

  hasActions(): boolean {
    return this.actions.length > 0;
  }

  clear() {
    this.actions = [];
  }

  /** Get all tool descriptors recorded in the session. */
  getTools(): ToolDescriptorMeta[] {
    return this.actions
      .filter(a => a.contributionType === "tool" && a.toolDescriptor)
      .map(a => a.toolDescriptor!);
  }

  /** Get all command descriptors recorded in the session. */
  getCommands(): CommandDescriptorMeta[] {
    return this.actions
      .filter(a => a.contributionType === "command" && a.commandDescriptor)
      .map(a => a.commandDescriptor!);
  }

  /** Build a text summary of all session actions for the bundler prompt. */
  getSummary(): string {
    return this.actions
      .map((a, i) => {
        let line = `Step ${i + 1} [${a.contributionType}]: "${a.prompt}"\nCode:\n${a.code}\nResult: created ${a.createdIds.length} elements, removed ${a.removedIds.length} elements`;
        if (a.toolDescriptor) {
          line += `\nTool registered: ${JSON.stringify(a.toolDescriptor)}`;
        }
        if (a.commandDescriptor) {
          line += `\nCommand registered: ${JSON.stringify(a.commandDescriptor)}`;
        }
        return line;
      })
      .join("\n\n");
  }
}
