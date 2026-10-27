# Forge Agent

VS Code client for TrueForge's agent loop, with local MCP editor tools and reviewed edits. No model provider keys are stored in this extension.

## Clean-clone setup

Requires Node 22.14+ (validated with Node 24), VS Code 1.90+, git, and Python for the Flask demo.

1. Clone this repository and open its directory containing package.json.
2. Install and validate:

    npm ci
    npm run typecheck
    npm test
    npm run build

3. In a separate terminal, start TrueForge:

    # PowerShell: allow only the local editor MCP host
    $env:OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'
    npx @truefoundry/trueforge@latest

   macOS/Linux: `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx @truefoundry/trueforge@latest`. This explicit host allowlist is required by TrueForge 0.180.1 for the loopback editor MCP URL.

   UI: http://localhost:8790. Local API docs: http://localhost:8790/api/v1/docs, schema: /api/v1/openapi.json. Tested CLI version: 0.180.1, SDK: 0.180.0. This extension assumes local no-auth TrueForge; authenticated remote hosting is not configured here.
4. Configure the two providers below in TrueForge Settings, including your own keys. The server starts with NO configured models. Never put keys in this repository or VS Code settings.
5. Run code . in the extension repository, press F5 (Run Extension), then open your disposable Flask checkout in the development host. Alternatively:

    code --new-window --extensionDevelopmentPath="<absolute extension repo>" "<absolute Flask checkout>"

Activation starts a loopback MCP server, registers its bearer header in TrueForge and syncs agents/*.json. If setup fails, a non-blocking warning appears; sending a request retries setup. Reload after changing agent JSON or server model configuration that was already synchronized.

## Models (verified 27 October 2026)

TrueForge agent names use provider/configured-model-name, which is different from the provider's model_id. Enter these exact configured names or update agents/*.json to match your own choices.

| Role | Provider name/type | Configured model name | Provider model_id |
|---|---|---|---|
| Primary / inline | google-gemini | gemini-3-8-flash | gemini-3.8-flash |
| Fallback | groq / custom OpenAI-compatible | gpt-oss-120b | openai/gpt-oss-120b |

Groq base URL: https://api.groq.com/openai/v1. Agent references: google-gemini/gemini-3-8-flash and groq/gpt-oss-120b. Provider availability and account entitlement still require a real request. Gemini 2.5 access is limited to previously active users; Llama 3.3 70B is no longer a general free/developer-tier fallback. References: [Google models](https://ai.google.dev/gemini-api/docs/models), [Groq deprecations](https://console.groq.com/docs/deprecations), [TrueForge setup](https://trueforge.dev/models.md). config.example.json is an illustrative checklist, not an importable TrueForge manifest.

## Usage

- Forge: Open Agent Panel starts agent mode with automatic ranked retrieval. Context used lists actual file slices/signatures, reasons, and estimated costs. @file:path and @symbol:name add explicit context.
- Forge: Inline Edit Selection (Ctrl+K Ctrl+I, Cmd+K Cmd+I on macOS) asks for an edit instruction.
- propose_write opens a virtual diff and hunk list. Choose Accept/Reject per hunk and Confirm. Only accepted hunks are applied, through one WorkspaceEdit. Existing LF/CRLF convention and proposed trailing-newline presence are preserved.
- run_command needs an exact, single-use local approval through a Run/Cancel picker. It executes in the workspace root, caps returned output at 8 KiB and terminates its process tree on Stop or the 120-second timeout.
- Stop aborts the request, cancels the TrueForge session, dismisses pending reviews/command confirmation, and clears unused approvals. Stop during context retrieval prevents a later model request.
- Forge: Undo last applied change restores the prior text, or removes a newly created file. It works across editor reopen while the extension stays active, and refuses to overwrite later edits. History is in memory (up to 50 changes), not persisted across extension reload. Native Ctrl+Z is also supported.

## Safety and recovery limits

Reviewed file proposals are checked against the reviewed base before applying; outside paths and symlinks are rejected. Commands are explicitly confirmed shell programs with YOUR permissions, not an OS sandbox. Path preflight rejects obvious outside operands, but cannot confine arbitrary programs, package scripts, or encoded shell code. Commands may write files, and their effects cannot be rolled back automatically. Do not approve commands you do not trust.

Before any operation is approved, failures retry twice with 1s/2s backoff, then use the fallback agent in a fresh session. After a write or command approval, automatic replay stops to avoid duplicating effects. Failed/cancelled runs can retain previously approved effects; inspect git status and use Undo last for Forge file edits. Provider output is not evidence that an edit was saved; check the tool result.

Context budget defaults to 6000 estimated tokens (chars/4) INCLUDING context wrappers. This does not count the user's request, TrueForge history, system prompt or tool schemas, and is not an exact tokenizer limit. Short code slices can span an entire tiny file. Each user request gets a fresh session; only approval-resume turns reuse that session. One workspace folder and one active request are supported. A single forge-editor registration is shared by name; do not run multiple extension windows against one TrueForge server.

## Settings

| Setting | Default |
|---|---|
| forge.baseUrl | http://localhost:8790 |
| forge.agentName | forge-agent |
| forge.fallbackAgentName | forge-agent-fallback |
| forge.contextBudget | 6000 |

## Flask demo and verification

Use pallets/flask tag 3.1.3 (commit 22d924701a6ae2e4cd01e9a15bbaf3946094af65). See [demo steps](scripts/demo.md), [audit log](docs/AUDIT.md), [complete bug table](docs/BUGS.md), [rubric evidence checklist](docs/RUBRIC.md), and [write-up](docs/WRITEUP.md).

Unit/integration checks do not need model keys. The audit includes a real Windows VS Code host test for CRLF/undo/ripgrep. Build that optional test with node scripts/build-native-tests.cjs <scratch-output-directory>, then launch a disposable workspace with --extensionTestsPath=<scratch-output-directory>/index.cjs. Set FORGE_NATIVE_RESULT to a scratch JSON path to capture results. Never use your working project as the native test workspace: it creates native.txt.

Windows, macOS and Linux CI passed for commit 3236dac (docs/ci-results.json). Native editor UI tests remain Windows-only. The ripgrep platform binary must be installed as an optional dependency; build/package a VSIX on its target platform. A universal VSIX is not supplied.

Live model-backed Task A and Task B are NOT yet passed: the audited TrueForge server has no configured providers. Task C has automated fault coverage and manually observed offline-activation behavior, not a verified live bad-key provider run. Full reproduction status is recorded honestly in the audit.

License: MIT
