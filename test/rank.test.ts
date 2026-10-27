import { describe, it, expect } from 'vitest';
import { rankTextHits, rankSymbols } from '../src/context/rank';
import { truncateOutput } from '../src/workspace/runCommand';

describe('ranking', () => {
  it('prefers files with definitions, name matches and more hits, with a why', () => {
    const r = rankTextHits([
      { path: 'a.py', line: 1, text: 'x = debug' }, { path: 'b/debug.py', line: 3, text: 'def get_debug_flag():' }, { path: 'b/debug.py', line: 9, text: 'debug' },
    ], 'debug', 10);
    expect(r[0]!.path).toBe('b/debug.py');
    expect(r[0]!.why).toContain('contains a definition');
  });
  it('ranks exact symbol names first', () => {
    const r = rankSymbols([{ name: 'config_cmd', kind: 'function', path: 'a', line: 1 }, { name: 'config', kind: 'function', path: 'b', line: 1 }], 'config', 5);
    expect(r[0]!.name).toBe('config');
  });
});

describe('command output truncation', () => {
  it('caps at ~8KB keeping head and tail', () => {
    const s = 'x'.repeat(20000) + 'TAIL';
    const t = truncateOutput(s);
    expect(Buffer.byteLength(t)).toBeLessThanOrEqual(8192);
    expect(t.endsWith('TAIL')).toBe(true);
  });
});
