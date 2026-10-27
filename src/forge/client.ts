import { TrueForge } from '@truefoundry/trueforge-sdk';

export const MCP_SERVER_NAME = 'forge-editor';

/** One client per base URL; 10 min timeout because agent turns can be long. */
export function createClient(baseUrl: string): TrueForge {
  return new TrueForge({ baseUrl, timeoutInSeconds: 600 });
}

/**
 * Registers (or rotates) our local MCP server in TrueForge via
 * PUT /api/v1/settings/mcp-servers (SDK: settings.mcpServers.createOrUpdate).
 * Auth is a header token so only TrueForge can call our editor tools.
 */
export async function registerMcpServer(client: TrueForge, url: string, token: string): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      type: 'remote',
      name: MCP_SERVER_NAME,
      url,
      description: 'VS Code editor tools (read, search, list, propose edits, run commands) hosted by the Forge extension.',
      auth: { type: 'header', headers: { Authorization: `Bearer ${token}` } },
    },
  });
}
