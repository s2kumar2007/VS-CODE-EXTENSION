import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerEditorTools } from '../src/mcp/tools';
import type { EditorApi } from '../src/workspace/types';
import { rgText } from '../src/workspace/ripgrep';

const rg = path.resolve(`node_modules/@vscode/ripgrep-${process.platform}-${process.arch}/bin/${process.platform === 'win32' ? 'rg.exe' : 'rg'}`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'));
fs.writeFileSync(path.join(dir, 'a.py'), 'def hello():\n    return 1\n');
const writes: string[] = [];
const candidates: string[] = [];

const api: EditorApi = {
  root: () => dir,
  readText: async (abs) => (fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined),
  listDir: async (abs) => fs.readdirSync(abs, { withFileTypes: true }).map((d) => ({ name: d.name, type: d.isDirectory() ? 'dir' : 'file' })),
  searchText: (q) => rgText(rg, dir, q),
  searchSymbols: async () => [],
  runCommand: async () => ({ exitCode: 0, output: 'ok', timedOut: false }),
  applyProposal: async (abs, candidate) => { writes.push(abs); candidates.push(candidate); return 'REFUSED: not reviewed'; },
};

async function connect() {
  const server = new McpServer({ name: 't', version: '0' });
  registerEditorTools(server, api);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const text = (r: any) => r.content.map((c: any) => c.text).join('\n');

describe('MCP editor tools', () => {
  it('lists the five tools', async () => {
    const c = await connect();
    expect((await c.listTools()).tools.map((t) => t.name).sort()).toEqual(['list_dir', 'propose_write', 'read_file', 'run_command', 'search_workspace']);
  });
  it('reads a line slice and refuses paths outside the workspace', async () => {
    const c = await connect();
    expect(text(await c.callTool({ name: 'read_file', arguments: { path: 'a.py', start: 2, end: 2 } }))).toContain('    return 1');
    const bad: any = await c.callTool({ name: 'read_file', arguments: { path: '../../etc/passwd' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('Refused');
  });
  it('searches with ranked results and a why', async () => {
    const c = await connect();
    expect(text(await c.callTool({ name: 'search_workspace', arguments: { query: 'hello', kind: 'text' } }))).toMatch(/a\.py:1.*why:/);
  });
  it('propose_write only reaches the reviewed-apply path and never writes by itself', async () => {
    const c = await connect();
    const r = await c.callTool({ name: 'propose_write', arguments: { path: 'a.py', new_content: 'x', rationale: 'r' } });
    expect(text(r)).toContain('REFUSED');
    expect(fs.readFileSync(path.join(dir, 'a.py'), 'utf8')).toContain('def hello');
  });
});

it('materializes exact MCP edits but still refuses an unreviewed write',async()=>{
 const client=await connect();const before=fs.readFileSync(path.join(dir,'a.py'),'utf8');
 const result=await client.callTool({name:'propose_write',arguments:{path:'a.py',rationale:'test',edits:[{old_text:'return 1',new_text:'return 2'}]}});
 expect(candidates.at(-1)).toBe(before.replace('return 1','return 2'));expect(text(result)).toContain('REFUSED');expect(fs.readFileSync(path.join(dir,'a.py'),'utf8')).toBe(before);
});
