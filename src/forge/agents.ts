import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';

export interface AgentFile {
  name: string;
  description: string;
  manifest: TrueForgeApi.AgentSpec;
}

export async function loadAgentFiles(dir: string): Promise<AgentFile[]> {
  const names = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(names.map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as AgentFile));
}

/**
 * Create-or-update each agent. Agent ids are server-generated and names are
 * immutable, so we look the agent up by name (list is a substring match; we
 * require an exact match) and then update by id, else create.
 * Returns per-agent outcome so the UI can show non-fatal problems.
 */
export async function syncAgents(client: TrueForge, agents: AgentFile[]): Promise<{ name: string; ok: boolean; error?: string }[]> {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const a of agents) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const existing = await findAgentId(client, a.name);
        if (existing) await client.agents.update(existing, { description: a.description, manifest: a.manifest });
        else await client.agents.create({ name: a.name, description: a.description, manifest: a.manifest });
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (lastError) {
      results.push({ name: a.name, ok: false, error: lastError instanceof Error ? lastError.message : String(lastError) });
    } else {
      results.push({ name: a.name, ok: true });
    }
  }
  return results;
}

async function findAgentId(client: TrueForge, name: string): Promise<string | undefined> {
  const page = await client.agents.list({ agentName: name, limit: 100 });
  for await (const agent of page) {
    if (agent.name === name) return agent.id;
  }
  return undefined;
}
