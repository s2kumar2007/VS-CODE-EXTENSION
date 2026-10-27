import { spawn } from 'node:child_process';
import type { SearchHit, SymbolHit } from './types';

const EXCLUDES = ['!**/.git/**', '!**/node_modules/**', '!**/.venv/**', '!**/venv/**', '!**/__pycache__/**'];

/** Runs rg and returns stdout. Exit code 1 (= no matches) is not an error. */
export function runRg(rgPath: string, cwd: string, args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const globs = EXCLUDES.flatMap((g) => ['--glob', g]);
    // Explicit "." path: without it rg may try to read stdin when spawned without a TTY.
    const child = spawn(rgPath, [...globs, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d: Buffer) => { out += d.toString('utf8'); if (out.length > 4_000_000) child.kill(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === 1 || out) resolve(out);
      else reject(new Error(`ripgrep failed (${code}): ${err.trim()}`));
    });
  });
}

interface RgJsonLine {
  type: string;
  data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
}

function parseJson(out: string, perFileCap: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const perFile = new Map<string, number>();
  for (const raw of out.split('\n')) {
    if (!raw) continue;
    let o: RgJsonLine;
    try { o = JSON.parse(raw) as RgJsonLine; } catch { continue; }
    if (o.type !== 'match' || !o.data?.path?.text) continue;
    const p = o.data.path.text.replace(/^\.[\\/]/, '').replace(/\\/g, '/');
    const n = (perFile.get(p) ?? 0) + 1;
    perFile.set(p, n);
    if (n > perFileCap) continue;
    hits.push({ path: p, line: o.data.line_number ?? 0, text: (o.data.lines?.text ?? '').replace(/\r?\n$/, '').slice(0, 240) });
  }
  return hits;
}

/** Case-insensitive literal text search (query is NOT treated as a regex). */
export async function rgText(rgPath: string, cwd: string, query: string, perFileCap = 5): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const out = await runRg(rgPath, cwd, ['--json', '-i', '-F', '--max-columns', '400', '-e', query, '.']);
  return parseJson(out, perFileCap);
}

/** Regex search (used internally for import detection). */
export async function rgRegex(rgPath: string, cwd: string, pattern: string, perFileCap = 3): Promise<SearchHit[]> {
  const out = await runRg(rgPath, cwd, ['--json', '-i', '--max-columns', '400', '-e', pattern, '.']);
  return parseJson(out, perFileCap);
}

export async function rgFiles(rgPath: string, cwd: string): Promise<string[]> {
  const out = await runRg(rgPath, cwd, ['--files', '.']);
  return out.split('\n').filter(Boolean).map((p) => p.replace(/^\.[\\/]/, '').replace(/\\/g, '/')).sort();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEF_RE = /(?:def|class|function|interface|enum|type|struct|fn|func)\s+(\w+)/;

/** Fallback symbol search (when no language server answers): definition-looking lines. */
export async function rgSymbols(rgPath: string, cwd: string, query: string, max: number): Promise<SymbolHit[]> {
  const q = escapeRe(query.trim());
  if (!q) return [];
  const pattern = `^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:def|class|function|interface|enum|type|struct|fn|func)\\s+\\w*${q}\\w*`;
  const hits = await rgRegex(rgPath, cwd, pattern, 10);
  const symbols: SymbolHit[] = [];
  for (const h of hits) {
    const m = DEF_RE.exec(h.text);
    if (m?.[1]) symbols.push({ name: m[1], kind: h.text.trim().split(/\s+/).find((w) => /^(def|class|function|interface|enum|type|struct|fn|func)$/.test(w)) ?? 'symbol', path: h.path, line: h.line });
    if (symbols.length >= max) break;
  }
  return symbols;
}
