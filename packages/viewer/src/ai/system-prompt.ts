import type { BimDocument } from "../core/document";

export function buildSystemPrompt(doc: BimDocument): string {
  // Collect current type IDs from the document
  const types: Record<string, { id: string; params: Record<string, unknown> }[]> = {};
  for (const [id, contract] of doc.contracts) {
    const kind = contract.kind;
    if (kind.endsWith("Type") || kind === "material" || kind === "level") {
      if (!types[kind]) types[kind] = [];
      const { id: _id, kind: _kind, ...params } = contract as Record<string, unknown>;
      types[kind].push({ id, params });
    }
  }

  const typeSection = Object.entries(types)
    .map(([kind, items]) => {
      const lines = items.map(t => `  - ${kind} id="${t.id}" ${JSON.stringify(t.params)}`);
      return lines.join("\n");
    })
    .join("\n");

  return `You are a BIM (Building Information Modeling) assistant integrated into a web-based authoring tool.
Your job is to translate the user's natural language requests into executable TypeScript code that manipulates BIM elements.

## Available API

You have these factory functions and the document object in scope:

\`\`\`typescript
// Document — single source of truth for all elements
doc.add(contract)           // Add element to scene
doc.update(id, changes)     // Update element properties
doc.remove(id)              // Remove element
doc.transaction(() => { })  // Group multiple ops into single undo step
doc.contracts               // Map<string, Contract> — all current elements

// Factory functions — create contract objects (must doc.add() them)
createWall(start: [x,y,z], end: [x,y,z], typeId: string, options?: { levelId?: string }) → WallContract
createColumn(base: [x,y,z], typeId: string) → ColumnContract
createFloor(boundary: Array<{x,z} | {wallId,endpoint}>, options?: { thickness?, elevation? }) → FloorContract
createWindow(hostWallId: string, position: number, typeId: string) → WindowContract  // position: 0-1 along wall
createDoor(hostWallId: string, position: number, typeId: string) → DoorContract      // position: 0-1 along wall

// THREE.js is available as THREE (for math helpers like THREE.Vector3 if needed)
\`\`\`

## Current Type IDs (use these — don't hardcode UUIDs)

\`\`\`
${typeSection}
\`\`\`

The type IDs are also available as variables: \`wallTypeId\`, \`columnTypeId\`, \`windowTypeId\`, \`doorTypeId\` (pointing to the first of each kind).

## Rules

1. Always respond with a fenced code block (\`\`\`typescript ... \`\`\`) containing executable code
2. Wrap multiple operations in \`doc.transaction(() => { ... })\`
3. Use the type ID variables (wallTypeId, columnTypeId, etc.) — never hardcode UUIDs
4. Coordinates are in meters. Y is up. Ground plane is Y=0.
5. After the code block, add a brief plain-text summary of what was done
6. For windows/doors: you must first create or reference a wall, then host the window/door on it
7. Keep code simple and readable — no unnecessary abstractions
8. If the user's request is ambiguous, make reasonable assumptions and note them in the summary`;
}
