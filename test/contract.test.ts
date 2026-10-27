import { describe, it, expect } from 'vitest';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import { registerMcpServer } from '../src/forge/client';
import { loadAgentFiles, syncAgents } from '../src/forge/agents';
import { runTurn, describeToolCall } from '../src/forge/turnRunner';
import { FakeTrueForge, created, toolMsg, approvalRequired, done } from './fakes';

describe('TrueForge wire contract', () => {
  it('serializes registration, header auth, agent create/update and approval selectors', async () => {
    const requests: { url: string; method: string; body: any }[] = [];
    let existing = false;
    const client = new TrueForge({ baseUrl: 'http://contract.test', fetch: async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url: String(url), method: init?.method ?? 'GET', body });
      if (init?.method === 'GET') return Response.json({ data: existing ? [{ id: 'agent-id', name: 'forge-agent' }] : [], pagination: {} });
      return Response.json({ data: { id: 'agent-id', name: 'forge-agent' } });
    }});
    await registerMcpServer(client, 'http://127.0.0.1:1234/mcp', 'secret');
    expect(requests[0]?.url).toBe('http://contract.test/api/v1/settings/mcp-servers');
    expect(requests[0]?.method).toBe('PUT');
    expect(requests[0]?.body.manifest.auth).toEqual({ type: 'header', headers: { Authorization: 'Bearer secret' } });
    const agents = (await loadAgentFiles('agents')).filter(a => a.name === 'forge-agent');
    expect((await syncAgents(client, agents))[0]?.ok).toBe(true);
    const create = requests.find(r => r.method === 'POST')!;
    expect(create.url).toBe('http://contract.test/api/v1/agents');
    expect(create.body.manifest.mcp_servers[0].require_approval_for_tools).toContain('propose_write');
    expect(create.body.manifest.config.dynamic_sub_agents.enabled).toBe(true);
    existing = true;
    expect((await syncAgents(client, agents))[0]?.ok).toBe(true);
    expect(requests.at(-1)?.url).toBe('http://contract.test/api/v1/agents/agent-id');
    expect(requests.at(-1)?.method).toBe('PUT');
  });
  it('keeps approvals after terminal done and uses approval owner thread and source event', async () => {
    const message = toolMsg('source', 'call', 'propose_write', { path: 'a', new_content: 'b' });
    const pending = { ...approvalRequired('call', 'source'), threadId: 'child-thread' };
    const tf = new FakeTrueForge({ p: [() => [created(), message, pending, done()]] });
    const { data: session } = await tf.client.sessions.create({ agent: { name: 'p' } });
    const result = await runTurn(tf.client, session.id, [{ type: 'user.message', content: 'x' }], { onTextDelta() {}, onToolCall() {} });
    expect(result.status).toBe('paused');
    expect(result.approvals).toEqual([{ toolCallId: 'call', threadId: 'child-thread', sourceEventId: 'source' }]);
    expect(describeToolCall(result.events, result.approvals[0]!)?.args.path).toBe('a');
  });
});
