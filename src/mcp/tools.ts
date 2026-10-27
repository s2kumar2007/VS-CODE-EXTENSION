import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorApi } from '../workspace/types';
import { PathError, resolveInsideReal, toRel } from '../workspace/paths';
import { rankSymbols, rankTextHits } from '../context/rank';

const MAX_READ_BYTES = 1_000_000;
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
    const s = start ?? 1;
    const e = Math.min(end ?? lines.length, lines.length);
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
    description: 'Propose the COMPLETE new content of a file (existing or new). Nothing is written until the user reviews the diff and accepts hunks. Returns which hunks were applied or rejected. Call once per file.',
    inputSchema: { path: z.string(), new_content: z.string(), rationale: z.string() },
  }, ({ path, new_content }) => guarded(async () => {
    const abs = await resolveInsideReal(root, path);
    return ok(await api.applyProposal(abs, new_content));
  }));

  mcp.registerTool('run_command', {
    description: 'Run a shell command in the workspace root (e.g. tests). Requires user approval. Output is truncated to 8KB; 120s timeout.',
    inputSchema: { command: z.string().min(1) },
  }, ({ command }) => guarded(async () => {
    const r = await api.runCommand(command);
    return ok(`exit code: ${r.exitCode ?? 'none'}${r.timedOut ? ' (timed out)' : ''}\n${r.output}`);
  }));
}
