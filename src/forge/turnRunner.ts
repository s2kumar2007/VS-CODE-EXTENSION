import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { ToolCallInfo } from '../agent/types';

export type TurnEvents = Map<string, TrueForgeApi.TurnStreamingEvent>;

export interface PendingApproval { toolCallId: string; threadId: string; sourceEventId: string }

export interface TurnResult {
  events: TurnEvents;
  /** done | cancelled | error from turn.done; 'paused' when the turn stopped for approvals; 'unknown' if the stream just ended. */
  status: 'done' | 'cancelled' | 'error' | 'paused' | 'unknown';
  error?: string;
  approvals: PendingApproval[];
}

export interface TurnHandlers {
  onTextDelta(messageId: string, text: string): void;
  onToolCall(name: string): void;
}

/**
 * Streams ONE turn. Contract: opens with turn.created, closes with turn.done. A cancel
 * ends the stream by itself (we never `break` the loop). A gated tool call ends the turn
 * with tool.approval_required; the caller resumes with a NEW turn (see AgentController).
 * Events live in an id-keyed Map so streaming deltas merge into their base message.
 */
export async function runTurn(
  client: TrueForge,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  handlers: TurnHandlers,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const events: TurnEvents = new Map();
  const result: TurnResult = { events, status: 'unknown', approvals: [] };
  let terminal = false;
  const stream = await client.sessions.createTurnStream(sessionId, { input }, { abortSignal: signal, maxRetries: 0, timeoutInSeconds: 600 });

  for await (const { data: event } of stream.withMetadata()) {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string' || typeof event.id !== 'string') throw new Error('TrueForge sent an invalid event.');
    if (isEventDelta(event)) {
      let base = events.get(event.id);
      if (!base) {
        // Delta arrived before any base message: seed an empty model.message with the same id.
        base = { type: 'model.message', id: event.id, threadId: event.threadId, createdAt: new Date().toISOString(), content: '' };
        events.set(event.id, base);
      }
      mergeEventDelta(base, event);
      // Only the root agent's text is shown live; sub-agent chatter would be noise.
      if (event.content && event.threadId === 'main') handlers.onTextDelta(event.id, event.content);
      continue;
    }
    events.set(event.id, event);

    switch (event.type) {
      case 'model.message':
        for (const tc of event.toolCalls ?? []) handlers.onToolCall(toolName(tc));
        break;
      case 'tool.approval_required':
        if (!Array.isArray(event.toolCalls) || typeof event.threadId !== 'string') throw new Error('TrueForge sent an invalid approval event.');
        for (const ref of event.toolCalls) {
          // The approval event owns the thread; sourceEventId locates name and arguments.
          const threadId = event.threadId;
          result.approvals.push({ toolCallId: ref.id, threadId, sourceEventId: ref.sourceEventId });
        }
        result.status = 'paused';
        break;
      case 'turn.done':
        terminal = true;
        result.status = event.state.status === 'done' && result.approvals.length > 0 ? 'paused' : event.state.status;
        if (event.state.status === 'error') result.error = event.state.message;
        break;
      default:
        break;
    }
  }
  if (!terminal) { result.status = 'unknown'; result.approvals = []; }
  if (result.status === 'paused' && result.approvals.length === 0) result.status = 'unknown';
  return result;
}

function toolName(tc: TrueForgeApi.ToolCall): string {
  const info = tc.toolInfo as { name?: string } | undefined;
  return info?.name ?? tc.function.name;
}

/** Looks up name + parsed arguments of a pending tool call from the model.message that issued it. */
export function describeToolCall(events: TurnEvents, a: PendingApproval): ToolCallInfo | undefined {
  const msg = events.get(a.sourceEventId);
  if (!msg || msg.type !== 'model.message') return undefined;
  const tc = msg.toolCalls?.find((t) => t.id === a.toolCallId);
  if (!tc) return undefined;
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>; } catch { /* leave empty; handler denies */ }
  return { name: toolName(tc), args };
}
