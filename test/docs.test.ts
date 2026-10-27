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
    expect(agents.find(a=>a.name==='forge-agent')?.manifest.model.name).toBe('google-gemini/gemini-3-8-flash');
    expect(agents.find(a=>a.name==='forge-agent-fallback')?.manifest.model.name).toBe('groq/gpt-oss-120b');
  });
});

it('documents that confirmed shell commands and prior effects are outside rollback guarantees',async()=>{
  const readme=await fs.readFile('README.md','utf8');
  expect(readme).toContain('not an OS sandbox');expect(readme).toContain('can retain previously approved effects');
  expect(readme).not.toContain('A cancelled or failed run therefore changes nothing');
});
