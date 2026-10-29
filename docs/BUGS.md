# Bugs found and fixes

Original line numbers refer to audited base commit 4ca90c9. Each defect was reported before its fix.

| ID | File | Line | Symptom | Root cause | Fix | Regression test |
|---|---|---:|---|---|---|---|
| P1-1 | test/tools.test.ts | 12 | Windows search fails ENOENT | Linux-only binary fixture | host platform/architecture selection | test/tools.test.ts |
| P1-2 | test/paths.test.ts | 28 | Symlink fixture requires Windows privileges | directory link type omitted | junction on Windows | test/paths.test.ts |
| P2-1 | src/forge/turnRunner.ts | 67 | Review skipped after terminal done | pending state overwritten | retain pending approvals | test/contract.test.ts; controller.test.ts |
| P2-2 | src/forge/turnRunner.ts | 61 | Wrong thread on approval resume | uses source message instead of pending owner | use pending threadId | test/contract.test.ts |
| P2-3 | test/cancel.test.ts | 56 | Flaky undefined reviewSignal | fixed sleep assumes review is ready | explicit readiness promise | test/cancel.test.ts |
| P4-1 | src/workspace/vscodeApi.ts | 66 | Command can execute without local review | server-only gate | exact single-use local permit | test/editorSafety.test.ts; safety.test.ts |
| P4-2 | src/workspace/runCommand.ts | 25 | Child processes survive Stop/timeout | kills parent only; no signal | tree termination and AbortSignal | test/safety.test.ts |
| P4-3 | src/workspace/runCommand.ts | 9 | UTF-8 output exceeds byte cap | character slicing | byte-bounded head/tail | test/safety.test.ts |
| P4-4 | src/review/approvals.ts | 45 | Late approval after cancellation | no post-UI abort check | abort guards and final write check | test/safety.test.ts; editorSafety.test.ts |
| P4-5 | src/agent/controller.ts | 60 | Stale approval survives failure | no decision cleanup | clear at attempt/run boundaries | test/controller.test.ts |
| P4-6 | src/workspace/vscodeApi.ts | 98 | New file undo leaves empty file; refused edit loses history | no creation metadata; ignores applyEdit result | delete created file; check result | test/editorSafety.test.ts; native/index.ts |
| P4-7 | src/review/approvals.ts | 42 | CRLF review changes unchanged lines | raw LF proposal diff | normalize existing EOL | test/safety.test.ts |
| P4-8 | src/review/ReviewPanel.ts | 65 | Stop cannot dismiss command prompt | modal without cancellation | abortable Run/Cancel picker | test/reviewPanel.test.ts |
| P4-9 | src/workspace/paths.ts | 38 | Dangling symlink/error can pass containment | all realpath errors fall back to parent | ENOENT-only fallback; reject dangling links | test/paths.test.ts |
| P4-10 | src/workspace/runCommand.ts | 17 | Explicit command outside paths accepted | no preflight | path validation (not an OS sandbox) | test/safety.test.ts |
| P4-11 | src/agent/controller.ts | 83 | Turn starts after Stop during session create | no late-session cancel check | abort requests; cancel late session | test/cancel.test.ts |
| P5-1 | src/extension.ts | 48 | Offline setup needs reload | one-shot bootstrap | shared on-demand retry | test/resilience.test.ts |
| P5-2 | src/forge/turnRunner.ts | 39 | Malformed event throws raw TypeError | no envelope checks | validate required envelope fields | test/contract.test.ts |
| P5-3 | src/agent/controller.ts | 42 | Retries duplicate authorized effects | replays whole request | disable replay after approval | test/resilience.test.ts |
| P5-4 | src/agent/controller.ts | 102 | False completed/unchanged-workspace messages | approval count treated as applied writes; commands omitted | count both operations; report uncertainty | test/controller.test.ts; resilience.test.ts |
| P5-5 | src/forge/client.ts | 7 | Setup failures take too long | 600s setup + SDK retries | 15s default, stream override, retry owner | test/contract.test.ts |
| P6-1 | src/context/budget.ts | 22 | Rendered context exceeds budget | only snippet body counted | count wrapper and preamble | test/context.test.ts |
| P6-2 | src/context/assemble.ts | 35 | Dense hits paste unbounded file window | unbounded adjacent merge | 40-line merged cap | test/context.test.ts |
| P6-3 | src/context/assemble.ts | 59 | Explicit medium file pasted whole | 120-line whole-file branch | bounded head/signatures | test/context.test.ts |
| P6-4 | src/context/vscodeDeps.ts | 25 | Outside symlink content enters prompt | lexical-only validation | realpath containment | test/contextHost.test.ts |
| P6-5 | src/panel/ChatPanel.ts | 46 | Stop/overlap during retrieval races model start | controller not busy during assembly | panel guard and abort | test/contextHost.test.ts |
| P7-1 | src/workspace/vscodeApi.ts | 57 | Sibling workspace symbol exposed | startsWith path prefix | segment-aware containment | test/editorSafety.test.ts |
| P7-2 | src/workspace/vscodeApi.ts | 18 | Wrong ripgrep host architecture | npm target overrides running arch | use process.arch | test/editorSafety.test.ts; native/index.ts |
| P8-1 | agents/forge-agent.json | 6 | Primary example unusable for new accounts | old provider ID confused with configured alias | current catalog alias | test/docs.test.ts |
| P8-2 | agents/forge-agent-fallback.json | 6 | Fallback retired for general developer accounts | obsolete model default | gpt-oss-120b alias and provider ID | test/docs.test.ts |
| P8-3 | README.md | 55 | Unsupported unchanged-workspace claim | ignores prior approved effects | honest scoped safety/recovery docs | docs/WRITEUP.md; tests cover effects |
| P8-4 | src/forge/turnRunner.ts | 75 | Review opens on truncated SSE | pending status accepted without terminal event | require terminal done | test/contract.test.ts |

