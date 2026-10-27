import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';

export type TurnStatus = 'done' | 'cancelled' | 'error';

/** What the UI cares about; keeps the webview decoupled from SDK event types. */
export interface TurnHandlers {
  onTextDelta(messageId: string, text: string): void;
  onToolCall(name: string, args: string): void;
  onApprovalRequired(refs: { id: string; sourceEventId: string }[], events: Map<string, TrueForgeApi.TurnStreamingEvent>): void;
  onDone(status: TurnStatus, error?: string): void;
}

/**
 * Streams one turn. Contract (verified facts): stream opens with turn.created and
 * closes with turn.done. Cancellation ends the stream by itself, so we never
 * `break` the loop on cancel.
 * Events are kept in an id-keyed Map so deltas merge into their base message.
 */
export async function runTurn(
  client: TrueForge,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  handlers: TurnHandlers,
): Promise<Map<string, TrueForgeApi.TurnStreamingEvent>> {
  const events = new Map<string, TrueForgeApi.TurnStreamingEvent>();
  const stream = await client.sessions.createTurnStream(sessionId, { input });

  for await (const { data: event } of stream.withMetadata()) {
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
        for (const tc of event.toolCalls ?? []) handlers.onToolCall(tc.function?.name ?? '?', tc.function?.arguments ?? '');
        break;
      case 'tool.approval_required':
        // Stage 4 reviews propose_write here; the turn is over until we start a NEW turn with user.tool_approval.
        handlers.onApprovalRequired(event.toolCalls.map((t) => ({ id: t.id, sourceEventId: t.sourceEventId })), events);
        break;
      case 'turn.done':
        handlers.onDone(event.state.status, event.state.status === 'error' ? event.state.message : undefined);
        break;
      default:
        break;
    }
  }
  return events;
}
