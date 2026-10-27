import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { runTurn } from '../forge/turnRunner';
import { getConfig } from '../config';

type ToWebview =
  | { type: 'userMessage'; text: string }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; name: string; args: string }
  | { type: 'notice'; text: string }
  | { type: 'done'; status: string; error?: string }
  | { type: 'busy'; value: boolean };

/** Webview chat. All network work is async so the extension host never blocks. */
export class ChatPanel {
  private static current: ChatPanel | undefined;
  private sessionId: string | undefined;
  private running = false;

  static show(ctx: vscode.ExtensionContext, getClient: () => TrueForge): void {
    if (ChatPanel.current) { ChatPanel.current.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('forgeAgent', 'Forge Agent', vscode.ViewColumn.Beside, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')],
      retainContextWhenHidden: true,
    });
    ChatPanel.current = new ChatPanel(panel, ctx, getClient);
  }

  private constructor(private panel: vscode.WebviewPanel, private ctx: vscode.ExtensionContext, private getClient: () => TrueForge) {
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => { ChatPanel.current = undefined; });
    panel.webview.onDidReceiveMessage((m: { type: string; text?: string }) => {
      if (m.type === 'send' && m.text) void this.send(m.text);
      if (m.type === 'stop') void this.stop();
    });
  }

  private post(msg: ToWebview): void { void this.panel.webview.postMessage(msg); }

  private async send(text: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.post({ type: 'userMessage', text });
    this.post({ type: 'busy', value: true });
    try {
      const client = this.getClient();
      if (!this.sessionId) {
        const { data } = await client.sessions.create({ agent: { name: getConfig().agentName } });
        this.sessionId = data.id;
      }
      await runTurn(client, this.sessionId, [{ type: 'user.message', content: text }], {
        onTextDelta: (id, t) => this.post({ type: 'delta', id, text: t }),
        onToolCall: (name, args) => this.post({ type: 'tool', name, args }),
        onApprovalRequired: () => this.post({ type: 'notice', text: 'Approval required (review UI arrives in stage 4).' }),
        onDone: (status, error) => this.post({ type: 'done', status, error }),
      });
    } catch (err) {
      // One clear message, no stack trace.
      this.post({ type: 'done', status: 'error', error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
      this.post({ type: 'busy', value: false });
    }
  }

  /** sessions.cancel is idempotent; the open stream ends itself with turn.done(cancelled). */
  private async stop(): Promise<void> {
    if (!this.sessionId) return;
    try { await this.getClient().sessions.cancel(this.sessionId, {}); } catch { /* idempotent, ignore */ }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('hex');
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'main.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'main.css'));
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body>
<div id="log"></div>
<div id="bar"><textarea id="input" rows="3" placeholder="Ask Forge..."></textarea>
<button id="send">Send</button><button id="stop" disabled>Stop</button></div>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
  }
}
