/**
 * Prompt Interceptor — classifies user intent and augments prompts
 * so the AI generates structures compatible with ExtensionContributions.
 *
 * Uses keyword-based heuristics (no extra AI call) to classify whether
 * the user wants a one-shot action, a reusable tool, a reusable command,
 * or a new element type — then prepends contribution-structure guidance.
 */

export type ContributionIntent = "action" | "tool" | "command" | "element";

export interface InterceptionResult {
  /** The augmented prompt to send to the AI */
  augmented: string;
  /** Classified intent */
  intent: ContributionIntent;
}

// ── Keyword patterns (case-insensitive) ────────────────────────────

const TOOL_PATTERNS = [
  /\b(?:create|make|build|add|implement)\s+(?:a\s+)?(?:reusable\s+)?(?:placement\s+)?tool\b/i,
  /\b(?:interactive|placement|drawing|editing|selection)\s+tool\b/i,
  /\btool\s+(?:that|which|for|to)\b/i,
  /\bpointer\s+(?:tool|interaction)\b/i,
  /\bdrag(?:gable)?\s+tool\b/i,
  /\bclick[\s-](?:to[\s-])?place\b/i,
  /\btoolbar\s+(?:button|action|item)\b/i,
  /\btool\s+(?:that|which|to)\s+(?:edit|modify|move|rotate|scale|transform)\s+(?:selected|the\s+selection)\b/i,
];

const COMMAND_PATTERNS = [
  /\b(?:create|make|build|add|implement)\s+(?:a\s+)?(?:reusable\s+)?command\b/i,
  /\bcommand\s+(?:that|which|for|to)\b/i,
  /\b(?:keyboard\s+)?shortcut\s+(?:that|which|for|to)\b/i,
  /\bkeybinding\s+(?:that|which|for|to)\b/i,
  /\b(?:one[\s-]click|quick)\s+(?:action|button)\b/i,
  /\badd\s+(?:a\s+)?button\s+(?:that|which|for|to)\b/i,
  /\breusable\s+(?:action|operation)\b/i,
];

const ELEMENT_PATTERNS = [
  /\b(?:new|custom|define)\s+(?:element|entity)\s+(?:type|kind)\b/i,
  /\belement\s+(?:type\s+)?(?:definition|kind)\b/i,
  /\b(?:create|make|build|define)\s+(?:a\s+)?(?:new\s+)?(?:bim\s+)?(?:element|entity)\b/i,
  /\b(?:element|entity)\s+(?:that|which|with)\s+(?:its\s+own|custom)\s+geometry\b/i,
  /\bgenerateGeometry\b/i,
  /\bcross[\s-]section\b/i,
];

// ── Classification ─────────────────────────────────────────────────

export function classifyIntent(prompt: string): ContributionIntent {
  // Check most specific patterns first (tool > command > element)
  // to avoid false positives on generic words

  for (const pattern of TOOL_PATTERNS) {
    if (pattern.test(prompt)) return "tool";
  }

  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.test(prompt)) return "command";
  }

  for (const pattern of ELEMENT_PATTERNS) {
    if (pattern.test(prompt)) return "element";
  }

  return "action";
}

// ── Prompt augmentation ────────────────────────────────────────────

const TOOL_AUGMENTATION = `
[INTENT: The user wants a reusable interactive TOOL — a pointer-based instrument that appears in the toolbar and responds to clicks/drags on the 3D viewport. Generate using Mode C (Tool Definition).]

Requirements:
- Export a \`toolDefinition\` object with { id, label, category, description }
- Export lifecycle functions: activate(), deactivate(), onPointerDown(event, point), onPointerMove(event, point), onPointerUp(event)
- The tool should be interactive — responding to pointer events to place/modify elements
- Category must be "create" (for tools that place new elements) or "edit" (for tools that modify existing elements)
- For "edit" category tools that operate on selected elements, use the \`selection\` API:
  - selection.getAll() to get all selected contracts
  - selection.getIds() to get selected IDs
  - selection.getFirst() for the primary selected element
  - selection.clear() to clear selection after operations

`;

const COMMAND_AUGMENTATION = `
[INTENT: The user wants a reusable COMMAND — a one-shot action that can be triggered from a menu or keybinding. Generate using Mode D (Command Definition).]

Requirements:
- Export a \`commandDefinition\` object with { id, label, category, keybinding? }
- Export a default handler function that executes the action
- The function receives the viewer/context and performs the operation immediately
- Keep the command idempotent where possible
- If the command operates on selected elements, use the \`selection\` API (selection.getAll(), selection.getIds(), etc.)

`;

const ELEMENT_AUGMENTATION = `
[INTENT: The user wants a new ELEMENT TYPE — a custom BIM entity with its own geometry generation. Generate using Mode B (Type Definition).]

`;

export function augmentPrompt(prompt: string, intent: ContributionIntent): string {
  switch (intent) {
    case "tool":
      return TOOL_AUGMENTATION + prompt;
    case "command":
      return COMMAND_AUGMENTATION + prompt;
    case "element":
      return ELEMENT_AUGMENTATION + prompt;
    case "action":
    default:
      return prompt;
  }
}

// ── Main entry point ───────────────────────────────────────────────

export function interceptAndAugment(prompt: string): InterceptionResult {
  const intent = classifyIntent(prompt);
  const augmented = augmentPrompt(prompt, intent);
  return { augmented, intent };
}
