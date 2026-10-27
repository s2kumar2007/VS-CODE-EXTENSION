import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export class PathError extends Error {}

/**
 * Lexical containment check: resolves `p` against `root` and refuses anything that
 * lands outside it (../ escapes, absolute paths elsewhere, NUL bytes).
 */
export function resolveInside(root: string, p: string): string {
  if (typeof p !== 'string' || p.length === 0 || p.includes('\0')) throw new PathError('invalid path');
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  // `..foo` is a legal file name, so test for the segment, not the prefix.
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new PathError(`path escapes the workspace: ${p}`);
  }
  return abs;
}

/**
 * Same as resolveInside, plus a symlink check: the real location of the nearest
 * existing ancestor must also be inside the real workspace root.
 */
export async function resolveInsideReal(root: string, p: string): Promise<string> {
  const abs = resolveInside(root, p);
  const realRoot = await fs.realpath(root);
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const rel = path.relative(realRoot, real);
      if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
        throw new PathError(`path escapes the workspace via symlink: ${p}`);
      }
      return abs;
    } catch (e) {
      if (e instanceof PathError) throw e;
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const entry = await fs.lstat(probe).catch((err: NodeJS.ErrnoException) => { if (err.code !== 'ENOENT') throw err; return undefined; });
      if (entry?.isSymbolicLink()) throw new PathError('dangling symlink is not safe: ' + p);
      const parent = path.dirname(probe);
      if (parent === probe) return abs; // reached filesystem root without finding anything
      probe = parent; // file does not exist yet (new file): check its parent instead
    }
  }
}

/** Workspace-relative path with forward slashes (what we show to the model). */
export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}
