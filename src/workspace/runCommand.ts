import { spawn, execFile } from 'node:child_process';
import type { RunResult } from './types';
import { resolveInsideReal, PathError } from './paths';

export const MAX_OUTPUT_BYTES = 8 * 1024;

/** Reject explicit traversal/absolute path operands. Shell commands are reviewed, not sandboxed. */
export async function validateCommandPaths(root: string, command: string): Promise<void> {
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|([^\s;&|<>]+)/g)) {
    const token = (match[1] ?? match[2] ?? match[3] ?? '').replace(/^\w+=/, '');
    if (/(^|[\\/])\.\.([\\/]|$)/.test(token) || /^[A-Za-z]:|^\\\\|^\//.test(token)) throw new PathError('Command references an outside path.');
    if (/[\\/]/.test(token) && !token.includes('://')) await resolveInsideReal(root, token);
  }
}

/** A byte cap, including the marker; reserve bytes for UTF-8 boundary replacements. */
export function truncateOutput(s: string, max = MAX_OUTPUT_BYTES): string {
  const buf = Buffer.from(s);
  if (buf.length <= max) return s;
  const marker = '\n...[output truncated]...\n';
  const half = Math.max(0, Math.floor((max - Buffer.byteLength(marker) - 12) / 2));
  if (!half) return marker.slice(0, max);
  return buf.subarray(0, half).toString('utf8') + marker + buf.subarray(-half).toString('utf8');
}

/** Runs only after local approval. Cancel/timeout terminates the process tree. */
export async function runShell(command: string, cwd: string, timeoutMs = 120_000, signal?: AbortSignal): Promise<RunResult> {
  if (signal?.aborted) return { exitCode: null, output: 'Cancelled.', timedOut: false };
  await validateCommandPaths(cwd, command);
  if (signal?.aborted) return { exitCode: null, output: 'Cancelled.', timedOut: false };
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let head = Buffer.alloc(0), tail = Buffer.alloc(0), bytes = 0;
    let timedOut = false;
    const collect = (d: Buffer) => {
      bytes += d.length;
      if (head.length < MAX_OUTPUT_BYTES) head = Buffer.concat([head, d.subarray(0, MAX_OUTPUT_BYTES - head.length)]);
      tail = Buffer.concat([tail, d.subarray(-MAX_OUTPUT_BYTES)]).subarray(-MAX_OUTPUT_BYTES);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', kill); };
    signal?.addEventListener('abort', kill, { once: true });
    if (signal?.aborted) kill();
    child.on('error', (e) => { cleanup(); resolve({ exitCode: null, output: truncateOutput(e.message), timedOut }); });
    child.on('close', (code) => {
      cleanup();
      const out = bytes <= MAX_OUTPUT_BYTES ? head.toString('utf8') : Buffer.concat([head, tail]).toString('utf8');
      resolve({ exitCode: code, output: truncateOutput(out), timedOut });
    });
  });
}
