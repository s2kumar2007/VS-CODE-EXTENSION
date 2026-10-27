import * as vscode from 'vscode';
import type { ContextDeps } from './assemble';
import type { VsCodeEditorApi } from '../workspace/vscodeApi';
import { rgFiles, rgRegex, rgText } from '../workspace/ripgrep';
import { resolveInsideReal } from '../workspace/paths';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Real workspace access for the context assembler. The file list (repo map input) is cached and invalidated by a watcher. */
export class WorkspaceContextDeps implements ContextDeps {
  private files: string[] | undefined;

  constructor(private api: VsCodeEditorApi, private rgPath: string, private root: string) {
    const w = vscode.workspace.createFileSystemWatcher('**/*');
    const reset = () => { this.files = undefined; };
    w.onDidCreate(reset); w.onDidDelete(reset);
  }

  async listFiles(): Promise<string[]> { return (this.files ??= await rgFiles(this.rgPath, this.root)); }
  searchKeyword(k: string) { return rgText(this.rgPath, this.root, k, 5); }
  searchImporters(mod: string) {
    const m = escapeRe(mod);
    return rgRegex(this.rgPath, this.root, `^\\s*(from\\s+[\\w.]*\\b${m}\\b|import\\s+.*\\b${m}\\b)|(require|from)\\s*\\(?['"][^'"]*\\b${m}\\b`, 1);
  }
  async readText(rel: string) { try { return await this.api.readText(await resolveInsideReal(this.root, rel)); } catch { return undefined; } }
  async findSymbol(name: string) {
    const hits = await this.api.searchSymbols(name, 10);
    return hits.find((h) => h.name === name) ?? hits[0];
  }

  /** Autocomplete for the input box: `file:` prefix -> paths, `symbol:` prefix -> symbols. */
  async suggest(prefix: string): Promise<{ insert: string; label: string }[]> {
    if (prefix.startsWith('symbol:')) {
      const q = prefix.slice(7);
      return (await this.api.searchSymbols(q || 'a', 8)).map((s) => ({ insert: `@symbol:${s.name}`, label: `${s.name}  ${s.path}:${s.line}` }));
    }
    const q = prefix.replace(/^file:/, '').toLowerCase();
    return (await this.listFiles()).filter((f) => f.toLowerCase().includes(q)).slice(0, 8).map((f) => ({ insert: `@file:${f}`, label: f }));
  }
}
