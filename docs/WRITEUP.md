# Forge Agent — write-up

## 1. Team

Team: Git Push. Institution: VIT Vellore. Members: B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa, and Samyuktha BR (details supplied by the user). Individual roles are unspecified. Repository owner: s2kumar2007.

## 2. Starting point (from scratch)

This audit starts from repository commit 4ca90c9. The repository describes its original implementation as from scratch; that provenance has not been independently verified. This audit preserves the working extension architecture and adds targeted fixes and regressions. MIT license. Main dependencies: TrueForge SDK, MCP SDK, zod, diff and @vscode/ripgrep.

## 3. Architecture on TrueForge

The extension calls TrueForge sessions.create and createTurnStream. The model loop, provider calls, subagents and context compaction run in TrueForge. The editor hosts an authenticated loopback MCP endpoint exposing read_file, list_dir, search_workspace, propose_write and run_command. Registration uses PUT /api/v1/settings/mcp-servers with remote manifest/header auth. Agent create/update is by immutable registry id after an exact-name lookup.

An id-keyed event index merges deltas and locates approval arguments by source_event_id plus tool-call id. The pending event owns thread_id. Deferred call_tool approvals are unwrapped only for forge-editor; unsupported client-side requests fail clearly. A complete terminal event is required before requesting approval. A resume turn contains only user.tool_approval items. Stop sends sessions.cancel, aborts streaming/local reviews and clears unused decisions.

Proposals use complete new_content or bounded exact edits against unique anchors. The client materializes a candidate; file writes require a single-use reviewed (path, content) decision, unchanged base text, workspace containment and an active run. Only accepted immutable diff segments are reconstructed into one WorkspaceEdit, preserving offsets and CRLF. Undo checks the current text and removes newly created files. Commands need separate exact local permits, have bounded output and cancellable process trees; they are not sandboxed.

## 4. How context is selected (strategy + budget)

Agent mode always attempts retrieval. Keywords, ranked literal/symbol matches, importers and explicit @file/@symbol mentions select file snippets, signatures and a compact repo map. Reasons and real file labels appear in Context used. Dense hit windows and explicit heads are capped at 40 lines; signatures are capped at 25. Tiny files can naturally fit within a snippet.

The default 6000-token limit is a chars/4 estimate of the rendered CONTEXT block, including labels, reasons, fences, separators and preamble. It is not an exact model tokenizer count or a limit on the whole turn (request/history/instructions/tool schemas are separate). A synthetic 5000-file fixture verifies the rendered estimate remains within the budget. Context reads enforce realpath containment. Stop during assembly prevents the subsequent model request.

## 5. Model setup

Primary and inline use Google Gemini; the independent fallback is Groq GPT-OSS 120B. The user entered the Groq credential privately and it is retained in TrueForge settings outside the repository. Gemini authentication succeeded, but live runs exhausted its free-tier quota. Actual Task A recovered through Groq, applied only the selected function change, and independently passed false/true/docstring checks. Task B uses six context items costing 1490 of 1500 estimated tokens; its outcome is recorded in the live evidence.

TrueForge 0.180.1 replays reasoning_content that Groq rejects and drops include_reasoning. A loopback-only HTTP adapter normalizes those fields, preserves tool calls and text streaming, honors quota delays, and permits bounded schema-feedback regeneration for HTTP/SSE tool errors before any output is delivered. TrueForge retains the agent loop and approvals. The setup helper starts the adapter without inheriting the key; after a machine restart, run it alongside TrueForge. Exact edits reduce token use. The fallback compaction trigger is 5500 input tokens. Account limits remain applicable; cost is unmeasured.

## 6. Scorecard

Official weights and definitions are sourced in docs/official-rubric.json and docs/RUBRIC.md. No judge score is claimed. The user excluded the demo video; timestamps are N/A and no video credit is claimed.

| Criterion | Maximum | Video (excluded) | Evidence / honest claim |
|---|---:|---|---|
| A1 Inline edit | 10 | N/A | Passed real-provider native host: scoped reviewed edit and independent false/true/docstring checks; video excluded by user. |
| A2 Agent mode | 10 | N/A | Task B under validation; prior attempt made no proposals. |
| A3 Streaming and cancellation | 10 | N/A | Automated tests pass; video excluded by user. |
| B1 Context assembly | 15 | N/A | Budget/retrieval tests pass; latest live trace selects six items within 1490/1500 estimated tokens. |
| B2 Diff safety | 10 | N/A | Installed native tests pass; video excluded by user. |
| B3 Resilience | 10 | N/A | Exact inline Task C passed in the real native-host harness: unreachable primary, two retries, fresh fallback, rejected proposals, clean checkout; video excluded by user. |
| B4 TrueForge integration depth | 10 | N/A | Wire/MCP tests pass. Subagent/compaction flags alone do not establish top-anchor behavior. |
| C1 Video | 10 | N/A | Excluded by user; no recording or video credit claimed. |
| C2 Write-up | 15 | N/A | Three-page PDF prepared with supplied team details; video excluded by user. |

## 7. Tools used

TrueForge 0.180.1, TS SDK 0.180.0, VS Code native extension test host, MCP SDK, TypeScript, esbuild, Vitest, ripgrep, diff, Node and Git. ChatGPT assisted this audit and regression implementation. Unit tests include scripted clients and mocked VS Code APIs; wire tests use the real SDK with controlled HTTP/SSE responses. Native host tests exercise real VS Code editing, undo and ripgrep without calling models.

## 8. Known limitations

- The exact inline Task C passed in the real native-host harness with an unreachable primary, fresh fallback and rejected proposals; its checkout stayed clean. Task A has passed with scoped edits and independent checks; Task B is under validation. Provider quotas and malformed generations remain possible. Dynamic subagents are enabled, not claimed as observed without event evidence.
- run_command executes with user permissions. Path preflight catches explicit escapes but cannot sandbox arbitrary code or guarantee outside files are untouched. Approved command effects cannot be rolled back.
- Before approval, failures use exponential retries then fallback in a fresh session. After any write/command approval, replay stops to prevent duplication; uncertain effects are reported. Failure/Stop can retain already approved changes.
- One folder and one active request. Each user request creates a fresh session; approval resumes reuse it. The shared forge-editor registration does not isolate multiple windows on one server.
- Undo history is in memory for 50 changes and does not survive extension reload. It refuses later text changes rather than merging an inverse patch. New file undo is supported; directory cleanup is not automatic.
- Line-based diffs, optional exact-anchor proposals, regex symbol fallback and a chars/4 context estimate. CRLF normalization retains the existing convention; mixed-EOL fidelity is not promised.
- Remote/OIDC auth is not configured. The local MCP bearer token protects the endpoint; it is not an OS sandbox. Symlink checks cannot eliminate races with other processes changing the filesystem concurrently.
- The user excluded the organizer video; no recording or video score is claimed.
- Three-OS Node CI and Windows packaged VSIX installation/native editor checks passed. macOS/Linux native UI execution remains unverified. Package on each target platform with its optional ripgrep binary; no universal VSIX is delivered.
