export interface TopSymbol { name: string; line: number; signature: string }

const PY = /^(?:async\s+)?(?:def|class)\s+(\w+)/;
const JS = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|enum|type|const|let)\s+(\w+)/;
const GENERIC = /^(?:pub\s+)?(?:fn|func|struct|impl|trait|def|class)\s+(\w+)/;

/**
 * Top-level (column 0) symbols by regex. Used when no language server answers (e.g. Python without
 * the Python extension) and as the cheap path for ranking; one line each, so cheap to pack.
 */
export function topLevelSymbols(text: string, filePath: string): TopSymbol[] {
  const re = filePath.endsWith('.py') ? PY : /\.(?:[cm]?[jt]sx?)$/.test(filePath) ? JS : GENERIC;
  const out: TopSymbol[] = [];
  text.split('\n').forEach((line, i) => {
    const m = re.exec(line);
    if (m?.[1]) out.push({ name: m[1], line: i + 1, signature: line.replace(/\s*[{:]\s*$/, '').trim().slice(0, 160) });
  });
  return out;
}
