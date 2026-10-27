import { diffLines } from 'diff';

export interface Hunk {
  id: number;          // 1-based, stable for a given (old,new) pair
  oldStart: number;    // 1-based line in the OLD text where the hunk begins
  removed: string;     // text removed from old ('' for pure insertion)
  added: string;       // text added in new ('' for pure deletion)
}

/** A diff is a sequence of unchanged runs and "hunks" (a removed+added pair, either may be empty). */
type Segment = { kind: 'same'; text: string } | { kind: 'hunk'; hunk: Hunk };

function segments(oldText: string, newText: string): Segment[] {
  const parts = diffLines(oldText, newText);
  const out: Segment[] = [];
  let oldLine = 1;
  let id = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (!p.added && !p.removed) {
      out.push({ kind: 'same', text: p.value });
      oldLine += countLines(p.value);
      continue;
    }
    // Merge a removed part with the added part that follows it (and vice versa) into one hunk.
    let removed = '';
    let added = '';
    while (i < parts.length && (parts[i]!.added || parts[i]!.removed)) {
      if (parts[i]!.removed) removed += parts[i]!.value; else added += parts[i]!.value;
      i++;
    }
    i--;
    out.push({ kind: 'hunk', hunk: { id: ++id, oldStart: oldLine, removed, added } });
    oldLine += countLines(removed);
  }
  return out;
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
}

export function computeHunks(oldText: string, newText: string): Hunk[] {
  return segments(oldText, newText).flatMap((s) => (s.kind === 'hunk' ? [s.hunk] : []));
}

/**
 * Builds the file content with ONLY the accepted hunks applied; rejected hunks keep the
 * original text. Accepting all returns newText exactly; accepting none returns oldText exactly.
 */
export function applyHunks(oldText: string, newText: string, accepted: ReadonlySet<number>): string {
  return segments(oldText, newText)
    .map((s) => (s.kind === 'same' ? s.text : accepted.has(s.hunk.id) ? s.hunk.added : s.hunk.removed))
    .join('');
}
