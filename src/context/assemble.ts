import { estimateTokens, packContext, type ContextItem, type PackedItem } from './budget';
import { extractKeywords, parseMentions } from './keywords';
import { topLevelSymbols } from './symbols';
import type { SearchHit, SymbolHit } from '../workspace/types';

/** Everything assemble() needs from the workspace; implemented with ripgrep/VS Code, faked in tests. */
export interface ContextDeps {
  listFiles(): Promise<string[]>;
  searchKeyword(keyword: string): Promise<SearchHit[]>;
  searchImporters(moduleName: string): Promise<SearchHit[]>;
  readText(relPath: string): Promise<string | undefined>;
  findSymbol(name: string): Promise<SymbolHit | undefined>;
}

export interface ContextResult {
  /** Text block to prepend to the user message. */
  text: string;
  items: PackedItem[];
  tokens: number;
  budget: number;
  keywords: string[];
}

const SOURCE_RE = /\.(py|[cm]?[jt]sx?|go|rs|java|rb|c|h|cpp|cs|md|rst|txt|toml|json|ya?ml)$/i;
const fence = (p: string) => (p.endsWith('.py') ? 'python' : /\.[jt]sx?$/.test(p) ? 'ts' : '');
const slice = (lines: string[], a: number, b: number) => lines.slice(a - 1, b).join('\n');

