import type { ApprovalDecision, ApprovalHandler, ToolCallInfo } from '../agent/types';
import { computeHunks, normalizeEol, type Hunk } from './hunks';
import { DecisionStore, proposalKey } from './decisions';
import { PathError, resolveInsideReal, toRel } from '../workspace/paths';
import { validateCommandPaths } from '../workspace/runCommand';

export interface ReviewRequest { relPath: string; rationale: string; oldText: string; newText: string; hunks: Hunk[]; isNew: boolean }

/** The visual part (diff editor + hunk list). Implemented with VS Code APIs elsewhere. */
export interface ReviewUi {
  /** Resolves with the ACCEPTED hunk ids ([] = rejected all, also on abort/close). */
  reviewHunks(req: ReviewRequest, signal: AbortSignal): Promise<number[]>;
  confirmCommand(command: string, signal: AbortSignal): Promise<boolean>;
  close(): void;
}

const is = (name: string, tool: string) => name === tool || name.endsWith(tool);

export class ReviewApprovals implements ApprovalHandler {
  constructor(private d: { root: string; ui: ReviewUi; store: DecisionStore; readText: (abs: string) => Promise<string | undefined> }) {}

  cancelAll(): void { this.d.store.clear(); this.d.ui.close(); }

  async decide(call: ToolCallInfo, signal: AbortSignal): Promise<ApprovalDecision> {
    if (signal.aborted) return { status: 'deny', reason: 'Cancelled.' };
    if (is(call.name, 'propose_write')) return this.decideWrite(call, signal);
    if (is(call.name, 'run_command')) {
      const cmd = String(call.args.command ?? '');
      if (!cmd) return { status: 'deny', reason: 'Empty command.' };
      try { await validateCommandPaths(this.d.root, cmd); } catch { return { status: 'deny', reason: 'Command references a path outside the workspace.' }; }
      const confirmed = await this.d.ui.confirmCommand(cmd, signal);
      if (!confirmed || signal.aborted) return { status: 'deny', reason: 'The command was declined or cancelled.' };
      this.d.store.permitCommand(cmd);
      return { status: 'allow' };
    }
    return { status: 'deny', reason: 'Unknown approval tool.' };
  }

  private async decideWrite(call: ToolCallInfo, signal: AbortSignal): Promise<ApprovalDecision> {
    const { path, new_content, rationale } = call.args;
    if (typeof path !== 'string' || typeof new_content !== 'string') return { status: 'deny', reason: 'Invalid propose_write arguments.' };
    let abs: string;
    try { abs = await resolveInsideReal(this.d.root, path); }
    catch (e) { return { status: 'deny', reason: e instanceof PathError ? e.message : 'Invalid path.' }; }

    const existing = await this.d.readText(abs);
    const oldText = existing ?? '';
    const reviewedText = normalizeEol(oldText, new_content);
    const hunks = computeHunks(oldText, reviewedText);
    if (hunks.length === 0) return { status: 'deny', reason: 'The proposed content is identical to the current file; nothing to change.' };

    const accepted = await this.d.ui.reviewHunks({ relPath: toRel(this.d.root, abs), rationale: String(rationale ?? ''), oldText, newText: reviewedText, hunks, isNew: existing === undefined }, signal);
    if (signal.aborted) return { status: 'deny', reason: 'Cancelled.' };
    if (accepted.length === 0) return { status: 'deny', reason: 'The user rejected all hunks.' };

    // The MCP handler looks this up when TrueForge executes the (now allowed) call.
    this.d.store.put(proposalKey(abs, new_content), { baseText: oldText, newText: reviewedText, acceptedHunks: accepted, totalHunks: hunks.length });
    return { status: 'allow' };
  }
}
