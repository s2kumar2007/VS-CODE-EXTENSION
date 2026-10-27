import type { SearchHit, SymbolHit } from '../workspace/types';

export interface RankedHit extends SearchHit { why: string }
export interface RankedSymbol extends SymbolHit { why: string }

const DEFINITION = /^\s*(?:export\s+)?(?:async\s+)?(?:def|class|function|interface|enum|type)\s/;

/**
 * Ranks text hits: files with more hits first, +3 when the file name contains the query,
 * +2 when the matching line looks like a definition. Returns one best line per file first,
 * then additional lines, each with a one-line "why".
 */
export function rankTextHits(hits: SearchHit[], query: string, max: number): RankedHit[] {
  const q = query.toLowerCase();
  const byFile = new Map<string, SearchHit[]>();
  for (const h of hits) byFile.set(h.path, [...(byFile.get(h.path) ?? []), h]);
  const scored = [...byFile.entries()].map(([file, hs]) => {
    const nameMatch = file.toLowerCase().includes(q);
    const def = hs.find((h) => DEFINITION.test(h.text));
    const score = hs.length + (nameMatch ? 3 : 0) + (def ? 2 : 0);
    return { file, hs, score, nameMatch, def };
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const first: RankedHit[] = [];
  const rest: RankedHit[] = [];
  for (const s of scored) {
    const why = [`${s.hs.length} match${s.hs.length === 1 ? '' : 'es'} for "${query}"`, s.nameMatch ? 'file name matches' : '', s.def ? 'contains a definition' : ''].filter(Boolean).join('; ');
    const best = s.def ?? s.hs[0]!;
    first.push({ ...best, why });
    for (const h of s.hs) if (h !== best) rest.push({ ...h, why: `another match in ${s.file}` });
  }
  return [...first, ...rest].slice(0, max);
}

/** Exact name > prefix > substring; ties broken by name length then path. */
export function rankSymbols(symbols: SymbolHit[], query: string, max: number): RankedSymbol[] {
  const q = query.toLowerCase();
  const tier = (n: string) => { const l = n.toLowerCase(); return l === q ? 0 : l.startsWith(q) ? 1 : l.includes(q) ? 2 : 3; };
  const label = ['exact name match', 'name starts with query', 'name contains query', 'related symbol'];
  return [...symbols]
    .sort((a, b) => tier(a.name) - tier(b.name) || a.name.length - b.name.length || a.path.localeCompare(b.path))
    .slice(0, max)
    .map((s) => ({ ...s, why: label[tier(s.name)]! }));
}
