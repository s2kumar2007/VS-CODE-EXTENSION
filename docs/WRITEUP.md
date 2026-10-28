# Forge Agent — write-up

## 1. Team

Team: Git Push. Institution: VIT Vellore. Members: B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa, and Samyuktha BR (details supplied by the user). Individual roles are unspecified. Repository owner: s2kumar2007.

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

Primary and inline remain Google Gemini (google-gemini/gemini-3-5-flash and google-gemini/gemini-2-5-flash). The user requested an independent Groq fallback; its committed manifest now points to groq/gpt-oss-120b, provider model openai/gpt-oss-120b. No Groq key is currently available locally, so activation and real Groq validation are pending. scripts/configure-groq.ps1 prompts privately; its helper verifies generation, stores the credential only in TrueForge settings, preserves other models and synchronizes agents. No provider credentials are committed.

Google authentication and exact Task C fallback succeeded. Live A/B encountered HTTP 429: five free-tier requests per minute and 20 per day; the latest Gemini 2.5 response reports roughly 18h19m to reset. A later proposal overescaped quotes throughout helpers.py, so it failed Python parsing and is not counted as a pass. Its generated edit was restored in the disposable checkout. The harness now checks function scope and Python syntax before approval and independently verifies resulting behavior. Provider cost remains unknown. See docs/LIVE_TESTS.md for exact automated scope.

## 6. Scorecard

Official weights and definitions are sourced in docs/official-rubric.json and docs/RUBRIC.md. No judge score is claimed. Video timestamps are unavailable until the required recording exists.

| Criterion | Maximum | Video timestamp | Evidence / honest claim |
|---|---:|---|---|
| A1 Inline edit | 10 | Not recorded | Live A blocked by provider rate limits; native mechanisms pass. |
| A2 Agent mode | 10 | Not recorded | Live B blocked by provider rate limits. |
| A3 Streaming and cancellation | 10 | Not recorded | Automated tests pass; required video not recorded. |
| B1 Context assembly | 15 | Not recorded | Budget/retrieval tests pass; live trace selects 22 items within 6000 estimated tokens. |
| B2 Diff safety | 10 | Not recorded | Installed native tests pass; video not recorded. |
| B3 Resilience | 10 | Not recorded | Exact inline Task C passed in the real native-host harness: unreachable primary, two retries, fresh fallback, rejected proposals, clean checkout; video pending. |
| B4 TrueForge integration depth | 10 | Not recorded | Wire/MCP tests pass. Subagent/compaction flags alone do not establish top-anchor behavior. |
| C1 Video | 10 | Not recorded | Video not supplied; no credit claimed. |
| C2 Write-up | 15 | Not recorded | Three-page PDF prepared with supplied team details; video timestamps pending. |

## 7. Tools used

TrueForge 0.180.1, TS SDK 0.180.0, VS Code native extension test host, MCP SDK, TypeScript, esbuild, Vitest, ripgrep, diff, Node and Git. ChatGPT assisted this audit and regression implementation. Unit tests include scripted clients and mocked VS Code APIs; wire tests use the real SDK with controlled HTTP/SSE responses. Native host tests exercise real VS Code editing, undo and ripgrep without calling models.

## 8. Known limitations

- The exact inline Task C passed in the real native-host harness with an unreachable primary, fresh fallback and rejected proposals; its checkout stayed clean. Tasks A/B remain subject to account rate limits; no accepted model edits are claimed. Dynamic subagents are enabled, not claimed as observed without event evidence.
- run_command executes with user permissions. Path preflight catches explicit escapes but cannot sandbox arbitrary code or guarantee outside files are untouched. Approved command effects cannot be rolled back.
- Before approval, failures use exponential retries then fallback in a fresh session. After any write/command approval, replay stops to prevent duplication; uncertain effects are reported. Failure/Stop can retain already approved changes.
- One folder and one active request. Each user request creates a fresh session; approval resumes reuse it. The shared forge-editor registration does not isolate multiple windows on one server.
- Undo history is in memory for 50 changes and does not survive extension reload. It refuses later text changes rather than merging an inverse patch. New file undo is supported; directory cleanup is not automatic.
- Line-based diffs, complete proposed file content, regex symbol fallback and a chars/4 context estimate. CRLF normalization retains the existing convention; mixed-EOL fidelity is not promised.
- Remote/OIDC auth is not configured. The local MCP bearer token protects the endpoint; it is not an OS sandbox. Symlink checks cannot eliminate races with other processes changing the filesystem concurrently.
- Three-OS Node CI and Windows packaged VSIX installation/native editor checks passed. macOS/Linux native UI execution remains unverified. Package on each target platform with its optional ripgrep binary; no universal VSIX is delivered.
