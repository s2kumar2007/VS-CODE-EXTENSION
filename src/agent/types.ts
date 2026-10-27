export type ApprovalDecision = { status: 'allow' } | { status: 'deny'; reason: string };

export interface ToolCallInfo { name: string; args: Record<string, unknown> }

/** Decides gated tool calls (propose_write / run_command). Implemented by the review UI layer. */
export interface ApprovalHandler {
  decide(call: ToolCallInfo, signal: AbortSignal): Promise<ApprovalDecision>;
  /** Drops any pending reviews/queued proposals and closes the review UI. */
  cancelAll(): void;
}

export interface FinishInfo {
  status: 'done' | 'cancelled' | 'error';
  /** Human-readable message (no stack traces). */
  message?: string;
}

/** What the controller reports to whichever UI started the run (panel, inline edit). */
export interface AgentUi {
  textDelta(messageId: string, text: string): void;
  toolCall(name: string): void;
  notice(text: string): void;
  finished(info: FinishInfo): void;
}
