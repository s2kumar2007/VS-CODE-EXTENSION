import * as vscode from 'vscode';
import * as path from 'node:path';
import type { AgentController } from '../agent/controller';
import type { AgentUi } from '../agent/types';

/** The inline-edit prompt sent to the "forge-inline" agent: file, range, selection, instruction. */
export function buildInlinePrompt(relPath: string, startLine: number, endLine: number, selected: string, instruction: string): string {
  return [
    'Inline edit request.',
    `File: ${relPath}`,
    `Selected range: lines ${startLine}-${endLine} (1-based, inclusive)`,
    `Instruction: ${instruction}`,
    '',
    'Selected text:',
    '```',
    selected,
    '```',
    '',
    'Call propose_write exactly once with path, rationale and edits: [{old_text, new_text}]. Use the selected text or a unique smaller anchor as old_text; new_text contains only the requested replacement. Do not regenerate unrelated content. The editor builds the full candidate and requires hunk review.',
  ].join('\n');
}

/** Ctrl+K Ctrl+I: ask for an instruction, run the inline agent, review happens via the diff UI. */
export async function inlineEdit(controller: AgentController, inlineAgent: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!editor || !root || editor.selection.isEmpty) { void vscode.window.showInformationMessage('Forge: select some code first.'); return; }
  if (controller.busy) { void vscode.window.showInformationMessage('Forge is already working on a request.'); return; }

  const instruction = await vscode.window.showInputBox({ prompt: 'Forge inline edit: what should change?', placeHolder: 'e.g. Treat "off" as false too' });
  if (!instruction) return;

  const sel = editor.selection;
  const rel = path.relative(root, editor.document.uri.fsPath).split(path.sep).join('/');
  const prompt = buildInlinePrompt(rel, sel.start.line + 1, sel.end.line + 1, editor.document.getText(sel), instruction);

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Forge inline edit', cancellable: true }, async (progress, token) => {
    token.onCancellationRequested(() => void controller.cancel());
    const ui: AgentUi = {
      textDelta: () => progress.report({ message: 'working...' }),
      toolCall: (n) => progress.report({ message: n }),
      notice: (t) => void vscode.window.showWarningMessage('Forge: ' + t),
      finished: (info) => {
        if (info.status === 'error') void vscode.window.showErrorMessage('Forge: ' + info.message);
        else if (info.status === 'cancelled') void vscode.window.showInformationMessage('Forge: ' + info.message);
      },
    };
    await controller.run(prompt, ui, inlineAgent);
  });
}
