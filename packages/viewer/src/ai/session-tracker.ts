export interface SessionAction {
  prompt: string;
  code: string;
  summary: string;
  createdIds: string[];
  removedIds: string[];
  timestamp: number;
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

  /** Build a text summary of all session actions for the bundler prompt. */
  getSummary(): string {
    return this.actions
      .map((a, i) => `Step ${i + 1}: "${a.prompt}"\nCode:\n${a.code}\nResult: created ${a.createdIds.length} elements, removed ${a.removedIds.length} elements`)
      .join("\n\n");
  }
}
