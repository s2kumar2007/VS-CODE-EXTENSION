import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { AgentController } from '../agent/controller';
import type { AgentUi } from '../agent/types';

type ToWebview =
  | { type: 'userMessage'; text: string }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; name: string }
  | { type: 'notice'; text: string }
  | { type: 'done'; status: string; message?: string }
  | { type: 'busy'; value: boolean };

/** Webview chat. A thin UI over AgentController; all network work is async so the host never blocks. */
export class ChatPanel {
  private static current: ChatPanel | undefined;

  static show(ctx: vscode.ExtensionContext, controller: AgentController): void {
    if (ChatPanel.current) { ChatPanel.current.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('forgeAgent', 'Forge Agent', vscode.ViewColumn.Beside, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')],
      retainContextWhenHidden: true,
    });
    ChatPanel.current = new ChatPanel(panel, ctx, controller);
  }

  private constructor(private panel: vscode.WebviewPanel, private ctx: vscode.ExtensionContext, private controller: AgentController) {
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => { ChatPanel.current = undefined; });
    panel.webview.onDidReceiveMessage((m: { type: string; text?: string }) => {
      if (m.type === 'send' && m.text) void this.send(m.text);
      if (m.type === 'stop') void this.controller.cancel();
    });
  }

  private post(msg: ToWebview): void { void this.panel.webview.postMessage(msg); }

  private async send(text: string): Promise<void> {
    if (this.controller.busy) return;
    this.post({ type: 'userMessage', text });
    this.post({ type: 'busy', value: true });
    const ui: AgentUi = {
      textDelta: (id, t) => this.post({ type: 'delta', id, text: t }),
      toolCall: (name) => this.post({ type: 'tool', name }),
      notice: (t) => { this.post({ type: 'notice', text: t }); void vscode.window.showWarningMessage('Forge: ' + t); },
      finished: (info) => this.post({ type: 'done', status: info.status, message: info.message }),
    };
    try { await this.controller.run(text, ui); } finally { this.post({ type: 'busy', value: false }); }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('hex');
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'main.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'main.css'));
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body>
<div id="log"></div>
<div id="bar"><textarea id="input" rows="3" placeholder="Ask Forge... (Ctrl+Enter to send)"></textarea>
<button id="send">Send</button><button id="stop" disabled>Stop</button></div>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
  }
}
