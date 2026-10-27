# Demo script (Flask 3.1.3)

Setup: TrueForge running, models configured, Flask checked out at 3.1.3 and open in the Extension Development Host (F5). Confirm `git status` is clean first.

## Task A - inline edit
1. Open `src/flask/helpers.py`, select the function `get_debug_flag`.
2. Press **Ctrl+K Ctrl+I** and enter exactly:
   `Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.`
3. Review the diff/hunk list, accept, confirm.
4. Verify:
```bash
FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"   # -> False
git diff --stat
```

## Task B - agent mode, no files mentioned
1. `git checkout -- .` (back to a clean tree), open **Forge: Open Agent Panel**.
2. Send exactly:
   `Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.`
3. Show the "Context used" section, review hunks for `src/flask/cli.py`, `tests/test_cli.py`, `docs/cli.rst`; allow `pytest` when the agent asks to run it.
4. Verify:
```bash
pytest tests/test_cli.py -q
flask --help | grep config
cd /tmp && cat > sample_app.py <<'PY'
from flask import Flask
app = Flask(__name__); app.config.update(SECRET_KEY="s3", DB_PASSWORD="pw", API_TOKEN="t", NAME="demo")
PY
FLASK_APP=sample_app flask config        # masked JSON
cd - && git diff --stat                  # >= 3 files
```
5. Open http://localhost:8790 -> Sessions to show the TrueForge session (turns, tool calls, subagents).

## Task C - failure handling
1. `git checkout -- .`; in TrueForge Settings break the primary model (invalid Gemini key or bad base URL). Leave Groq valid for the "fallback takes over" run; break both for the "clear error" run.
2. Send any request in the panel (e.g. the Task A or B text).
3. Observe: editor stays responsive; notice "Primary model failed, using fallback" and the run continues on Groq - or, with both broken, one clear error message (no stack trace).
4. Verify: `git status` shows no changes.
