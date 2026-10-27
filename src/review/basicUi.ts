import * as vscode from 'vscode';
import type { ReviewRequest, ReviewUi } from './approvals';
import { applyHunks } from './hunks';
import { closeProposalTabs, type ProposalProvider } from './proposalProvider';

/** Stage-3 reviewer: shows the diff editor and asks accept-all / reject-all. (Stage 4 adds per-hunk review.) */
export class BasicReviewUi implements ReviewUi {
  constructor(private provider: ProposalProvider) {}

  async reviewHunks(req: ReviewRequest, _signal: AbortSignal): Promise<number[]> {
    const all = new Set(req.hunks.map((h) => h.id));
    const right = this.provider.uri(req.relPath, 'proposed');
    this.provider.set(right, applyHunks(req.oldText, req.newText, all));
    const left = req.isNew ? this.provider.uri(req.relPath, 'empty') : vscode.Uri.file(vscode.workspace.workspaceFolders![0]!.uri.fsPath + '/' + req.relPath);
    if (req.isNew) this.provider.set(left, '');
    await vscode.commands.executeCommand('vscode.diff', left, right, `Forge: ${req.relPath} (proposed)`);
    const pick = await vscode.window.showInformationMessage(`Forge proposes changes to ${req.relPath}. ${req.rationale}`, { modal: false }, 'Apply', 'Reject');
    await closeProposalTabs();
    return pick === 'Apply' ? [...all] : [];
  }

  async confirmCommand(command: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(`Forge wants to run a command:\n\n${command}`, { modal: true }, 'Run')) === 'Run';
  }

  close(): void { void closeProposalTabs(); }
}
