import { describe,it,expect } from 'vitest';
import * as fs from 'node:fs/promises';
import { loadAgentFiles } from '../src/forge/agents';
describe('submission documentation contracts',()=>{
  it('keeps the eight write-up sections',async()=>{
    const text=await fs.readFile('docs/WRITEUP.md','utf8');
    expect((text.match(/^## \d\./gm)||[])).toHaveLength(8);
  });
  it('keeps model references synchronized with documented configured names',async()=>{
    const agents=await loadAgentFiles('agents');const readme=await fs.readFile('README.md','utf8');
    for(const agent of agents)expect(readme).toContain(agent.manifest.model.name);
    expect(agents.find(a=>a.name==='forge-agent')?.manifest.model.name).toBe('google-gemini/gemini-3-5-flash');
    expect(agents.find(a=>a.name==='forge-agent-fallback')?.manifest.model.name).toBe('groq/gpt-oss-120b');
  });
});

it('documents that confirmed shell commands and prior effects are outside rollback guarantees',async()=>{
  const readme=await fs.readFile('README.md','utf8');
  expect(readme).toContain('not an OS sandbox');expect(readme).toContain('can retain previously approved effects');
  expect(readme).not.toContain('A cancelled or failed run therefore changes nothing');
});

it('provides repository metadata for VSIX README link rewriting',async()=>{
 const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
 expect(pkg.repository).toEqual({type:'git',url:'https://github.com/s2kumar2007/VS-CODE-EXTENSION.git'});
});

it('maps every organizer criterion and preserves the official 100-point weights',async()=>{
 const rubric=JSON.parse(await fs.readFile('docs/official-rubric.json','utf8'));
 expect(rubric.criteria.map((r:any)=>[r.id,r.points])).toEqual([['A1',10],['A2',10],['A3',10],['B1',15],['B2',10],['B3',10],['B4',10],['C1',10],['C2',15]]);
 expect(rubric.criteria.reduce((sum:number,r:any)=>sum+r.points,0)).toBe(100);
 const doc=await fs.readFile('docs/RUBRIC.md','utf8');const writeup=await fs.readFile('docs/WRITEUP.md','utf8');
 for(const r of rubric.criteria){expect(doc).toContain('| '+r.id+' |');expect(writeup).toContain('| '+r.id+' '+r.focus+' |');}
 expect(rubric.source.sha256).toMatch(/^[a-f0-9]{64}$/);
 expect(rubric.source.url).toBe('https://techfest.org/media/compiProbStatement/TrueFoundry_Forge-a-thon_compressed_UvvRJ9C.pdf');
});

it('uses the official inline request for the failure demo rather than the greeting probe',async()=>{
 const demo=await fs.readFile('scripts/demo.md','utf8');
 const failure=demo.split(/## Task C\b/)[1]!.split('## Automated evidence')[0]!;
 expect(failure).toContain('Repeat the exact Task A inline-edit request');
 expect(failure).not.toContain('Send a read-only request');
 expect(demo).not.toContain('live bad-key Task C passed');
});
