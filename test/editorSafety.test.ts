import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
const mock = vi.hoisted(() => ({ docs: new Map<string, string>(), calls: [] as any[], refuse: false, symbols: [] as any[] }));
vi.mock('vscode', () => ({
  commands: { executeCommand: async () => mock.symbols },
  env: { appRoot: '' },
  SymbolKind: { 0: 'File' },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  Range: class { constructor(..._args: any[]) {} },
  WorkspaceEdit: class {
    ops: any[] = [];
    createFile(uri: any) { this.ops.push({ type: 'create', path: uri.fsPath }); }
    deleteFile(uri: any) { this.ops.push({ type: 'delete', path: uri.fsPath }); }
    replace(uri: any, _range: any, text: string) { this.ops.push({ type: 'replace', path: uri.fsPath, text }); }
  },
  workspace: {
    openTextDocument: async (uri: any) => {
      if (!mock.docs.has(uri.fsPath)) throw Error('not found');
      return { getText: () => mock.docs.get(uri.fsPath)!, positionAt: (n: number) => n, save: async () => true };
    },
    applyEdit: async (edit: any) => {
      mock.calls.push(edit);
      if (mock.refuse) return false;
      for (const op of edit.ops) if (op.type === 'delete') mock.docs.delete(op.path); else mock.docs.set(op.path, op.text ?? '');
      return true;
    },
  },
}));
import { VsCodeEditorApi, findRg } from '../src/workspace/vscodeApi';
import { DecisionStore, proposalKey } from '../src/review/decisions';
import { UndoStack } from '../src/review/undo';
import { computeHunks } from '../src/review/hunks';
let root: string, file: string, store: DecisionStore, undo: UndoStack, api: VsCodeEditorApi;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-'));
  file = path.join(root, 'f.txt'); store = new DecisionStore(); undo = new UndoStack();
  api = new VsCodeEditorApi(root, 'rg', store, undo);
  mock.docs.clear(); mock.calls.length = 0; mock.refuse = false;
});
function approve(before: string, after: string, accepted = computeHunks(before, after).map(h => h.id)) {
  store.put(proposalKey(file, after), { baseText: before, newText: after, acceptedHunks: accepted, totalHunks: computeHunks(before, after).length });
}
describe('editor write boundary and undo', () => {
  it('refuses unreviewed and stale proposals and unapproved commands', async () => {
    mock.docs.set(file,'a');
    expect(await api.applyProposal(file,'b')).toContain('REFUSED');
    approve('old','b'); expect(await api.applyProposal(file,'b')).toContain('REFUSED');
    await expect(api.runCommand('echo hi')).rejects.toThrow('not approved');
    expect(mock.calls).toHaveLength(0);
  });
  it('applies accepted hunks in one edit and undoes several changes after fresh document opens', async () => {
    const before='a\nb\nc\nd\n'; const after='A\nb\nc\nD\n';
    mock.docs.set(file,before); approve(before,after,[2]);
    await api.applyProposal(file,after);
    expect(mock.docs.get(file)).toBe('a\nb\nc\nD\n');
    expect(mock.calls).toHaveLength(1);
    const next='a\nB\nc\nD\n'; approve(mock.docs.get(file)!,next); await api.applyProposal(file,next);
    expect(await api.undoLast()).toContain('Restored');
    expect(mock.docs.get(file)).toBe('a\nb\nc\nD\n');
    expect(await api.undoLast()).toContain('Restored');
    expect(mock.docs.get(file)).toBe(before);
  });
  it('does not clobber later edits or lose history on a failed undo', async () => {
    mock.docs.set(file,'a'); approve('a','b'); await api.applyProposal(file,'b');
    mock.docs.set(file,'later'); expect(await api.undoLast()).toContain('modified'); expect(undo.size).toBe(1);
    mock.docs.set(file,'b'); mock.refuse=true; expect(await api.undoLast()).toContain('refused'); expect(undo.size).toBe(1);
    mock.refuse=false; await api.undoLast(); expect(mock.docs.get(file)).toBe('a');
  });
  it('undo deletes new files and cancel blocks a queued write', async () => {
    approve('','new'); await api.applyProposal(file,'new');
    await api.undoLast(); expect(mock.docs.has(file)).toBe(false);
    approve('','late'); api.cancelCommands(); expect(await api.applyProposal(file,'late')).toContain('REFUSED');
    expect(mock.docs.has(file)).toBe(false);
  });
});


it('rejects sibling workspace prefixes from language-server symbols',async()=>{
  mock.symbols=[{name:'safe',kind:0,location:{uri:{scheme:'file',fsPath:path.join(root,'safe.py')},range:{start:{line:0}}}},{name:'outside',kind:0,location:{uri:{scheme:'file',fsPath:path.join(root+'-other','outside.py')},range:{start:{line:0}}}}];
  // No accepted symbols means rg fallback; provide one valid symbol to avoid it.
  const hits=await api.searchSymbols('safe',10);
  expect(hits.map(h=>h.name)).toEqual(['safe']);
});
it('resolves the host binary even when npm_config_arch is inherited for another target',()=>{
  const previous=process.env.npm_config_arch;
  process.env.npm_config_arch='not-this-host';
  try { expect(findRg(process.cwd())).toContain('ripgrep-'+process.platform+'-'+process.arch); }
  finally { if(previous===undefined)delete process.env.npm_config_arch;else process.env.npm_config_arch=previous; }
});
