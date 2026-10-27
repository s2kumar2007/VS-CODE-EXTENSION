/** ~4 characters per token: a deliberately simple, dependency-free estimate. */
export const CHARS_PER_TOKEN = 4;
export const estimateTokens = (s: string): number => Math.ceil(s.length / CHARS_PER_TOKEN);

export interface ContextItem {
  label: string;      // e.g. "src/flask/cli.py:120-160"
  reason: string;     // why it was selected
  text: string;       // the slice / signatures
  priority: number;   // higher = packed first
}
export interface PackedItem extends ContextItem { tokens: number; truncated: boolean }

/**
 * Greedy packer. Items go in by priority; an item that doesn't fit is truncated (line-aligned)
 * if at least 80 tokens remain, otherwise dropped. Never exceeds the budget.
 */
export function packContext(items: ContextItem[], budgetTokens: number): { packed: PackedItem[]; used: number; dropped: string[] } {
  const packed: PackedItem[] = [];
  const dropped: string[] = [];
  let used = 0;
  for (const it of [...items].sort((a, b) => b.priority - a.priority)) {
    const cost = estimateTokens(it.text);
    const left = budgetTokens - used;
    if (cost <= left) { packed.push({ ...it, tokens: cost, truncated: false }); used += cost; continue; }
    if (left >= 80) {
      const cut = it.text.slice(0, left * CHARS_PER_TOKEN - 24); // leave room for the marker
      const text = cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0) || cut.length) + '\n...[truncated]';
      const tokens = estimateTokens(text);
      if (tokens <= left) { packed.push({ ...it, text, tokens, truncated: true }); used += tokens; continue; }
    }
    dropped.push(it.label);
  }
  return { packed, used, dropped };
}
