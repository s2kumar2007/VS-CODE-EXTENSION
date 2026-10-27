import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { DirEntry, EditorApi, RunResult, SearchHit, SymbolHit } from './types';
import { rgSymbols, rgText } from './ripgrep';
import { runShell } from './runCommand';
import { resolveInside, resolveInsideReal, toRel } from './paths';
import { DecisionStore, proposalKey } from '../review/decisions';
import { applyHunks } from '../review/hunks';
import { UndoStack } from '../review/undo';

/** Finds a ripgrep binary: our own dependency first, then VS Code's bundled one, then PATH. */
export function findRg(extPath: string): string {
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg';
  try {
    const req = createRequire(path.join(extPath, 'package.json'));
    return req.resolve(`@vscode/ripgrep-${process.platform}-${process.arch}/bin/${exe}`);
  } catch { /* fall through */ }
  const app = vscode.env.appRoot;
  for (const p of [path.join(app, 'node_modules', '@vscode', 'ripgrep', 'bin', exe), path.join(app, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', exe)]) {
    try { require('node:fs').accessSync(p); return p; } catch { /* next */ }
  }
  return exe;
}

const KIND = (k: vscode.SymbolKind) => vscode.SymbolKind[k]?.toLowerCase() ?? 'symbol';

export class VsCodeEditorApi implements EditorApi {
  private commandAbort = new AbortController();
  beginRun(): void { this.commandAbort = new AbortController(); }
  cancelCommands(): void { this.commandAbort.abort(); }
  constructor(
    private rootDir: string,
    private rgPath: string,
    readonly decisions: DecisionStore,
    readonly undo: UndoStack,
  ) {}

  root(): string { return this.rootDir; }

  async readText(abs: string): Promise<string | undefined> {
    try {
      // openTextDocument returns unsaved edits too, so the agent sees what the user sees.
      return (await vscode.workspace.openTextDocument(vscode.Uri.file(abs))).getText();
    } catch { return undefined; }
  }

  async listDir(abs: string): Promise<DirEntry[]> {
    const items = await fs.readdir(abs, { withFileTypes: true });
    return items.map((d) => ({ name: d.name, type: d.isDirectory() ? 'dir' as const : 'file' as const }));
  }

  searchText(query: string, _max: number): Promise<SearchHit[]> { return rgText(this.rgPath, this.rootDir, query); }

  async searchSymbols(query: string, max: number): Promise<SymbolHit[]> {
    let hits: SymbolHit[] = [];
    try {
      const res = (await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', query)) ?? [];
      hits = res.filter((s) => { try { resolveInside(this.rootDir, s.location.uri.fsPath); return s.location.uri.scheme === 'file'; } catch { return false; } }).map((s) => ({
        name: s.name, kind: KIND(s.kind), path: toRel(this.rootDir, s.location.uri.fsPath), line: s.location.range.start.line + 1,
      }));
    } catch { /* no provider: use fallback */ }
    // Python etc. often have no workspace symbol provider installed: fall back to definition-line search.
    if (hits.length === 0) hits = await rgSymbols(this.rgPath, this.rootDir, query, max);
    return hits;
  }

  async runCommand(command: string): Promise<RunResult> {
    if (!this.decisions.takeCommand(command) || this.commandAbort.signal.aborted) throw new Error('Command was not approved or was cancelled.');
    return runShell(command, this.rootDir, 120_000, this.commandAbort.signal);
  }

  /**
   * Applies ONLY the hunks the user accepted, as a single WorkspaceEdit (= one undo step).
   * Refuses when there is no review decision for exactly this (path, content).
   */
  async applyProposal(abs: string, newContent: string): Promise<string> {
    const signal = this.commandAbort.signal;
    const decision = this.decisions.take(proposalKey(abs, newContent));
    if (!decision) return 'REFUSED: this proposal was not reviewed by the user, so nothing was written.';

    await resolveInsideReal(this.rootDir, abs);
    const uri = vscode.Uri.file(abs);
    const current = (await this.readText(abs)) ?? '';
    if (current !== decision.baseText) return 'REFUSED: the file changed while the proposal was under review; nothing was written. Re-read the file and propose again.';

    const accepted = new Set(decision.acceptedHunks);
    const merged = applyHunks(decision.baseText, decision.newText, accepted);
    const rejected = Array.from({ length: decision.totalHunks }, (_, i) => i + 1).filter((i) => !accepted.has(i));
    const exists = (await this.readText(abs)) !== undefined;

    const edit = new vscode.WorkspaceEdit();
    if (!exists) edit.createFile(uri, { ignoreIfExists: true });
    const doc = exists ? await vscode.workspace.openTextDocument(uri) : undefined;
    const range = doc ? new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)) : new vscode.Range(0, 0, 0, 0);
    if (signal.aborted || (doc && doc.getText() !== decision.baseText)) return 'REFUSED: cancelled or file changed during review.';
    edit.replace(uri, range, merged);
    if (!(await vscode.workspace.applyEdit(edit))) return 'ERROR: VS Code refused the edit; nothing was written.';
    this.undo.push({ path: abs, before: decision.baseText, after: merged, label: toRel(this.rootDir, abs), created: !exists });
    if (!(await (await vscode.workspace.openTextDocument(uri)).save())) return 'ERROR: reviewed edit applied in the editor but could not be saved; use Undo last to revert.';
    return `applied hunks ${accepted.size ? [...accepted].sort((a, b) => a - b).join(',') : 'none'}; rejected ${rejected.length ? rejected.join(',') : 'none'}`;
  }

  /** "Forge: Undo last applied change". */
  async undoLast(): Promise<string> {
    const e = this.undo.peek();
    if (!e) return 'Nothing to undo.';
    const uri = vscode.Uri.file(e.path);
    const doc = await vscode.workspace.openTextDocument(uri);
    if (doc.getText() !== e.after) return `Cannot undo ${e.label}: it was modified after the Forge change.`;
    const edit = new vscode.WorkspaceEdit();
    await resolveInsideReal(this.rootDir, e.path);
    if (e.created) edit.deleteFile(uri);
    else edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), e.before);
    if (!(await vscode.workspace.applyEdit(edit))) return 'Cannot undo: VS Code refused the edit.';
    if (!e.created && !(await doc.save())) return 'Cannot save undo; retry after resolving the save error.';
    this.undo.pop();
    return `Restored ${e.label}.`;
  }
}
