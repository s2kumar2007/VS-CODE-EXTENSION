import { normalizeEol } from './hunks';

/** Builds a candidate only; the normal review permit still controls every write. */
export function materializeWrite(existing: string | undefined, args: Record<string, unknown>): string {
  const full = args.new_content !== undefined, patches = args.edits !== undefined;
  if (full === patches) throw new Error('Provide exactly one of new_content or edits.');
  if (full) {
    if (typeof args.new_content !== 'string') throw new Error('new_content must be a string.');
    return args.new_content;
  }
  if (existing === undefined) throw new Error('Exact edits require an existing file; use new_content to create one.');
  if (!Array.isArray(args.edits) || args.edits.length === 0 || args.edits.length > 20)
    throw new Error('Provide between 1 and 20 exact edits.');

  let candidate = existing;
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';

  for (const edit of args.edits) {
    if (typeof edit !== 'object' || edit === null || typeof edit.old_text !== 'string' || !edit.old_text || typeof edit.new_text !== 'string')
      throw new Error('Each edit requires nonempty old_text and string new_text.');

    const needle = normalizeEol(existing, edit.old_text);
    const replacement = normalizeEol(existing, edit.new_text);

    // 1. Direct exact substring match
    const first = candidate.indexOf(needle);
    if (first >= 0) {
      if (candidate.indexOf(needle, first + 1) >= 0)
        throw new Error('Exact edit text matches more than once; include a larger unique anchor.');
      candidate = candidate.slice(0, first) + replacement + candidate.slice(first + needle.length);
      continue;
    }

    // 2. Line-trimmed contiguous match fallback
    const cLines = candidate.split(/\r?\n/);
    const nRawLines = needle.split(/\r?\n/);
    const nLines = (nRawLines.length > 1 && nRawLines[nRawLines.length - 1] === '')
      ? nRawLines.slice(0, -1)
      : nRawLines;

    const trimmedN = nLines.map(l => l.trim());
    if (trimmedN.every(l => l.length === 0)) {
      throw new Error('Exact edit text was not found; read a current slice and try again.');
    }

    const matches: number[] = [];
    for (let i = 0; i <= cLines.length - trimmedN.length; i++) {
      let match = true;
      for (let j = 0; j < trimmedN.length; j++) {
        if ((cLines[i + j] ?? '').trim() !== trimmedN[j]) {
          match = false;
          break;
        }
      }
      if (match) matches.push(i);
    }

    if (matches.length === 0 && trimmedN.length === 1 && (trimmedN[0]?.length ?? 0) >= 10) {
      const prefix = trimmedN[0]!.slice(0, 25);
      for (let i = 0; i < cLines.length; i++) {
        if ((cLines[i] ?? '').trim().startsWith(prefix)) matches.push(i);
      }
    }

    if (matches.length === 0)
      throw new Error('Exact edit text was not found; read a current slice and try again.');
    if (matches.length > 1)
      throw new Error('Exact edit text matches more than once; include a larger unique anchor.');

    const startLine = matches[0]!;
    const matchLineCount = trimmedN.length;

    const candIndentMatch = (cLines[startLine] ?? '').match(/^[ \t]*/);
    const candIndent = candIndentMatch ? candIndentMatch[0] : '';
    const needleIndentMatch = (nLines[0] ?? '').match(/^[ \t]*/);
    const needleIndent = needleIndentMatch ? needleIndentMatch[0] : '';

    const repRawLines = replacement.split(/\r?\n/);
    const repLines = (repRawLines.length > 1 && repRawLines[repRawLines.length - 1] === '')
      ? repRawLines.slice(0, -1)
      : repRawLines;

    let adjustedRepLines = repLines;
    if (candIndent.length > needleIndent.length) {
      const extra = candIndent.slice(needleIndent.length);
      adjustedRepLines = repLines.map(line => {
        if (!line.trim()) return line;
        return line.startsWith(candIndent) ? line : (extra + line);
      });
    }

    cLines.splice(startLine, matchLineCount, ...adjustedRepLines);
    candidate = cLines.join(eol);
  }

  return candidate;
}
