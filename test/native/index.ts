/** Run in a disposable VS Code extension development host, not in Vitest. */
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { strict as assert } from 'node:assert';
import { VsCodeEditorApi, findRg } from '../../src/workspace/vscodeApi';
import { DecisionStore, proposalKey } from '../../src/review/decisions';
import { UndoStack } from '../../src/review/undo';
import { computeHunks } from '../../src/review/hunks';
export async function run(): Promise<void> {
  const root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
  const store = new DecisionStore(), undo = new UndoStack();
  const ext = vscode.extensions.getExtension('forge-agent-dev.forge-agent')!;
  await ext.activate();
  assert.equal(ext.isActive, true, 'installed bundled extension must activate without excluded dependencies');
  const api = new VsCodeEditorApi(root, findRg(ext.extensionPath), store, undo);
  const file = path.join(root, 'native.txt');
  const before = 'a\r\nb\r\nc\r\nd\r\n';
  const after = 'A\r\nb\r\nc\r\nD\r\n';
  const evidence: string[] = [];
  const approve = (base: string, next: string) => store.put(proposalKey(file, next), {
    baseText: base, newText: next, acceptedHunks: computeHunks(base, next).map(h => h.id), totalHunks: computeHunks(base, next).length,
  });
  try {
    await fs.writeFile(file, before);
    let doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(doc);
    approve(before, after); assert.match(await api.applyProposal(file, after), /applied/);
    assert.equal(doc.getText(), after);
    // Startup panels can steal keyboard focus; target the editor before Undo.
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    const changed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Native Undo did not restore the document within 5 seconds')); }, 5000);
      const subscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === doc.uri.toString() && doc.getText() === before) { clearTimeout(timer); subscription.dispose(); resolve(); }
      });
    });
    await vscode.commands.executeCommand('undo');
    await changed;
    assert.equal(doc.getText(), before, 'one native undo must revert a reviewed change');
    await doc.save(); evidence.push('one native undo step restores CRLF content');
    undo.pop();
    approve(before, after); await api.applyProposal(file, after);
    const next = after.replace('b', 'B'); approve(after, next); await api.applyProposal(file, next);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(doc);
    assert.match(await api.undoLast(), /Restored/); assert.equal(doc.getText(), after);
    assert.match(await api.undoLast(), /Restored/); assert.equal(doc.getText(), before);
    evidence.push('Undo last works twice after editor close/reopen');
    approve(before, after); await api.applyProposal(file, after);
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), 'later '));
    assert.match(await api.undoLast(), /modified/); assert.ok(doc.getText().startsWith('later '));
    evidence.push('Undo last preserves later manual edits');
    assert.ok((await api.searchText('A', 20)).length > 0);
    evidence.push('resolved ripgrep executable runs in the extension host');
    if (process.env.FORGE_NATIVE_RESULT) await fs.writeFile(process.env.FORGE_NATIVE_RESULT, JSON.stringify({ ok: true, evidence }, null, 2));
  } catch (error) {
    if (process.env.FORGE_NATIVE_RESULT) await fs.writeFile(process.env.FORGE_NATIVE_RESULT, JSON.stringify({ ok: false, evidence, error: String(error), stack: (error as Error).stack }, null, 2));
    throw error;
  }
}
