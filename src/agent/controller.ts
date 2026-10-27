import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { describeToolCall, runTurn } from '../forge/turnRunner';
import type { AgentUi, ApprovalHandler } from './types';
import { CancelledError, ForgeFailure, runWithFallback } from './resilience';

export interface ControllerDeps {
  getClient: () => TrueForge;
  approvals: ApprovalHandler;
  agents: () => { primary: string; fallback?: string };
  retries?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Extra cleanup on cancel (e.g. discard queued proposals). */
  onCancel?: () => void;
  onRunStart?: () => void;
  prepare?: () => Promise<void>;
}

function sleepForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

const isMutatingTool = (n: string) => /(?:propose_write|run_command)$/.test(n);

/**
 * Drives one user request end to end: session -> turn -> (approvals -> new turn)* -> done.
 * Independent of VS Code so it can be unit-tested with a fake TrueForge client.
 */
export class AgentController {
  private running = false;
  private cancelled = false;
  private abort = new AbortController();
  private sessionId: string | undefined;
  private approvedOperations = 0;

  constructor(private d: ControllerDeps) {}

  get busy(): boolean { return this.running; }

  async run(request: string, ui: AgentUi, agentOverride?: string): Promise<void> {
    if (this.running) { ui.finished({ status: 'error', message: 'Forge is already working on a request.' }); return; }
    this.running = true;
    this.cancelled = false;
    this.abort = new AbortController();
    this.approvedOperations = 0;
    this.d.onRunStart?.();
    const cfg = this.d.agents();
    try {
      const outcome = await runWithFallback<'done' | 'cancelled'>({
        primary: agentOverride ?? cfg.primary,
        fallback: cfg.fallback,
        retries: this.d.retries ?? 2,
        backoffMs: this.d.backoffMs ?? 1000,
        sleep: this.d.sleep ?? ((ms) => sleepForRetry(ms, this.abort.signal)),
        isCancelled: () => this.cancelled,
        canRetry: () => this.approvedOperations === 0,
        attempt: (agent) => this.attempt(agent, request, ui),
        onRetry: (agent, n) => ui.notice(`Request to "${agent}" failed, retrying (${n})...`),
        onFallback: () => ui.notice('Primary model failed, using fallback'),
      });
      ui.finished(outcome === 'cancelled' ? this.cancelInfo() : { status: 'done' });
    } catch (e) {
      if (e instanceof CancelledError) ui.finished(this.cancelInfo());
      else {
        const base = e instanceof ForgeFailure ? e.message : `Forge could not complete the request (${e instanceof Error ? e.message.split('\n')[0] : 'unknown error'}).`;
        ui.finished({ status: 'error', message: `${base} ${this.approvedOperations ? `${this.approvedOperations} approved operation(s) may have completed; inspect the workspace and use "Forge: Undo last applied change" to revert.` : 'No changes were made to your workspace.'}` });
      }
    } finally {
      this.d.approvals.cancelAll();
      this.running = false;
      this.sessionId = undefined;
    }
  }

  /** Stop: cancel the server run, abort local approvals, discard queued proposals, clear the review UI. */
  async cancel(): Promise<void> {
    if (!this.running) return;
    this.cancelled = true;
    this.abort.abort();
    this.d.approvals.cancelAll();
    this.d.onCancel?.();
    const sid = this.sessionId;
    if (sid) { try { await this.d.getClient().sessions.cancel(sid, {}); } catch { /* idempotent; stream ends by itself */ } }
  }

  private cancelInfo() {
    return { status: 'cancelled' as const, message: this.approvedOperations ? `Cancelled - ${this.approvedOperations} approved operation(s) may have completed before you stopped.` : 'Cancelled - no changes applied' };
  }

  private async attempt(agent: string, request: string, ui: AgentUi): Promise<'done' | 'cancelled'> {
    this.d.approvals.cancelAll();
    await this.d.prepare?.();
    if (this.cancelled) return 'cancelled';
    const client = this.d.getClient();
    const { data: session } = await client.sessions.create({ agent: { name: agent } }, { abortSignal: this.abort.signal });
    this.sessionId = session.id;
    if (this.cancelled) { await client.sessions.cancel(session.id, {}).catch(() => {}); return 'cancelled'; }
    let input: TrueForgeApi.TurnInputItem[] = [{ type: 'user.message', content: request }];

    for (let round = 0; round < 200; round++) {
      const res = await runTurn(client, session.id, input, {
        onTextDelta: (id, t) => ui.textDelta(id, t),
        onToolCall: (n) => ui.toolCall(n),
      }, this.abort.signal);
      if (this.cancelled || res.status === 'cancelled') return 'cancelled';
      if (res.status === 'error') throw new Error(res.error ?? 'the turn ended with an error');
      if (res.status === 'paused') {
        const items: TrueForgeApi.TurnInputItem[] = [];
        for (const a of res.approvals) {
          const info = describeToolCall(res.events, a);
          const decision = info
            ? await this.d.approvals.decide(info, this.abort.signal)
            : { status: 'deny' as const, reason: 'Could not read the tool call arguments.' };
          if (this.cancelled) return 'cancelled'; // nothing is sent after a cancel
          if (decision.status === 'allow' && info && isMutatingTool(info.name)) this.approvedOperations++;
          items.push({ type: 'user.tool_approval', threadId: a.threadId, toolCallId: a.toolCallId, approval: decision });
        }
        input = items; // a resume turn must not mix user.message with approvals
        continue;
      }
      if (res.status === 'done') return 'done';
      throw new Error('the response stream ended unexpectedly');
    }
    throw new Error('too many approval rounds');
  }
}
