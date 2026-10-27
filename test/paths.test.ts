import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveInside, resolveInsideReal, PathError } from '../src/workspace/paths';

const root = path.resolve('/tmp/ws-root');

describe('resolveInside', () => {
  it('accepts files inside the workspace', () => {
    expect(resolveInside(root, 'src/a.py')).toBe(path.join(root, 'src/a.py'));
    expect(resolveInside(root, './a/../b.txt')).toBe(path.join(root, 'b.txt'));
    expect(resolveInside(root, '..foo')).toBe(path.join(root, '..foo')); // legal name, not an escape
  });
  it('rejects escapes, outside absolutes, and bad input', () => {
    expect(() => resolveInside(root, '../etc/passwd')).toThrow(PathError);
    expect(() => resolveInside(root, 'a/../../x')).toThrow(PathError);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(PathError);
    expect(() => resolveInside(root, '')).toThrow(PathError);
    expect(() => resolveInside(root, 'a\0b')).toThrow(PathError);
  });
});

describe('resolveInsideReal (symlinks)', () => {
  it('rejects a symlink pointing outside, allows new files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
    fs.symlinkSync(outside, path.join(dir, 'link'));
    await expect(resolveInsideReal(dir, 'link/secret.txt')).rejects.toThrow(PathError);
    await expect(resolveInsideReal(dir, 'new/dir/file.txt')).resolves.toBe(path.join(dir, 'new/dir/file.txt'));
  });
});
