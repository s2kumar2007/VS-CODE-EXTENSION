# Forge Agent - write-up

## 1. Team
TODO: team name, members, roles.

## 2. Starting point (from scratch)
Written from scratch, no fork. MIT licensed. Dependencies: `@truefoundry/trueforge-sdk`, `@modelcontextprotocol/sdk`, `zod`, `diff`, `@vscode/ripgrep`.

## 3. Architecture on TrueForge
```
VS Code extension host                         TrueForge (localhost:8790)
 ChatPanel / inline edit  --AgentController-->  sessions.create / createTurnStream  (agent loop, subagents, compaction)
 ReviewPanel (diff+hunks) <-- tool.approval_required                |
 MCP server 127.0.0.1:<port>/mcp  <------ remote MCP (bearer token) +  tools/call
```
- **Agent loop on TrueForge.** The extension is a client of `@truefoundry/trueforge-sdk`. `AgentController` creates a session for a named agent, streams a turn (`runTurn`: id-keyed event Map, `isEventDelta`/`mergeEventDelta`, live `model.message.delta` text), and repeats until `turn.done`.
- **Editor as MCP tools.** `src/mcp/server.ts` hosts a stateless streamable-HTTP MCP server on 127.0.0.1 (random port, random bearer token held in memory). On activation it is registered in TrueForge with `settings.mcpServers.createOrUpdate` (name `forge-editor`) and the agents in `agents/*.json` are created/updated by name. Tools: `read_file`, `list_dir`, `search_workspace` (ripgrep text + symbol), `propose_write`, `run_command`. All paths are validated inside the workspace (lexical + symlink check).
- **Approvals.** Agents list `propose_write`/`run_command` in `require_approval_for_tools`. A gated call ends the turn with `tool.approval_required`; the controller reads the call from the issuing `model.message`, asks the review UI, and resumes with a NEW turn containing only `user.tool_approval` items (allow, or deny with a reason).
- **Review and apply.** `propose_write` arguments are diffed against the current file into hunks (`diff` package). The user accepts/rejects hunks in a webview list while a native diff editor shows the live result. The decision is stored under hash(path, content); when TrueForge executes the allowed call, the MCP handler applies only accepted hunks through one `WorkspaceEdit` and returns "applied hunks 1,3; rejected 2". With no stored decision the handler refuses, so nothing is written without review.
- **Cancellation.** Stop calls `sessions.cancel`, aborts the local review (AbortSignal), discards stored decisions, closes review UI; the stream ends by itself with `turn.done(cancelled)`.
- **Resilience.** `runWithFallback`: 1 try + 2 retries (1s, 2s backoff) on the primary agent, then the fallback agent (different provider) in a new session with the same request, notice "Primary model failed, using fallback"; if both fail one clear message. Writes only happen after approval, so failed runs leave the workspace unchanged.

## 4. How context is selected (strategy + budget)
`src/context/assemble.ts`, default budget **6000 tokens** (`forge.contextBudget`), tokens estimated as chars/4.
1. **Explicit mentions** `@file:path` / `@symbol:name` (autocomplete in the panel): highest priority; large files are cut to head + signatures; symbols to ~40 lines.
2. **Ranked shortlist** from the request: keywords (stop-words removed) -> ripgrep hits per file; path matches; symbol-name matches among top candidates (regex top-level symbols); files that import the best-matching modules (+1.5). Each candidate contributes its top-level **signatures** plus up to two **slices** (+-6 lines around hits, merged). Never whole files.
3. **Repo map** (directory -> files), capped at ~20% of the budget.
4. **Packing** (`packContext`): by priority, truncating the last item that does not fit (if >= 80 tokens remain), dropping the rest. Output never exceeds the budget.
The agent also gets `search_workspace` (ranked, one-line "why" per result) and is instructed to state which files it chose and why. The panel shows a "Context used" section (label, reason, tokens).

## 5. Model setup
- Primary: `google-gemini/<model>` (catalog provider). Fallback: `groq/<model>` (custom OpenAI-compatible provider named `groq`). Both configured only in TrueForge Settings; run on the providers' hosted APIs, TrueForge runs locally via `npx`.
- Cost: TODO (fill from TrueForge session metrics / provider pricing).
- Switching: edit `model.name` in `agents/*.json` (re-synced on next activation) or change `forge.agentName` / `forge.fallbackAgentName`.

## 6. Scorecard
| Task | Result | Start | End | Notes |
|---|---|---|---|---|
| A inline edit | TODO | TODO | TODO | |
| B agent mode | TODO | TODO | TODO | |
| C failure handling | TODO | TODO | TODO | |

## 7. Tools used
TrueForge + TS SDK, MCP SDK, VS Code Extension API, esbuild, TypeScript, vitest, ripgrep, `diff`. TODO: list AI assistants used while building.

## 8. Known limitations
- Not yet exercised against a live TrueForge/VS Code by the author of this code; first F5 run may need small adjustments (e.g. model ids, tool-name format in approval events - matching is by suffix).
- `propose_write` sends the full file content; very large files are costly. Hunks are line-based.
- Symbol search falls back to definition-regex when no language server answers.
- `@vscode/ripgrep` ships per-platform packages; a cross-platform VSIX needs them all.
- Retries re-send the request; changes already applied before a failure are not rolled back automatically (use "Undo last applied change").
- Single workspace folder; one run at a time.
