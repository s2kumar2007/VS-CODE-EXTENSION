import { spawn } from 'node:child_process';
import type { RunResult } from './types';

export const MAX_OUTPUT_BYTES = 8 * 1024;

/** Keeps head and tail (errors are usually at the end) when output exceeds the cap. */
export function truncateOutput(s: string, max = MAX_OUTPUT_BYTES): string {
  if (Buffer.byteLength(s) <= max) return s;
  const half = Math.floor(max / 2) - 20;
  return `${s.slice(0, half)}\n...[output truncated]...\n${s.slice(-half)}`;
}

/**
 * Runs a shell command in `cwd` with a hard timeout (process is killed) and truncated output.
 * Approval happens BEFORE this is called (TrueForge gates run_command; our approval UI decides).
 */
export function runShell(command: string, cwd: string, timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const collect = (d: Buffer) => { if (out.length < 200_000) out += d.toString('utf8'); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ exitCode: null, output: truncateOutput(String(e)), timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code, output: truncateOutput(out), timedOut }); });
  });
}
