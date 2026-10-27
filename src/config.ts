import * as vscode from 'vscode';

/** Typed access to the `forge.*` settings. Read lazily so changes apply without reload. */
export function getConfig() {
  const c = vscode.workspace.getConfiguration('forge');
  return {
    baseUrl: c.get<string>('baseUrl', 'http://localhost:8790'),
    agentName: c.get<string>('agentName', 'forge-agent'),
    fallbackAgentName: c.get<string>('fallbackAgentName', 'forge-agent-fallback'),
  };
}
