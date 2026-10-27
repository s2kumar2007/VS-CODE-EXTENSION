import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { AgentUi, FinishInfo } from '../src/agent/types';

type Ev = Record<string, unknown>;
/** A scripted turn: receives the turn input, returns events (or throws to simulate a network failure). */
export type TurnScript = (input: any[], sessionAgent: string) => Ev[] | Promise<Ev[]> | AsyncGenerator<Ev>;

export class FakeTrueForge {
  sessions = new Map<string, string>(); // id -> agent
  cancels: string[] = [];
  cancelHooks: (() => void)[] = [];
  inputs: any[][] = [];
  private n = 0;
  constructor(private scripts: Record<string, TurnScript[]>) {}

  client = {
    sessions: {
      create: async ({ agent }: { agent: { name: string } }) => {
        const id = `s${++this.n}`;
        this.sessions.set(id, agent.name);
        return { data: { id } };
      },
      cancel: async (id: string) => { this.cancels.push(id); this.cancelHooks.forEach((h) => h()); return {}; },
      createTurnStream: async (id: string, { input }: { input: any[] }) => {
        const agent = this.sessions.get(id)!;
        this.inputs.push(input);
        const script = this.scripts[agent]?.shift();
        if (!script) throw new Error(`no script for ${agent}`);
        const out = await script(input, agent);
        return { withMetadata: async function* () {
          if (Symbol.asyncIterator in (out as object)) { for await (const e of out as AsyncGenerator<Ev>) yield { data: e, id: String(e.id) }; }
          else for (const e of out as Ev[]) yield { data: e, id: String(e.id) };
        } };
      },
    },
  } as unknown as TrueForge;
}

let c = 0;
const id = () => `e${++c}`;
export const created = () => ({ type: 'turn.created', id: id(), createdAt: 'x' });
export const done = (status: 'done' | 'cancelled' = 'done') => ({ type: 'turn.done', id: id(), threadId: null, createdAt: 'x', state: { status, ...(status === 'done' ? { completedAt: 'x', output: null, requiredActions: [] } : {}) } });
export const errorDone = (message: string) => ({ type: 'turn.done', id: id(), threadId: null, createdAt: 'x', state: { status: 'error', message } });
export const delta = (msgId: string, content: string) => ({ type: 'model.message.delta', id: msgId, threadId: 'main', content });
export const toolMsg = (msgId: string, callId: string, name: string, args: object) => ({
  type: 'model.message', id: msgId, threadId: 'main', createdAt: 'x',
  toolCalls: [{ id: callId, type: 'function', function: { name, arguments: JSON.stringify(args) }, toolInfo: { type: 'mcp', serverId: 's', serverName: 'forge-editor', name } }],
});
export const approvalRequired = (callId: string, srcId: string) => ({ type: 'tool.approval_required', id: id(), threadId: 'main', createdAt: 'x', toolCalls: [{ id: callId, sourceEventId: srcId }] });

export class RecordingUi implements AgentUi {
  text = ''; notices: string[] = []; tools: string[] = []; result?: FinishInfo;
  textDelta(_id: string, t: string) { this.text += t; }
  toolCall(n: string) { this.tools.push(n); }
  notice(t: string) { this.notices.push(t); }
  finished(i: FinishInfo) { this.result = i; }
}
