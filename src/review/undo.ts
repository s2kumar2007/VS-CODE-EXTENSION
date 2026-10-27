export interface UndoEntry { path: string; before: string; after: string; label: string }

/** In-extension undo stack (native Ctrl+Z also works because edits go through WorkspaceEdit). */
export class UndoStack {
  private stack: UndoEntry[] = [];
  push(e: UndoEntry): void { this.stack.push(e); if (this.stack.length > 50) this.stack.shift(); }
  pop(): UndoEntry | undefined { return this.stack.pop(); }
  peek(): UndoEntry | undefined { return this.stack[this.stack.length - 1]; }
  get size(): number { return this.stack.length; }
}
