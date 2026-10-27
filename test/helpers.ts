import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** A throwaway git repo with one committed file; `gitStatus()` must stay '' for "workspace unchanged". */
export function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(root, 'f.txt'), 'a\nb\nc\n');
  git('add', '-A'); git('commit', '-qm', 'init');
  return { root, file: path.join(root, 'f.txt'), gitStatus: () => git('status', '--porcelain').trim() };
}
