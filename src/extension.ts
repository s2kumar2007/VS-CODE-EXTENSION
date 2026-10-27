import * as vscode from 'vscode';
import { getConfig } from './config';
import { startEditorMcpServer, type EditorMcpServer } from './mcp/server';
import { createClient, registerMcpServer } from './forge/client';
import { loadAgentFiles, syncAgents } from './forge/agents';
import { ChatPanel } from './panel/ChatPanel';
import { registerEditorTools } from './mcp/tools';
import { findRg, VsCodeEditorApi } from './workspace/vscodeApi';
import { DecisionStore } from './review/decisions';
import { UndoStack } from './review/undo';
import { AgentController } from './agent/controller';
import { ReviewApprovals } from './review/approvals';
import { ReviewPanel } from './review/ReviewPanel';
import { ProposalProvider, PROPOSAL_SCHEME } from './review/proposalProvider';
import { inlineEdit } from './inline/inlineEdit';

let mcp: EditorMcpServer | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const store = new DecisionStore();
  const undo = new UndoStack();
  const api = root ? new VsCodeEditorApi(root, findRg(ctx.extensionUri.fsPath), store, undo) : undefined;

  const provider = new ProposalProvider();
  ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, provider));

  const approvals = new ReviewApprovals({
    root: root ?? '', ui: new ReviewPanel(ctx, provider, root ?? ''), store,
    readText: (abs) => api?.readText(abs) ?? Promise.resolve(undefined),
  });
  const controller = new AgentController({
    getClient: () => createClient(getConfig().baseUrl),
    approvals,
    agents: () => ({ primary: getConfig().agentName, fallback: getConfig().fallbackAgentName }),
    onCancel: () => store.clear(),
  });

  ctx.subscriptions.push(
    vscode.commands.registerCommand('forge.openPanel', () => ChatPanel.show(ctx, controller)),
    vscode.commands.registerCommand('forge.inlineEdit', () => inlineEdit(controller, 'forge-inline')),
    vscode.commands.registerCommand('forge.undoLast', async () => { if (api) void vscode.window.showInformationMessage('Forge: ' + await api.undoLast()); }),
  );

  // Start the MCP server and register everything in the background: never block activation.
  if (api) void bootstrap(ctx, api);
}

async function bootstrap(ctx: vscode.ExtensionContext, api: VsCodeEditorApi): Promise<void> {
  try {
    mcp = await startEditorMcpServer((server) => registerEditorTools(server, api));
    const client = createClient(getConfig().baseUrl);
    await registerMcpServer(client, mcp.url, mcp.token);
    const agents = await loadAgentFiles(vscode.Uri.joinPath(ctx.extensionUri, 'agents').fsPath);
    const failed = (await syncAgents(client, agents)).filter((r) => !r.ok);
    if (failed.length) void vscode.window.showWarningMessage(`Forge: could not sync agent(s) ${failed.map((f) => f.name).join(', ')}. Is the model configured in TrueForge?`);
  } catch {
    void vscode.window.showWarningMessage('Forge: TrueForge is not reachable. Start it with `npx @truefoundry/trueforge@latest`, then reload the window.');
  }
}

export async function deactivate(): Promise<void> { await mcp?.dispose(); }
