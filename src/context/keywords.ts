const STOP = new Set(('a an the and or of to in on for with from that this it is are be as at by any all new add into its it\'s must should it also use used using ' +
  'where when which what how not no yes can will have has had than then them they their there these those other such like alongside covered documented appear appears').split(/\s+/));

/** Splits identifiers (snake_case / camelCase) and keeps distinctive words, most specific first. */
export function extractKeywords(request: string, max = 10): string[] {
  const words = request
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9_]+/)
    .flatMap((w) => (w.includes('_') && w.length > 5 ? [w, ...w.split('_')] : [w]))
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  // Keep first-appearance order (the request's own emphasis); the ranker weighs hits, not us.
  return [...new Set(words)].slice(0, max);
}

/** `@file:path` and `@symbol:name` mentions typed (or autocompleted) in the input box. */
export function parseMentions(text: string): { files: string[]; symbols: string[] } {
  const files: string[] = [];
  const symbols: string[] = [];
  for (const m of text.matchAll(/@(file|symbol):([^\s,;]+)/g)) (m[1] === 'file' ? files : symbols).push(m[2]!);
  return { files: [...new Set(files)], symbols: [...new Set(symbols)] };
}
