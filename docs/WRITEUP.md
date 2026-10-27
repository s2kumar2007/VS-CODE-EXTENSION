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

Verified example identifiers on 27 October 2026:

| Role | TrueForge agent reference | Provider model_id |
|---|---|---|
| Primary/inline | google-gemini/gemini-3-8-flash | gemini-3.8-flash |
| Fallback | groq/gpt-oss-120b | openai/gpt-oss-120b |

Configure Google Gemini and a custom OpenAI-compatible provider named groq in TrueForge. Model configured names are aliases, distinct from provider model_id values. Groq base URL: https://api.groq.com/openai/v1. Keys belong only in TrueForge Settings. See README for current provider references. The audited server returned an empty models list; no real model invocation or provider cost was measured. Cost is unknown, not zero.

## 6. Scorecard

| Check | Observed result | Evidence |
|---|---|---|
| Clean clone / npm ci | Passed | docs/AUDIT.md phase 8 |
| Typecheck / unit suite / build | Passed | audit phase records |
| A inline get_debug_flag | Blocked: no configured provider | Flask commit verified; native host opens |
| B flask config, >=3 files | Blocked: no configured provider | No successful multi-file model edit claimed |
| C bad key / bad endpoint | Automated fault tests pass; manual offline activation observed | resilience.test.ts, contract.test.ts, audit phase 3 |
| Native Windows review-edit undo | Passed | docs/native-host-results.json |
| Windows / macOS / Linux CI | Passed for commit 3236dac | docs/ci-results.json; GitHub run 40505578815 |

Task A/B execution times, live tokens, provider costs and model-generated Flask changes are not available. No fabricated success or stack traces. Exact observed launch failure and activation message are in the audit. The rubric evidence mapping is in docs/RUBRIC.md; official label definitions were not supplied.

## 7. Tools used

TrueForge 0.180.1, TS SDK 0.180.0, VS Code native extension test host, MCP SDK, TypeScript, esbuild, Vitest, ripgrep, diff, Node and Git. ChatGPT assisted this audit and regression implementation. Unit tests include scripted clients and mocked VS Code APIs; wire tests use the real SDK with controlled HTTP/SSE responses. Native host tests exercise real VS Code editing, undo and ripgrep without calling models.

## 8. Known limitations

- Full live Tasks A/B and provider-key Task C still require configured models and account entitlement. Dynamic subagents are enabled in manifests, not verified in a model-backed run.
- run_command executes with user permissions. Path preflight catches explicit escapes but cannot sandbox arbitrary code or guarantee outside files are untouched. Approved command effects cannot be rolled back.
- Before approval, failures use exponential retries then fallback in a fresh session. After any write/command approval, replay stops to prevent duplication; uncertain effects are reported. Failure/Stop can retain already approved changes.
- One folder and one active request. Each user request creates a fresh session; approval resumes reuse it. The shared forge-editor registration does not isolate multiple windows on one server.
- Undo history is in memory for 50 changes and does not survive extension reload. It refuses later text changes rather than merging an inverse patch. New file undo is supported; directory cleanup is not automatic.
- Line-based diffs, complete proposed file content, regex symbol fallback and a chars/4 context estimate. CRLF normalization retains the existing convention; mixed-EOL fidelity is not promised.
- Remote/OIDC auth is not configured. The local MCP bearer token protects the endpoint; it is not an OS sandbox. Symlink checks cannot eliminate races with other processes changing the filesystem concurrently.
- macOS/Linux native execution and packaged VSIX install remain unverified; package on each target platform with optional ripgrep dependencies. No universal VSIX is delivered.
