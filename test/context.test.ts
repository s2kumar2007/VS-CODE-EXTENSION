import { describe, it, expect } from 'vitest';
import { estimateTokens, packContext } from '../src/context/budget';
import { assembleContext, windows, type ContextDeps } from '../src/context/assemble';
import { extractKeywords, parseMentions } from '../src/context/keywords';
import { topLevelSymbols } from '../src/context/symbols';

describe('packContext (token budget)', () => {
  const item = (label: string, chars: number, priority: number) => ({ label, reason: 'r', text: ('x'.repeat(39) + '\n').repeat(chars / 40), priority });
  it('estimates ~4 chars per token', () => expect(estimateTokens('x'.repeat(400))).toBe(100));
  it('never exceeds the budget; higher priority first; truncates then drops', () => {
    const r = packContext([item('low', 4000, 1), item('high', 2000, 9), item('mid', 4000, 5)], 1000);
    expect(r.used).toBeLessThanOrEqual(1000);
    expect(r.packed[0]!.label).toBe('high');
    expect(r.packed.find((p) => p.label === 'mid')?.truncated).toBe(true);
    expect(r.dropped).toContain('low');
  });
});

describe('keywords & mentions', () => {
  it('extracts distinctive words from the Task B request', () => {
    const k = extractKeywords('Add a new built-in CLI command flask config that prints the loaded application\'s configuration as JSON, masking SECRET, PASSWORD, TOKEN or KEY');
    expect(k).toEqual(expect.arrayContaining(['config', 'command', 'cli']));
  });
  it('parses @file and @symbol mentions', () => {
    expect(parseMentions('fix @file:src/a.py and @symbol:get_debug_flag @file:src/a.py')).toEqual({ files: ['src/a.py'], symbols: ['get_debug_flag'] });
  });
  it('finds top-level python/ts symbols only', () => {
    expect(topLevelSymbols('def a():\n    def inner(): pass\nclass B:\n  x=1\nasync def c(): ...', 'x.py').map((s) => s.name)).toEqual(['a', 'B', 'c']);
    expect(topLevelSymbols('export async function foo() {}\nconst x = 1', 'x.ts').map((s) => s.name)).toEqual(['foo', 'x']);
  });
  it('merges nearby hit lines into windows', () => expect(windows([10, 12, 100], 200)).toEqual([[4, 18], [94, 106]]));
});

describe('assembleContext', () => {
  const cli = Array.from({ length: 300 }, (_, i) => (i === 100 ? 'def routes_command():' : `# line ${i + 1} config`)).join('\n');
  const files: Record<string, string> = { 'src/pkg/cli.py': cli, 'tests/test_cli.py': 'from pkg import cli\n\ndef test_x(): pass\n', 'docs/cli.rst': 'CLI\n===\n', 'src/pkg/other.py': 'x = 1\n' };
  const deps: ContextDeps = {
    listFiles: async () => Object.keys(files),
    searchKeyword: async (k) => Object.entries(files).flatMap(([p, t]) => t.split('\n').flatMap((l, i) => (l.toLowerCase().includes(k) ? [{ path: p, line: i + 1, text: l }] : []))).slice(0, 20),
    searchImporters: async (m) => Object.entries(files).filter(([, t]) => new RegExp(`from \\w+ import ${m}`).test(t)).map(([p]) => ({ path: p, line: 1, text: '' })),
    readText: async (p) => files[p],
    findSymbol: async () => undefined,
  };
  it('packs a shortlist under the budget with reasons, never whole big files', async () => {
    const r = await assembleContext('add a config command to the cli and test it', deps, 1500);
    expect(r.tokens).toBeLessThanOrEqual(1500);
    expect(r.items.some((i) => i.label.startsWith('src/pkg/cli.py'))).toBe(true);
    expect(r.items.every((i) => i.reason.length > 0)).toBe(true);
    expect(r.text).not.toContain('# line 250 config'); // far from any hit window is not included
    expect(r.items.some((i) => i.reason.includes('imports cli'))).toBe(true);
  });
});


describe('full rendered context bounds',()=>{
  it('accounts for metadata and fences with thousands of repository files',async()=>{
    const huge=Array.from({length:10000},(_,i)=>'config_value_'+i+' = "'+ 'x'.repeat(200)+'"').join('\n');
    const deps:ContextDeps={listFiles:async()=>Array.from({length:5000},(_,i)=>'src/config'+i+'.py'),searchKeyword:async()=>Array.from({length:1000},(_,i)=>({path:'src/config0.py',line:i+1,text:'config'})),searchImporters:async()=>[],readText:async()=>huge,findSymbol:async()=>undefined};
    for(const budget of [50,500,1500]){
      const r=await assembleContext('config @file:src/config0.py',deps,budget);
      expect(estimateTokens(r.text)).toBeLessThanOrEqual(budget);expect(r.tokens).toBe(estimateTokens(r.text));
      expect(r.text).not.toContain('config_value_9999');expect(r.items.every(i=>i.reason.length>0)).toBe(true);
    }
  });
  it('caps dense hit windows rather than merging the entire file',()=>{
    const w=windows(Array.from({length:1000},(_,i)=>i+1),1000);
    expect(w).toHaveLength(2);expect(w.every(([a,b])=>b-a<40)).toBe(true);
  });
  it('slices explicit mentions smaller than the old whole-file threshold',async()=>{
    const body=Array.from({length:100},(_,i)=>'# line '+i).join('\n');
    const deps:ContextDeps={listFiles:async()=>['a.py'],searchKeyword:async()=>[],searchImporters:async()=>[],readText:async()=>body,findSymbol:async()=>undefined};
    const r=await assembleContext('@file:a.py',deps,2000);expect(r.text).not.toContain('# line 99');
  });
});