/** Merges hit line numbers into <= maxSlices windows of +-pad lines. */
export function windows(hitLines: number[], total: number, pad = 6, maxSlices = 2): [number, number][] {
  const sorted = [...new Set(hitLines)].sort((a, b) => a - b);
  const ws: [number, number][] = [];
  for (const l of sorted) {
    const a = Math.max(1, l - pad), b = Math.min(total, l + pad);
    const last = ws[ws.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else ws.push([a, b]);
  }
  return ws.slice(0, maxSlices);
}

/**
 * Builds the automatic context for a request under a TOKEN BUDGET. Never sends whole files:
 *   1. explicit @file/@symbol mentions (highest priority, capped slices)
 *   2. ranked shortlist: keyword hits (ripgrep) + symbol-name matches + files importing matched modules
 *   3. a compact repo map (file tree) limited to ~20% of the budget
 * For each ranked file: its top-level signatures + the slices around the hits.
 */
export async function assembleContext(request: string, deps: ContextDeps, budget: number): Promise<ContextResult> {
  const keywords = extractKeywords(request);
  const mentions = parseMentions(request);
  const files = (await deps.listFiles()).filter((f) => SOURCE_RE.test(f));
  const items: ContextItem[] = [];

  // --- 1. explicit mentions ---
  for (const f of mentions.files) {
    const text = await deps.readText(f);
    if (text === undefined) continue;
    const lines = text.split('\n');
    const sigs = topLevelSymbols(text, f).map((s) => `${s.line}: ${s.signature}`).join('\n');
    const body = lines.length <= 120 ? text : `${slice(lines, 1, 60)}\n...\n[signatures]\n${sigs}`;
    items.push({ label: `${f}${lines.length <= 120 ? '' : ':1-60 + signatures'}`, reason: 'mentioned with @file', text: body, priority: 100 });
  }
  for (const name of mentions.symbols) {
    const hit = await deps.findSymbol(name);
    const text = hit ? await deps.readText(hit.path) : undefined;
    if (!hit || text === undefined) continue;
    const lines = text.split('\n');
    const a = Math.max(1, hit.line - 2), b = Math.min(lines.length, hit.line + 40);
    items.push({ label: `${hit.path}:${a}-${b}`, reason: `mentioned with @symbol ${name}`, text: slice(lines, a, b), priority: 99 });
  }

  // --- 2. ranked shortlist ---
  const score = new Map<string, number>();
  const why = new Map<string, string[]>();
  const hitLines = new Map<string, number[]>();
  const bump = (f: string, n: number, reason: string) => { score.set(f, (score.get(f) ?? 0) + n); why.set(f, [...(why.get(f) ?? []), reason]); };

  const perKeyword = await Promise.all(keywords.map(async (k) => [k, await deps.searchKeyword(k)] as const));
  for (const [k, hits] of perKeyword) {
    const byFile = new Map<string, SearchHit[]>();
    for (const h of hits) byFile.set(h.path, [...(byFile.get(h.path) ?? []), h]);
    for (const [f, hs] of byFile) {
      bump(f, Math.min(hs.length, 5), `${hs.length} hit(s) for "${k}"`);
      hitLines.set(f, [...(hitLines.get(f) ?? []), ...hs.map((h) => h.line)]);
    }
  }
  for (const f of files) {
    const base = f.toLowerCase();
    for (const k of keywords) if (base.includes(k)) bump(f, 3, `path contains "${k}"`);
  }
  // Symbol-name matches among the current top candidates.
  const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f]) => f);
  const symCache = new Map<string, ReturnType<typeof topLevelSymbols>>();
  for (const f of top) {
    const text = await deps.readText(f);
    if (text === undefined) continue;
    const syms = topLevelSymbols(text, f);
    symCache.set(f, syms);
    for (const k of keywords) {
      const m = syms.find((s) => s.name.toLowerCase().includes(k));
      if (m) { bump(f, 4, `defines "${m.name}"`); hitLines.set(f, [...(hitLines.get(f) ?? []), m.line]); }
    }
  }
  // Files importing the best matches: the code that depends on what we are about to change.
  for (const f of [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([x]) => x)) {
    const mod = f.replace(/\.[^.]+$/, '').split('/').pop()!;
    if (mod.length < 3 || mod === '__init__') continue;
    for (const h of await deps.searchImporters(mod)) if (h.path !== f) bump(h.path, 1.5, `imports ${mod}`);
  }

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  for (const [f, sc] of ranked) {
    const text = await deps.readText(f);
    if (text === undefined) continue;
    const lines = text.split('\n');
    const syms = symCache.get(f) ?? topLevelSymbols(text, f);
    const reason = [...new Set(why.get(f))].slice(0, 5).join('; ');
    const sigs = syms.slice(0, 25).map((s) => `${s.line}: ${s.signature}`).join('\n');
    if (sigs) items.push({ label: `${f} (signatures)`, reason, text: sigs, priority: 40 + sc });
    for (const [a, b] of windows(hitLines.get(f) ?? [], lines.length)) {
      items.push({ label: `${f}:${a}-${b}`, reason, text: slice(lines, a, b), priority: 50 + sc });
    }
  }

  // --- 3. repo map, capped at ~20% of the budget ---
  items.push({ label: 'repo map', reason: 'file tree overview', text: renderTree(files, Math.floor(budget * 0.2) * 4), priority: 30 });

  const { packed, used } = packContext(items, budget);
  const body = packed.map((p) => (p.label === 'repo map' ? `### Repo map\n${p.text}` : `### ${p.label}\n(why: ${p.reason})\n\`\`\`${fence(p.label)}\n${p.text}\n\`\`\``)).join('\n\n');
  const text = `[Forge context: selected automatically under a ${budget}-token budget (${used} used). Treat as hints; use search_workspace/read_file for more. State which files you chose and why.]\n\n${body}`;
  return { text, items: packed, tokens: used, budget, keywords };
}

/** Directory -> files listing, truncated to maxChars. */
export function renderTree(files: string[], maxChars: number): string {
  const dirs = new Map<string, string[]>();
  for (const f of files) {
    const i = f.lastIndexOf('/');
    const d = i < 0 ? '.' : f.slice(0, i);
    dirs.set(d, [...(dirs.get(d) ?? []), f.slice(i + 1)]);
  }
  let out = '';
  for (const [d, fs] of [...dirs.entries()].sort()) {
    const line = `${d}/: ${fs.slice(0, 12).join(', ')}${fs.length > 12 ? `, +${fs.length - 12} more` : ''}\n`;
    if (out.length + line.length > maxChars) { out += '...(truncated)\n'; break; }
    out += line;
  }
  return out;
}

export { estimateTokens };
