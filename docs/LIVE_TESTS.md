# Opt-in live checks

These checks use real TrueForge/provider requests and native VS Code WorkspaceEdit operations. They are automated integration evidence, not a manual demo of the chat/input/review UI. Only Task A's helpers.py or Task B's cli.py, test_cli.py and cli.rst proposals are programmatically accepted; all agent shell commands are declined. Independent Python checks and pytest run afterward. Native visual review and undo mechanics are covered separately.

Start TrueForge with the explicit 127.0.0.1 outbound allowlist from README, and configure a provider/model. Use a clean disposable Flask checkout at 22d924701a6ae2e4cd01e9a15bbaf3946094af65 for each task. Install Python dependencies separately. Never pass provider secrets on the command line.

From the extension root, after npm ci and npm run build:

    node scripts/run-live-tests.cjs A <disposable-Flask-A> google-gemini/gemini-3-5-flash <absolute-Code.exe> <absolute-result-A.json>
    node scripts/run-live-tests.cjs B <disposable-Flask-B> google-gemini/gemini-3-5-flash <absolute-Code.exe> <absolute-result-B.json>

Run sequentially: the forge-editor registration is shared by name. The runner creates an isolated development-extension descriptor with a no-op activation entrypoint so normal startup cannot replace the harness MCP registration or model aliases. The bundled harness imports the real controller, MCP server/tools, context assembler, review-approval handler and editor API from src. It records the effective model and extension path. This deliberately does not test normal extension activation; the installed-VSIX native evidence covers packaging/editor integration separately.

For each edited checkout, set PYTHONPATH to that checkout's src directory and run:

    python <extension-repo>/scripts/verify-flask-demo.py A
    python <extension-repo>/scripts/verify-flask-demo.py B
    python -m pytest tests/test_cli.py -q

The A check covers unset/empty/0/false/no/off/n, case variants, true values and docstring values. The B check covers help registration, parseable JSON, four secret categories, preserved ordinary values and no mutation of the app configuration. Inspect git diff and require at least three intended files for B.

Task C uses a separately named forge-audit-invalid provider/agent pointing at an intentionally invalid OpenAI credential or unreachable endpoint; it never replaces the real Gemini provider credential. Configure the disposable agent before running C. The harness uses that agent as primary and forge-agent on the selected working model as fallback. Record raw turn.done error events and session IDs, backoff notices and a clean git status. Remove the disposable agent before deleting its provider afterward.

Provider availability is not established by listing model IDs: require a successful generate request. Observed in this audit: Gemini 3.8 generation returned HTTP 503; the account's free tier returned HTTP 429 with a five-requests/minute limit during tool turns. Failures and incomplete tasks remain failures in the evidence. Do not invent model costs or a JavaScript stack trace when only a provider error event exists.

Final reruns also hit the 20-requests/day free-tier limit on both models; approximately 13h44m reset waits were reported. Do not repeatedly rerun against an exhausted daily quota. Wait for reset or configure an independently available provider. Raw prompt/context evidence includes Flask source snippets; see FLASK-LICENSE.txt.

Official-brief correction: Task C must repeat the Task A inline request, not a greeting. The current harness does so, and accepts a clear expected error only when git status stays empty. Historical live-C.json is retained as generic greeting/fallback evidence and does not establish the prescribed Task C. The authoritative scoring table is now in docs/RUBRIC.md.

## 28 October reset recheck

A on Gemini 3.5 and B on Gemini 2.5 reached real providers but ended with HTTP 429 before review or mutation. Exact terminal events and session ids are in live-reset-sessions.json; controller records are live-A-reset-recheck.json and live-B-reset-recheck.json. These are automated native-host runs, not recorded manual UI demos.

The corrected official Task C repeats the exact inline instruction. A disposable custom provider points to unreachable http://127.0.0.1:1/v1 with a deliberately invalid test credential. Three distinct failed primary sessions are followed by a fresh Gemini 2.5 fallback session, which proposed the target edit. The harness rejected all proposals and the run ended done. git status remained empty. See live-C-official-recheck.json and live-reset-workspaces.json. The disposable agent/provider were deleted; real provider credentials were neither read into evidence nor changed.

## Strict review rerun and Groq fallback request

The strict Task A rerun ended HTTP 429 before any review; its checkout stayed clean (live-A-scoped-recheck.json). The terminal Gemini 2.5 event reports a 20-request/day free-tier limit and roughly 18h19m to reset. The preceding 61-hunk proposal was invalid Python and changed text outside the selected function; it is explicitly failed in live-A-25-validation.json, and its generated change was restored.

User requested Gemini primary with Groq fallback. The committed fallback now names groq/gpt-oss-120b. No GROQ_API_KEY exists in process, Windows user or machine environment, and TrueForge has no Groq provider. scripts/configure-groq.ps1 prompts privately and invokes a key-free setup helper, which verifies actual Groq generation before registering the provider and agents. Setup with no credential fails clearly before making requests. Controlled tests cover bad authentication, host restrictions, preserving other models, registry-id updates and refusing conflicting providers. These tests do not establish real Groq availability. After local setup, set FORGE_LIVE_FALLBACK=forge-agent-fallback when rerunning A/B to exercise automatic provider fallback.
