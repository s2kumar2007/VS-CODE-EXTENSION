import { createHash } from 'node:crypto';

/** Outcome of a user review for one propose_write. */
export interface ReviewDecision {
  /** Text of the file when the review started; used to detect edits made during review. */
  baseText: string;
  newText: string;
  acceptedHunks: number[];
  totalHunks: number;
}

/** The MCP call carries no tool-call id, so the decision is keyed by (path, proposed content). */
export function proposalKey(absPath: string, newContent: string): string {
  return createHash('sha256').update(absPath).update('\0').update(newContent).digest('hex');
}

/**
 * Hand-off between the approval UI (decides) and the MCP propose_write handler (applies).
 * The handler can only write when a decision exists, which is what makes
 * "no write without review" hold by construction. Decisions are single-use.
 */
export class DecisionStore {
  private map = new Map<string, ReviewDecision>();
  private commands = new Map<string, number>();
  put(key: string, d: ReviewDecision): void { this.map.set(key, d); }
  take(key: string): ReviewDecision | undefined { const d = this.map.get(key); this.map.delete(key); return d; }
  permitCommand(command: string): void { this.commands.set(command, (this.commands.get(command) ?? 0) + 1); }
  takeCommand(command: string): boolean {
    const count = this.commands.get(command) ?? 0;
    if (!count) return false;
    if (count === 1) this.commands.delete(command); else this.commands.set(command, count - 1);
    return true;
  }
  clear(): void { this.map.clear(); this.commands.clear(); }
  get size(): number { return this.map.size; }
}
