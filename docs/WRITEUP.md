# Forge Agent — write-up

## 1. Team

Verified repository owner: Sunil Kumar (GitHub: s2kumar2007). Team name, other members and role assignments are unconfirmed. The owner authorized using verified details only; no additional team identity is inferred.

## 2. Starting point (from scratch)

This audit starts from repository commit 4ca90c9. The repository describes its original implementation as from scratch; that provenance has not been independently verified. This audit preserves the working extension architecture and adds targeted fixes and regressions. MIT license. Main dependencies: TrueForge SDK, MCP SDK, zod, diff and @vscode/ripgrep.

## 3. Architecture on TrueForge

The extension calls TrueForge sessions.create and createTurnStream. The model loop, provider calls, subagents and context compaction run in TrueForge. The editor hosts an authenticated loopback MCP endpoint exposing read_file, list_dir, search_workspace, propose_write and run_command. Registration uses PUT /api/v1/settings/mcp-servers with remote manifest/header auth. Agent create/update is by immutable registry id after an exact-name lookup.

An id-keyed event index merges deltas and locates approval arguments by source_event_id plus tool-call id. The pending event owns thread_id. A complete terminal event is required before requesting approval. A resume turn contains only user.tool_approval items. Stop sends sessions.cancel, aborts streaming/local reviews and clears unused decisions.

File writes require a single-use reviewed (path, content) decision, unchanged base text, workspace containment and an active run. Only accepted immutable diff segments are reconstructed into one WorkspaceEdit, preserving offsets and CRLF. Undo checks the current text and removes newly created files. Commands need separate exact local permits, have bounded output and cancellable process trees; they are not sandboxed.

## 4. How context is selected (strategy + budget)

Agent mode always attempts retrieval. Keywords, ranked literal/symbol matches, importers and explicit @file/@symbol mentions select file snippets, signatures and a compact repo map. Reasons and real file labels appear in Context used. Dense hit windows and explicit heads are capped at 40 lines; signatures are capped at 25. Tiny files can naturally fit within a snippet.

The default 6000-token limit is a chars/4 estimate of the rendered CONTEXT block, including labels, reasons, fences, separators and preamble. It is not an exact model tokenizer count or a limit on the whole turn (request/history/instructions/tool schemas are separate). A synthetic 5000-file fixture verifies the rendered estimate remains within the budget. Context reads enforce realpath containment. Stop during assembly prevents the subsequent model request.

## 5. Model setup

The local account now has Google configured with model aliases gemini-3-5-flash and gemini-2-5-flash. The primary uses google-gemini/gemini-3-5-flash; inline and fallback use google-gemini/gemini-2-5-flash. The same provider credential supports both models, so this configuration covers model failures but not a Google-wide outage. A valid independent-provider credential was not available.

Generation succeeded on both configured models. Gemini 3.8 was listed but returned HTTP 503; tool turns also encountered Google's five-requests/minute free-tier quota. The live invalid-key test used a disposable OpenAI-compatible provider, retried twice, and completed through a fresh Gemini 2.5 fallback session (docs/live-C.json and docs/live-C-sessions.json). No credentials are committed. Provider cost remains unknown, not zero. See docs/LIVE_TESTS.md for exact automated live-test scope.

## 6. Scorecard

| Check | Observed result | Evidence |
|---|---|---|
| Clean clone / npm ci | Passed | docs/AUDIT.md phase 8 |
| Typecheck / unit suite / build | Passed | audit phase records |
| A inline get_debug_flag | Live attempts reached provider; quota-limited before approval | docs/live-A-provider-503.json; docs/live-A-provider-429.json |
| B flask config, >=3 files | Live validation pending | Baseline 58 CLI tests pass; no model edit claimed |
| C bad key / bad endpoint | Real bad-key retry/fallback passed; offline activation and injected endpoint faults covered separately | docs/live-C.json; docs/live-C-sessions.json; resilience.test.ts |
| Native Windows review-edit undo | Passed | docs/native-host-results.json |
| Windows / macOS / Linux CI | Passed for commit 3236dac | docs/ci-results.json; GitHub run 40505578815 |

Completed live Task C timestamps and session metrics are recorded. No successful Task A/B edits or provider costs are claimed; no provider stack trace is invented. Exact observed launch failure and activation message are in the audit. The rubric evidence mapping is in docs/RUBRIC.md; official label definitions were not supplied.

## 7. Tools used

TrueForge 0.180.1, TS SDK 0.180.0, VS Code native extension test host, MCP SDK, TypeScript, esbuild, Vitest, ripgrep, diff, Node and Git. ChatGPT assisted this audit and regression implementation. Unit tests include scripted clients and mocked VS Code APIs; wire tests use the real SDK with controlled HTTP/SSE responses. Native host tests exercise real VS Code editing, undo and ripgrep without calling models.

## 8. Known limitations

- Live Task C passed. Tasks A/B remain subject to the account free-tier quotas; the evidence distinguishes failures from successful edits. Dynamic subagents are enabled, not claimed as observed without event evidence.
- run_command executes with user permissions. Path preflight catches explicit escapes but cannot sandbox arbitrary code or guarantee outside files are untouched. Approved command effects cannot be rolled back.
- Before approval, failures use exponential retries then fallback in a fresh session. After any write/command approval, replay stops to prevent duplication; uncertain effects are reported. Failure/Stop can retain already approved changes.
- One folder and one active request. Each user request creates a fresh session; approval resumes reuse it. The shared forge-editor registration does not isolate multiple windows on one server.
- Undo history is in memory for 50 changes and does not survive extension reload. It refuses later text changes rather than merging an inverse patch. New file undo is supported; directory cleanup is not automatic.
- Line-based diffs, complete proposed file content, regex symbol fallback and a chars/4 context estimate. CRLF normalization retains the existing convention; mixed-EOL fidelity is not promised.
- Remote/OIDC auth is not configured. The local MCP bearer token protects the endpoint; it is not an OS sandbox. Symlink checks cannot eliminate races with other processes changing the filesystem concurrently.
- Three-OS Node CI and Windows packaged VSIX installation/native editor checks passed. macOS/Linux native UI execution remains unverified. Package on each target platform with its optional ripgrep binary; no universal VSIX is delivered.
