import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorApi } from '../workspace/types';
import { PathError, resolveInsideReal, toRel } from '../workspace/paths';
import { rankSymbols, rankTextHits } from '../context/rank';
import { materializeWrite } from '../review/proposal';

const MAX_READ_BYTES = 1_000_000;
const MAX_READ_LINES = 80;
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (...texts: string[]): ToolResult => ({ content: texts.map((text) => ({ type: 'text' as const, text })) });
const fail = (msg: string): ToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

/** Converts thrown errors into MCP tool errors the model can read and recover from. */
async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try { return await fn(); } catch (e) { return fail(e instanceof PathError ? `Refused: ${e.message}` : `Error: ${e instanceof Error ? e.message : String(e)}`); }
}

/** Registers the five editor tools. All paths are validated inside the workspace. */
export function registerEditorTools(mcp: McpServer, api: EditorApi): void {
  const root = api.root();

  mcp.registerTool('read_file', {
    description: 'Read a workspace file, optionally only lines start..end (1-based, inclusive). Prefer reading slices.',
    inputSchema: { path: z.string(), start: z.number().int().min(1).optional(), end: z.number().int().min(1).optional() },
    annotations: { readOnlyHint: true },
  }, ({ path, start, end }) => guarded(async () => {
    const abs = await resolveInsideReal(root, path);
    const text = await api.readText(abs);
    if (text === undefined) return fail(`File not found: ${path}`);
    if (Buffer.byteLength(text) > MAX_READ_BYTES && start === undefined) return fail('File is larger than 1MB; request a line range with start/end.');
    const lines = text.split('\n');
    if (lines.length > MAX_READ_LINES && (start === undefined || end === undefined)) return fail(`File has ${lines.length} lines; request a start/end range of at most ${MAX_READ_LINES} lines.`);
    const s = start ?? 1;
    const requestedEnd = end ?? lines.length;
    if (requestedEnd < s) return fail('end must be greater than or equal to start.');
    if (requestedEnd - s + 1 > MAX_READ_LINES) return fail(`Read range is limited to ${MAX_READ_LINES} lines; request a smaller slice.`);
    const e = Math.min(requestedEnd, lines.length);
    return ok(`${toRel(root, abs)} lines ${s}-${e} of ${lines.length}`, lines.slice(s - 1, e).join('\n'));
  }));

  mcp.registerTool('list_dir', {
    description: 'List entries of a workspace directory ("." for the root). Directories end with "/".',
    inputSchema: { path: z.string().default('.') },
    annotations: { readOnlyHint: true },
  }, ({ path }) => guarded(async () => {
    const abs = await resolveInsideReal(root, path);
    const entries = (await api.listDir(abs)).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    return ok(entries.slice(0, 500).map((e) => e.name + (e.type === 'dir' ? '/' : '')).join('\n') || '(empty)');
  }));

  mcp.registerTool('search_workspace', {
    description: 'Search the workspace. kind="text": literal text search via ripgrep; kind="symbol": workspace symbol search. Results are ranked and each has a one-line reason ("why").',
    inputSchema: { query: z.string().min(1), kind: z.enum(['text', 'symbol']), max_results: z.number().int().min(1).max(50).default(20) },
    annotations: { readOnlyHint: true },
  }, ({ query, kind, max_results }) => guarded(async () => {
    if (kind === 'symbol') {
      const ranked = rankSymbols(await api.searchSymbols(query, 100), query, max_results);
      return ok(ranked.map((s) => `${s.path}:${s.line}  ${s.kind} ${s.name}  -- why: ${s.why}`).join('\n') || 'No symbols found.');
    }
    const ranked = rankTextHits(await api.searchText(query, 500), query, max_results);
    return ok(ranked.map((h) => `${h.path}:${h.line}  ${h.text.trim()}  -- why: ${h.why}`).join('\n') || 'No matches.');
  }));

  mcp.registerTool('propose_write', {
    description: 'Propose a reviewed file change. For existing files prefer edits: [{old_text,new_text}]; each old_text must match exactly once. For new files use complete new_content. Provide exactly one form, plus path and rationale. Nothing is written before hunk review. Call once per file.',
    inputSchema: { path: z.string(), new_content: z.string().optional(), edits: z.array(z.object({old_text:z.string().min(1),new_text:z.string()})).min(1).max(20).optional(), rationale: z.string() },
  }, (args) => guarded(async () => {
    const abs = await resolveInsideReal(root, args.path);
    const candidate = materializeWrite(await api.readText(abs), args);
    return ok(await api.applyProposal(abs, candidate));
  }));

  mcp.registerTool('run_command', {
    description: 'Run a shell command in the workspace root (e.g. tests). Requires user approval. Output is truncated to 8KB; 120s timeout.',
    inputSchema: { command: z.string().min(1) },
  }, ({ command }) => guarded(async () => {
    const r = await api.runCommand(command);
    return ok(`exit code: ${r.exitCode ?? 'none'}${r.timedOut ? ' (timed out)' : ''}\n${r.output}`);
  }));
}
