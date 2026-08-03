/**
 * Extract per-component markdown bodies from a lesson body using
 * `{#component_id}` anchors on headings. A component body runs from just
 * after its anchor line to just before the next anchor line (or EOF).
 */
export function extractComponentBodies(body: string): Record<string, string> {
  const anchorRe = /^\s{0,3}#{1,6}\s+[^\n]*\{#([A-Za-z0-9_-]+)\}\s*$/gm;
  const matches = [...body.matchAll(anchorRe)];
  const result: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const start = (cur.index ?? 0) + cur[0].length;
    const end = next?.index ?? body.length;
    const id = cur[1];
    if (id !== undefined) {
      result[id] = body.slice(start, end).trim();
    }
  }
  return result;
}
