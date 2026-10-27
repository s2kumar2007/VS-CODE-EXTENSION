import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ReviewRequest, ReviewUi } from './approvals';
import { applyHunks } from './hunks';
import { closeProposalTabs, type ProposalProvider } from './proposalProvider';

type FromWebview = { type: 'toggle'; id: number; accepted: boolean } | { type: 'all'; accepted: boolean } | { type: 'confirm' } | { type: 'cancel' };

/**
 * Per-hunk review: a native diff editor (right side = file with the CURRENTLY accepted hunks applied,
 * updates live) plus a webview list with Accept/Reject per hunk, Accept all / Reject all, Confirm.
 */
export class ReviewPanel implements ReviewUi {
  private panel: vscode.WebviewPanel | undefined;
  private dismissCommand: (() => void) | undefined;
  private settle: ((accepted: number[]) => void) | undefined;

  constructor(private ctx: vscode.ExtensionContext, private provider: ProposalProvider, private root: string) {}

  reviewHunks(req: ReviewRequest, signal: AbortSignal): Promise<number[]> {
    return new Promise<number[]>((resolve) => {
      this.close(); // one review at a time
      const state = new Map<number, boolean>(req.hunks.map((h) => [h.id, true]));
      const right = this.provider.uri(req.relPath, 'proposed-' + randomBytes(4).toString('hex'));
      const left = req.isNew ? this.provider.uri(req.relPath, 'empty') : vscode.Uri.file(path.join(this.root, req.relPath));
      if (req.isNew) this.provider.set(left, '');
      const refresh = () => this.provider.set(right, applyHunks(req.oldText, req.newText, new Set([...state].filter(([, v]) => v).map(([k]) => k))));
      refresh();

      const panel = vscode.window.createWebviewPanel('forgeReview', `Forge review: ${req.relPath}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
      });
      this.panel = panel;
      panel.webview.html = this.html(panel.webview);

      let finished = false;
      const finish = (accepted: number[]) => {
        if (finished) return;
        finished = true;
        this.settle = undefined;
        signal.removeEventListener('abort', onAbort);
        this.provider.drop(right);
        void closeProposalTabs();
        if (this.panel === panel) this.panel = undefined;
        panel.dispose();
        resolve(accepted);
      };
      const onAbort = () => finish([]);
      signal.addEventListener('abort', onAbort);
      if (signal.aborted) return finish([]);
      this.settle = finish;

      panel.onDidDispose(() => finish([])); // closing the panel = reject all
      panel.webview.onDidReceiveMessage((m: FromWebview) => {
        if (m.type === 'toggle') { state.set(m.id, m.accepted); refresh(); }
        else if (m.type === 'all') { for (const k of state.keys()) state.set(k, m.accepted); refresh(); void panel.webview.postMessage({ type: 'state', all: m.accepted }); }
        else if (m.type === 'confirm') finish([...state].filter(([, v]) => v).map(([k]) => k));
        else if (m.type === 'cancel') finish([]);
      });
      void panel.webview.postMessage({ type: 'init', path: req.relPath, rationale: req.rationale, isNew: req.isNew, hunks: req.hunks });
      void vscode.commands.executeCommand('vscode.diff', left, right, `Forge: ${req.relPath} (proposed)`, { preview: true });
    });
  }

  confirmCommand(command: string, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      const picker = vscode.window.createQuickPick();
      picker.title = 'Forge: approve shell command (runs with your user permissions)';
      picker.placeholder = command;
      picker.items = [{ label: 'Cancel' }, { label: 'Run', description: command }];
      let finished = false;
      const finish = (allow: boolean) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', abort);
        this.dismissCommand = undefined;
        picker.dispose();
        resolve(allow && !signal.aborted);
      };
      const abort = () => finish(false);
      this.dismissCommand = abort;
      signal.addEventListener('abort', abort, { once: true });
      picker.onDidAccept(() => finish(picker.selectedItems[0]?.label === 'Run'));
      picker.onDidHide(abort);
      picker.show();
    });
  }

  /** Cancel path: resolves any pending review as "nothing accepted" and removes all review UI. */
  close(): void {
    this.dismissCommand?.();
    this.settle?.([]);
    this.panel?.dispose();
    this.panel = undefined;
    void closeProposalTabs();
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('hex');
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'review.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'review.css'));
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body>
<h3 id="title"></h3><div id="why"></div>
<div id="top"><button id="acceptAll">Accept all</button><button id="rejectAll">Reject all</button></div>
<div id="hunks"></div>
<div id="bottom"><button id="confirm">Confirm</button><button id="cancel">Cancel</button></div>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
  }
}
