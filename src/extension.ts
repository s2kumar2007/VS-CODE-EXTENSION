import * as vscode from 'vscode';
import { getConfig } from './config';
import { startEditorMcpServer, type EditorMcpServer } from './mcp/server';
import { createClient, registerMcpServer } from './forge/client';
import { loadAgentFiles, syncAgents } from './forge/agents';
import { ChatPanel } from './panel/ChatPanel';

let mcp: EditorMcpServer | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const getClient = () => createClient(getConfig().baseUrl);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('forge.openPanel', () => ChatPanel.show(ctx, getClient)),
  );

  // Start the MCP server and register everything in the background: never block activation.
  void bootstrap(ctx, getClient);
}

async function bootstrap(ctx: vscode.ExtensionContext, getClient: () => ReturnType<typeof createClient>): Promise<void> {
  try {
    mcp = await startEditorMcpServer(() => { /* tools are added in stage 2 */ });
    const client = getClient();
    await registerMcpServer(client, mcp.url, mcp.token);
    const agents = await loadAgentFiles(vscode.Uri.joinPath(ctx.extensionUri, 'agents').fsPath);
    const results = await syncAgents(client, agents);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      void vscode.window.showWarningMessage(`Forge: could not sync agent(s) ${failed.map((f) => f.name).join(', ')}. Is TrueForge running and the model configured?`);
    }
  } catch {
    // TrueForge not reachable yet: the extension stays usable, the user can retry by reloading the window.
    void vscode.window.showWarningMessage('Forge: TrueForge is not reachable. Start it with `npx @truefoundry/trueforge@latest`, then reload the window.');
  }
}

export async function deactivate(): Promise<void> {
  await mcp?.dispose();
}
