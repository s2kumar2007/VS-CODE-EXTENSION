import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ReviewApprovals } from '../src/review/approvals';
import { DecisionStore, proposalKey } from '../src/review/decisions';
import { applyHunks, computeHunks, normalizeEol } from '../src/review/hunks';
import { runShell, truncateOutput, validateCommandPaths, MAX_OUTPUT_BYTES } from '../src/workspace/runCommand';

const root = os.tmpdir();
describe('local approval safety', () => {
  it('does not store late hunk or command approvals after cancellation', async () => {
    const store = new DecisionStore(), abort = new AbortController();
    const approvals = new ReviewApprovals({ root, store, readText: async () => 'a\n', ui: {
      reviewHunks: async () => { abort.abort(); return [1]; }, confirmCommand: async () => true, close() {},
    }});
    expect((await approvals.decide({name:'propose_write',args:{path:'late.txt',new_content:'b\n'}},abort.signal)).status).toBe('deny');
    expect(store.size).toBe(0);
    expect((await approvals.decide({name:'run_command',args:{command:'echo hi'}},abort.signal)).status).toBe('deny');
    expect(store.takeCommand('echo hi')).toBe(false);
  });
  it('requires single-use exact command permits and clears them at run boundaries', () => {
    const store = new DecisionStore();
    expect(store.takeCommand('echo hi')).toBe(false);
    store.permitCommand('echo hi');
    expect(store.takeCommand('echo bye')).toBe(false);
    expect(store.takeCommand('echo hi')).toBe(true);
    expect(store.takeCommand('echo hi')).toBe(false);
    store.permitCommand('echo hi'); store.clear();
    expect(store.takeCommand('echo hi')).toBe(false);
  });
  it('reviews CRLF content without turning unchanged lines into hunks', async () => {
    const store = new DecisionStore();
    const old = 'a\r\nb\r\nc\r\nd\r\ne\r\n';
    const proposed = 'a\nB\nc\nd\nE';
    const approvals = new ReviewApprovals({ root, store, readText: async () => old, ui: {
      reviewHunks: async r => { expect(r.hunks).toHaveLength(2); return [1]; }, confirmCommand: async()=>false, close() {},
    }});
    await approvals.decide({ name:'propose_write', args:{path:'eol.txt',new_content:proposed}},new AbortController().signal);
    const d = store.take(proposalKey(path.join(root,'eol.txt'),proposed))!;
    expect(applyHunks(d.baseText,d.newText,new Set(d.acceptedHunks))).toBe('a\r\nB\r\nc\r\nd\r\ne\r\n');
    const normalized=normalizeEol(old,proposed);
    expect(applyHunks(old,normalized,new Set(computeHunks(old,normalized).map(h=>h.id)))).toBe('a\r\nB\r\nc\r\nd\r\nE');
  });
});

describe('command execution', () => {
  it('caps UTF-8 output in bytes, including marker', () => {
    const out=truncateOutput('😀'.repeat(10000));
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(out).toContain('truncated');
  });
  it('rejects traversal, outside absolute paths, and directory symlinks', async () => {
    for(const command of ['cat ../secret', 'cat /etc/passwd', 'type C:\\outside\\secret']) await expect(validateCommandPaths(root,command)).rejects.toThrow();
    const dir=await fs.mkdtemp(path.join(root,'cmd-path-'));
    await fs.symlink(root,path.join(dir,'link'),process.platform==='win32'?'junction':'dir');
    await expect(validateCommandPaths(dir,'cat link/secret')).rejects.toThrow();
  });
  it('terminates a running child tree on timeout', async () => {
    const dir=await fs.mkdtemp(path.join(root,'cmd-timeout-'));
    const result=await runShell('node -e "setInterval(()=>{},1000)"',dir,200);
    expect(result.timedOut).toBe(true);
  },10000);
  it('kills on abort and never starts already-cancelled commands', async () => {
    const dir=await fs.mkdtemp(path.join(root,'cmd-abort-'));
    const abort=new AbortController();
    const pending=runShell('node -e "setInterval(()=>{},1000)"',dir,10000,abort.signal);
    setTimeout(()=>abort.abort(),200);
    expect((await pending).timedOut).toBe(false);
    expect(await runShell('echo should-not-start',dir,1000,abort.signal)).toMatchObject({output:'Cancelled.'});
  },10000);
});