| P9-1 | package.json | 1 | VSIX packaging fails on relative README links | repository URL missing | add repository metadata | test/docs.test.ts and successful VSCE package |
| P9-2 | README.md | 29 | local MCP registration returns HTTP 400 | TrueForge outbound policy blocks loopback by default | document explicit 127.0.0.1 allowlist | live registration retry recorded in follow-up audit |
| P9-3 | test/native/index.ts | 29 | native Undo assertion races UI/document updates | global Undo focus and event observation not synchronized | focus editor, await document change | installed VSIX native host passed |
| P9-4 | agents/*.json | 35 | live turns spend extra provider requests discovering editor schemas | preload disabled for the known editor tools | preload editor schemas in all manifests | real-provider trace and SDK manifest regression |

| P9-5 | src/agent/resilience.ts | 62 | quota recovery retries before provider wait expires | fixed backoff ignores retry hint | honor 429 retry text up to 60 seconds; Stop cancels waiting | test/resilience.test.ts quota window, cap and cancellation |
| P9-6 | .vscodeignore | 1 | VSIX ships thousands of already bundled dependency files | package exclusions omit node_modules | exclude bundled modules, retain platform ripgrep | scripts/verify-vsix.py and installed activation/native tests |

| P10-1 | docs/RUBRIC.md | 5 | evidence assigned to wrong official criterion labels | mapping was provisional without the organizer PDF | replace with authoritative nine-criterion 100-point mapping | test/docs.test.ts complete official weights and document coverage |
| P10-2 | test/native/live.ts | 41 | greeting probe mislabeled as fixed Task C | C did not reuse the inline request | repeat Task A prompt and require a clean checkout even after expected failure | exact native Task C rerun; runner checks prompt, error and git status |

| P11-1 | scripts/demo.md | 46 | manual failure demo still requests read-only text and claims the greeting probe as fixed Task C | script not updated with official scenario | repeat Task A, reject proposals, distinguish generic probe | test/docs.test.ts official inline demo regression |

| P11-2 | test/native/live.ts | 32 | automated inline review accepts unrelated/invalid edits in the permitted file | approval scope checks filename only | require unchanged text outside get_debug_flag and valid Python; runner checks actual files and behavior | test/livePolicy.test.ts; live-A-25-validation.json captures the rejected result |

| P12-1 | agents/forge-agent-fallback.json / TrueForge custom-provider adapter | model setup | Groq tool turns fail HTTP 400 on reasoning_content replay although greeting works | TrueForge 0.180.1 custom adapter replays incompatible reasoning and drops include_reasoning | local Groq HTTP compatibility adapter strips replay fields and suppresses reasoning output, preserving tools/SSE | test/groqAdapter.test.ts; live-A-groq-fallback.json records original error |
| P12-2 | src/agent/resilience.ts | 38 | Groq quota wait ignored | regex recognizes retry in but not try again in | accept both provider hint wordings | test/resilience.test.ts Groq wait regression |

| P12-3 | scripts/groq-adapter.cjs | response forwarding | Groq rejects a later generated tool call before delivery, forcing full-session restarts | provider SSE tool-generation/schema error was relayed immediately | bounded regeneration only before text/tool delivery; lower temperature; never replay visible text | test/groqAdapter.test.ts pre-delivery recovery and immediate-stream/no-replay cases |

| P13-1 | src/forge/turnRunner.ts | describeToolCall | wrapped call_tool proposals denied as unknown approval tool | underlying forge-editor name/input not resolved | unwrap only trusted editor wrappers and reject malformed/non-object inputs | test/contract.test.ts wrapped approvals |
| P13-2 | src/forge/turnRunner.ts | delta dispatch | streamed tool activity absent | tool callbacks only processed full snapshots | report each merged indexed tool call once | test/contract.test.ts indexed fragments |
| P13-3 | src/forge/turnRunner.ts | terminal state | unsupported client questions appear complete | tool.response_required ignored before done | report unsupported client response as error | test/contract.test.ts client response required |

| P13-4 | src/inline/inlineEdit.ts; src/mcp/tools.ts | proposal contract | tiny edits regenerate full files and exceed free-tier request limits | only full new_content accepted | optional exact edits build a local candidate; existing review, permits and base checks remain authoritative | test/proposal.test.ts; MCP unreviewed exact edit regression in test/tools.test.ts |

| P14-1 | scripts/run-live-tests.cjs | exit verification | task ending without proposals leaves done in JSON and failure only in console | outer validation catch did not persist failure | persist verification.status=failed for every post-run validation error | node syntax check; failed live-B-exact-edits.json retained as example |
