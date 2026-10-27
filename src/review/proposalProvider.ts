import * as vscode from 'vscode';

export const PROPOSAL_SCHEME = 'forge-proposal';

/** Virtual documents for the "proposed" side of the diff editor (nothing touches disk). */
export class ProposalProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  uri(rel: string, token: string): vscode.Uri { return vscode.Uri.from({ scheme: PROPOSAL_SCHEME, path: '/' + rel, query: token }); }
  set(uri: vscode.Uri, text: string): void { this.contents.set(uri.toString(), text); this.emitter.fire(uri); }
  drop(uri: vscode.Uri): void { this.contents.delete(uri.toString()); }
  provideTextDocumentContent(uri: vscode.Uri): string { return this.contents.get(uri.toString()) ?? ''; }
}

/** Closes any open Forge diff tabs (used on cancel / after review). */
export async function closeProposalTabs(): Promise<void> {
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputTextDiff && t.input.modified.scheme === PROPOSAL_SCHEME);
  if (tabs.length) await vscode.window.tabGroups.close(tabs);
}
