# Demo script — Flask 3.1.3

The user excluded demo-video recording on 29 October 2026. This script remains an optional reproduction guide; no video or timestamps are claimed. Groq is configured privately. Task A and exact inline Task C passed automated native-host checks; Task B status is tracked in docs/SUBMISSION_STATUS.md.

## Setup

1. Follow README: npm ci, typecheck, test, build. Start TrueForge and configure the Google models and Groq fallback as documented.
2. Clone https://github.com/pallets/flask.git and checkout tag 3.1.3. git rev-parse HEAD must report 22d924701a6ae2e4cd01e9a15bbaf3946094af65.
3. python -m venv .venv. Activate with .venv\Scripts\Activate.ps1 in PowerShell, or source .venv/bin/activate on macOS/Linux. Install with python -m pip install -e . pytest.
4. Open Flask in the extension development host. Check git status --short is empty. Record start time, TrueForge session id, configured model aliases and the initial git status.

## Task A — inline edit

1. Open src/flask/helpers.py and select get_debug_flag.
2. Invoke Forge: Inline Edit Selection. Enter exactly:

   Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.

3. Review the diff; demonstrate accepting/rejecting an independent hunk. Confirm. Nothing should apply before confirmation.
4. Run this portable verification from the activated environment:

    python -c "import os; from flask.helpers import get_debug_flag; os.environ['FLASK_DEBUG']='off'; assert get_debug_flag() is False; os.environ['FLASK_DEBUG']='N'; assert get_debug_flag() is False"

5. Inspect git diff, then demonstrate one Ctrl+Z. Repeat the edit and demonstrate Forge: Undo last applied change after closing/reopening the editor. A later manual edit must prevent Forge undo from overwriting it.
6. Record observed output, exact error (if any), extension-host stack trace (if present; redact credentials), changed files, end time. Do not invent a trace if none exists.

## Task B — agent mode, no files mentioned

Use another fresh disposable checkout so Task A changes do not affect the result.

1. Open Forge: Open Agent Panel. Send exactly:

   Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.

2. Expand Context used; show paths, snippets/signatures, selection reasons and budget. The request names no files.
3. Review proposals covering implementation, tests and docs (typically src/flask/cli.py, tests/test_cli.py and docs/cli.rst). Confirm only desired hunks. Approve the test command after checking its exact contents.
4. Verify python -m pytest tests/test_cli.py -q; inspect python -m flask --help; use a small temporary Flask app to check JSON masking for SECRET_KEY, DB_PASSWORD, API_TOKEN and a normal NAME value. The test should assert masked values equal *** and ordinary values remain unchanged.
5. git diff --name-only must show at least three intended files. Show the TrueForge session/turn/tool history and any subagent activity actually observed. Do not claim subagents ran from configuration alone.
6. Record exact errors, available redacted extension-host trace, elapsed time, test output and changed-file list.

## Task C — failure handling

Use a disposable TrueForge configuration/instance for deliberately invalid credentials or endpoints; preserve the user's working provider configuration.

1. First leave TrueForge stopped. Reload the development host; activation must show a clear warning and remain usable. Start TrueForge and send a request: setup retries without requiring another reload.
2. Configure an invalid primary key or unreachable provider URL; leave the fallback valid. Repeat the exact Task A inline-edit request above on the selected get_debug_flag function. Observe retries, then Primary model failed, using fallback in a fresh session. Ordinary retries use 1s/2s backoff; a provider's retry hint can extend each wait up to 60 seconds. The editor stays responsive. Reject any proposed edit so this failure demo leaves the checkout unchanged.
3. Break both disposable providers. Expect one concise final error without a user-visible stack. Inspect local extension-host logs for the exact underlying error/trace and redact secrets before recording.
4. Before any write/command approval, git status --short remains empty. After approval, failures/Stop can retain authorized effects: the UI must report uncertainty, and must not replay the request automatically.
5. Restore the disposable setup. Test Stop mid-stream, while a diff is open, and during command confirmation; no unused approvals or Forge review tabs should remain. A running confirmed command's process tree must stop. Already completed command effects are not rolled back.

## Automated evidence (no keys)

Run npm run typecheck, npm test and npm run build. Relevant regressions: contract.test.ts, controller.test.ts, cancel.test.ts, resilience.test.ts, safety.test.ts, editorSafety.test.ts, reviewPanel.test.ts, context.test.ts and contextHost.test.ts.

Native VS Code integration: compile with node scripts/build-native-tests.cjs <scratch-output-directory>, then launch a fresh disposable folder using --extensionDevelopmentPath=<repo> --extensionTestsPath=<scratch-output-directory>/index.cjs. Optional FORGE_NATIVE_RESULT captures JSON. See docs/native-host-results.json for this audit's Windows result.
