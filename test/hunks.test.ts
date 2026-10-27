import { describe, it, expect } from 'vitest';
import { computeHunks, applyHunks } from '../src/review/hunks';

const OLD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', ''].join('\n');
const NEW = ['a', 'B', 'c', 'd', 'e', 'F', 'F2', 'g', 'h', ''].join('\n');

describe('hunks', () => {
  it('splits independent changes into separate hunks', () => {
    const h = computeHunks(OLD, NEW);
    expect(h.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(h[0]).toMatchObject({ removed: 'b\n', added: 'B\n', oldStart: 2 });
    expect(h[2]).toMatchObject({ removed: '', added: 'h\n' });
  });
  it('accept all = new text, accept none = old text', () => {
    expect(applyHunks(OLD, NEW, new Set([1, 2, 3]))).toBe(NEW);
    expect(applyHunks(OLD, NEW, new Set())).toBe(OLD);
  });
  it('applies only accepted hunks', () => {
    expect(applyHunks(OLD, NEW, new Set([1, 3]))).toBe(['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', ''].join('\n'));
  });
  it('handles new files and deletions and missing trailing newline', () => {
    expect(applyHunks('', 'x\n', new Set([1]))).toBe('x\n');
    expect(applyHunks('x\ny\n', 'x\n', new Set([1]))).toBe('x\n');
    expect(applyHunks('x', 'x\ny', new Set([1]))).toBe('x\ny');
    expect(computeHunks('same\n', 'same\n')).toEqual([]);
  });
});
