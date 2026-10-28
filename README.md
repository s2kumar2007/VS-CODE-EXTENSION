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
4. Configure the primary/inline Google model aliases and the Groq fallback below in TrueForge Settings, using your own keys. The secure Groq setup helper is described below. A fresh server starts with no configured models. Never put keys in this repository or VS Code settings.
5. Run code . in the extension repository, press F5 (Run Extension), then open your disposable Flask checkout in the development host. Alternatively:

    code --new-window --extensionDevelopmentPath="<absolute extension repo>" "<absolute Flask checkout>"

Activation starts a loopback MCP server, registers its bearer header in TrueForge and syncs agents/*.json. If setup fails, a non-blocking warning appears; sending a request retries setup. Reload after changing agent JSON or server model configuration that was already synchronized.

## Models and Groq fallback

The primary and inline agents use Google. At the user's request, the fallback manifest now uses Groq. Model names in agents/*.json must match TrueForge Settings. Google was account-verified; Groq activation and live testing require a locally supplied Groq key.

| Role | TrueForge agent reference | Provider model_id |
|---|---|---|
| Primary | google-gemini/gemini-3-5-flash | gemini-3.5-flash |
| Inline | google-gemini/gemini-2-5-flash | gemini-2.5-flash |
| Fallback (setup pending) | groq/gpt-oss-120b | openai/gpt-oss-120b |

Both models accepted actual generation requests with the available account. The live bad-key test recovered from an invalid OpenAI-compatible provider to Gemini 2.5. That historical fallback probe used Google for both models. The new Groq fallback provides a separate provider once configured; it has not yet been live-verified. Google free-tier quotas apply separately to model requests and blocked longer tool turns during this audit. Gemini 2.5 access can be account-restricted: verify your own account before copying these defaults.

The former primary gemini-3.8-flash was listed but returned HTTP 503 during generation. The available OpenAI credential returned HTTP 401. No Groq credential is currently available in process, Windows user or machine environment, or TrueForge settings. The fallback is staged in forge-agent-fallback.json; setup must complete before activation can synchronize all required agents. Never put keys in this repository. config.example.json is an illustrative checklist, not an importable TrueForge manifest.

## Secure local Groq setup

Start TrueForge, then run this from a normal PowerShell terminal:

    powershell -NoProfile -File .\scripts\configure-groq.ps1

The prompt hides the key. It is passed through a temporary process environment variable, sent only to Groq and the loopback TrueForge server, and cleared afterward; the helper never writes it to a repository file. TrueForge retains the credential in its own local provider settings outside this repo. An existing GROQ_API_KEY is also supported. On macOS/Linux, set GROQ_API_KEY outside the repo and run node scripts/configure-groq.cjs.

The helper verifies model access and a small generation request before changing TrueForge settings, preserves other Groq models, then synchronizes the committed primary, inline and fallback agents. It refuses a conflicting provider named groq. Reload the extension afterward. Official API/model references: https://console.groq.com/docs/overview and https://console.groq.com/docs/models.

Gemini diagnosis on 28 October: actual HTTP 429 events report both a five-request/minute free-tier cap and a 20-request/day cap; the latest Gemini 2.5 failure reports roughly 18h19m until reset. Authentication has succeeded, including the exact inline Task C fallback. Retrying cannot increase the daily allowance. See docs/live-reset-sessions.json and docs/LIVE_TESTS.md. Groq has independent account limits; no Groq quota or working credential is claimed yet.

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

A live greeting-based bad-key probe demonstrated retries and a fresh fallback session with a clean checkout. The official fixed Task C instead repeats the inline request; the corrected harness has not yet verified that exact case. Tasks A/B remain under live validation and have encountered provider quotas. See docs/LIVE_TESTS.md for the automated harness scope and docs/AUDIT.md for exact results.

License: MIT
