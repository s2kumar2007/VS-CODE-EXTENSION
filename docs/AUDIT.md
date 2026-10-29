# Forge audit — 27 October 2026

Base: 4ca90c9. Windows x64, Node 24.13.1.

## Phase 1 — build health

`npm ci`: 141 packages, zero reported vulnerabilities. All ten declared dependency minimum versions returned HTTP 200 from the npm registry. Initial typecheck passed; tests: 37 passed, one failed (`spawn .../ripgrep-linux-x64/bin/rg ENOENT`, tools.test.ts:51). Root cause: Linux-only binary in test fixture. Fixed platform/architecture selection and portable directory-symlink fixture. Final typecheck, 38 tests, build passed. Fresh-clone verification will be repeated in phase 8.

## Bugs

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P1-1 | test/tools.test.ts:12 | Windows search test fails with ENOENT; Linux binary hardcoded | Select host platform/arch/executable | Existing real MCP search test now runs on Windows |
| P1-2 | test/paths.test.ts:35 | Directory symlink fixture needs Windows symlink privileges | Use junction on Windows, dir elsewhere | Existing real symlink escape test |

## Phase 2 — TrueForge contract

Read https://trueforge.dev/llms.txt, api/use-agent.md, published openapi.json and SDK 0.180.0 serializers. CLI latest resolves to 0.180.1; installation/start is still pending. Real SDK wire tests confirm PUT /api/v1/settings/mcp-servers, manifest header auth, GET/POST agents and PUT agents/{id}, including existing snake_case agent JSON serialization. Session create/stream and pure approval resumes are covered by controller tests. Corrected pending approval lifecycle and owning thread. Typecheck, 40 tests, build passed. Local OpenAPI/live validation pending CLI startup.

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P2-1 | src/forge/turnRunner.ts:79 | terminal done overwrites pending approvals, skipping review | preserve paused when approvals exist | contract.test.ts; controller.test.ts terminal event sequence |
| P2-2 | src/forge/turnRunner.ts:72 | resume can use source message thread instead of approval owner | use approval event threadId | contract.test.ts child-thread case |
| P2-3 | test/cancel.test.ts:56 | fixed 30ms delay flakes under load | explicit review-open promise | existing pending-review cancellation test |

## Phase 3 — manual Flask E2E

Checkout verified: pallets/flask tag 3.1.3, HEAD 22d924701a6ae2e4cd01e9a15bbaf3946094af65. Development host opened with --extensionDevelopmentPath and Flask workspace. First launcher failed with exact dialog: `Uncaught Exception: Error: Windows: Unexpected undefined %USERPROFILE% environment variable at TU (file:///C:/Users/K/AppData/Local/Programs/Microsoft%20VS%20Code/e646868227/resources/app/out/mainImpl.js:7:843) at RU (.../mainImpl.js:7:692) at Ym (.../mainImpl.js:7:429) at .../mainImpl.js:195:6701 at ModuleJob.run (node:internal/modules/esm/module_job:561:25) at process.processTicksAndRejections (node:internal/process/task_queues:104:5) at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:647:26) at async .../main.js:27:62499`. Supplied USERPROFILE for launcher; host then opened.

Observed activation warning: `Forge: TrueForge is not reachable. Start it with \`npx @truefoundry/trueforge@latest\`, then reload the window.` No extension crash; panel opens. Task A (get_debug_flag) and Task B (flask config, tests/docs, no file names) are BLOCKED pending a live backend/model; no successful model edits claimed. Task C unreachable activation is observed manually; bad-key and retry/fallback are automated fault tests, not a manual provider-key test. No provider credentials supplied or modified. Flask git status remains clean.

## Phase 4 — safety

Typecheck, 55 tests, build passed. No direct fs.writeFile/workspace.fs.writeFile in src. The only applyEdit sites are reviewed apply and explicit undo. Immutable segment assembly preserves offsets (equivalent to bottom-up application without mutating offsets). Approval decisions are single-use and cleared at attempt/run boundaries. Two-call and overlapping-request tests pass. Cancel before writes and during diff review leaves disposable git repositories clean. Previously approved/applied changes are not rolled back on Stop. New files are removed by Undo last; later edits prevent undo. Editor API tests use a VS Code mock; native undo-stack behavior still needs host validation.

IMPORTANT LIMIT: run_command is an explicitly confirmed shell command with user permissions, not an OS sandbox. Obvious outside-path operands and symlinks are rejected, but programs, package scripts, and encoded shell code can still access outside paths or write files. Cancellation cannot roll back effects of an already approved command. Do not interpret the path preflight as a security boundary for arbitrary code.

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P4-1 | src/workspace/vscodeApi.ts:84 | command execution has no local approval gate | single-use exact command permits | editorSafety.test.ts; safety.test.ts |
| P4-2 | src/workspace/runCommand.ts:23 | timeout kills shell only; Stop cannot kill child | AbortSignal, taskkill tree / POSIX process group | safety.test.ts real timeout and abort |
| P4-3 | src/workspace/runCommand.ts:8 | character slicing exceeds UTF-8 byte cap and large chunks overallocate | byte-bounded head/tail collection | safety.test.ts emoji output |
| P4-4 | src/review/approvals.ts:52 | late review can store approval after Stop | abort checks before/after UI; queued write checks signal | safety.test.ts; editorSafety.test.ts |
| P4-5 | src/agent/controller.ts:65 | decisions survive failed run/attempt | clear at attempt and finally | controller.test.ts failed resume |
| P4-6 | src/workspace/vscodeApi.ts:117 | new-file undo leaves empty file; refused undo still pops | record creation; delete on undo; check apply result | editorSafety.test.ts |
| P4-7 | src/review/approvals.ts:45 | LF proposal against CRLF turns every line into change | normalize to existing EOL, preserve final-newline presence | safety.test.ts partial CRLF |
| P4-8 | src/review/ReviewPanel.ts:84 | modal command prompt cannot be cancelled | abortable QuickPick | reviewPanel.test.ts |
| P4-9 | src/workspace/paths.ts:44 | all realpath errors treated as absent; dangling links pass parent check | only ENOENT fallback; reject dangling symlinks | paths.test.ts |
| P4-10 | src/workspace/runCommand.ts:20 | no outside-path command preflight | reject explicit traversal, absolute operands, outside symlinks | safety.test.ts; shell sandbox limitation above |
| P4-11 | src/agent/controller.ts:89 | Stop during session creation can still start a turn | request AbortSignal and post-create cancellation check | cancel.test.ts; native network coverage pending |

## Phase 5 — resilience

Typecheck, 66 tests, build passed. Fault injection covers 401, unreachable host, 429, malformed envelope, SSE disconnect, and turn.done(error), with 1s/2s backoff and a fresh fallback session; disposable workspaces remain unchanged before approval. Real SDK fetch/SSE tests verify session/turn/cancel paths and wire bodies. Local OpenAPI read from http://localhost:8790/api/v1/openapi.json: 52 paths, OpenAPI 3.1.0. GET /api/v1/models returned an empty list; live provider tasks remain blocked. Startup setup now retries on demand, sharing in-flight setup. Default setup requests bounded to 15s with SDK retries disabled; turn streaming retains 600s timeout. After an approved write OR command, automatic replay stops to avoid duplicate effects. UI reports uncertain completion honestly; approved effects are not automatically rolled back.

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P5-1 | src/extension.ts:61 | offline activation permanently skips registration | lazy shared setup retried on request | resilience.test.ts setup recovery |
| P5-2 | src/forge/turnRunner.ts:48 | malformed envelope throws raw TypeError | validate envelope and approval arrays | contract.test.ts malformed event |
| P5-3 | src/agent/controller.ts:44 | retry replays already authorized side effects | stop replay after write/command approval | resilience.test.ts replay guard |
| P5-4 | src/agent/controller.ts:111 | approvals reported as completed writes; commands omitted | count approved operations and report uncertainty | controller/cancel safety tests; replay guard |
| P5-5 | src/forge/client.ts:8 | 600s setup timeout plus nested SDK retries causes long startup failure | 15s default, SDK retry off; 600s turn override | contract.test.ts request coverage |

## Phase 6 — context

Typecheck, 72 tests, build passed. A 5,000-file / 10,000-line fixture checks actual rendered char/4 cost, including preamble, file labels, reasons, fences and separators. This is a deterministic estimate, NOT a provider-tokenizer guarantee. Dense windows capped at 40 lines; explicit files capped to 40 lines plus 25 signatures; no raw whole-file concatenation branch remains (short snippets may naturally span an entire tiny file). Agent-mode host tests prove automatic context and real paths/reasons reach both prompt and Context used. Reads enforce realpath containment. Stop during retrieval suppresses the later model request; overlapping sends are ignored.

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P6-1 | src/context/assemble.ts:133; budget.ts:28 | budget excludes prompt wrapper/metadata | count exact rendered representation and reserve preamble | context.test.ts 5000-file fixture |
| P6-2 | src/context/assemble.ts:40 | dense hits merge into unbounded slice | cap merged windows at 40 lines | context.test.ts dense hits |
| P6-3 | src/context/assemble.ts:66 | explicit files <=120 lines pasted whole | bounded 40-line head + capped signatures | context.test.ts explicit mention |
| P6-4 | src/context/vscodeDeps.ts:28 | context read can follow outside symlink | realpath containment | contextHost.test.ts |
| P6-5 | src/panel/ChatPanel.ts:57 | Stop/second send during retrieval races model start | panel sending guard and abort check | contextHost.test.ts |

## Phase 7 — Windows / macOS / Linux

Typecheck, 74 tests, build passed on Windows x64. Native VS Code test host PASSED (docs/native-host-results.json): one native Undo restores a CRLF change; two Undo last operations after editor close/reopen; later manual edits preserved; ripgrep executes from extension host. Harness: test/native/index.ts, compiled with scripts/build-native-tests.cjs. Node child processes use windowsHide; commands use platform shell, taskkill tree on Windows / process groups on POSIX. Path display normalizes slashes. findRg uses createRequire at extension package.json to resolve the installed @vscode/ripgrep platform package without bundling its ESM entrypoint. esbuild output was executed in native host. VSIX must be built on the target platform with optional dependencies installed; no universal binary bundle claim. Three-OS CI added; Linux/macOS jobs are pending external execution, not claimed as passed locally.

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P7-1 | src/workspace/vscodeApi.ts:70 | sibling prefix accepted as workspace symbol | segment-aware containment + file scheme | editorSafety.test.ts |
| P7-2 | src/workspace/vscodeApi.ts:21 | inherited npm target arch can select wrong binary | use running host architecture | editorSafety.test.ts; native host |

## Phase 8 — docs and final verification

Fresh clone of phase 7 (4e6241f): npm ci, typecheck, all 74 tests and build PASSED. Final source/docs regression counts are recorded below after the final gate. README now uses npm ci, both platform venv activation forms are in the demo, current provider IDs are separated from TrueForge aliases, and the eight write-up headings are retained. docs/BUGS.md is the consolidated 32-row table with original 4ca90c9 line numbers. docs/RUBRIC.md includes all seven requested labels with explicit status and an interpretation caveat (official definitions were not supplied/found).

Current model examples were checked against the live TrueForge provider catalog and official Google/Groq docs. Google Gemini 3.8 Flash uses provider model_id gemini-3.8-flash and catalog configured name gemini-3-8-flash. Groq gpt-oss-120b uses provider model_id openai/gpt-oss-120b; the old Llama 3.3 fallback is restricted to enterprise contracts. Sources: https://ai.google.dev/gemini-api/docs/models and https://console.groq.com/docs/deprecations. Account entitlement remains unverified without credentials.

Late resilience correction: an approval event followed by EOF without turn.done is now treated as an interrupted stream; no review is opened and no approval is sent. Regression: contract.test.ts. The former fake streams missing terminal events were corrected to match the live contract.

Unfinished validation: model-backed Flask Tasks A/B and live provider-key Task C need configured models (GET /api/v1/models was empty). macOS/Linux CI and packaged VSIX installation are pending. Arbitrary confirmed commands remain unsandboxed; no claim of complete filesystem containment or rollback is made. Nothing was pushed or published.

Final phase gate: npm run typecheck && npm test && npm run build PASSED; 79 tests across 15 test files. Windows native host evidence passed separately. All declared npm versions exist.

## Follow-up validation

GitHub Actions run 40505578815 completed successfully for 3236dac on windows-latest, ubuntu-latest and macos-latest; docs/ci-results.json records the exact commit and run URL. These are hosted Node checks, not native macOS/Linux UI tests.

VSCE 4.0.0 initially rejected packaging because package.json omitted repository metadata, preventing README relative-link rewriting. Fixed in fe7481c, with a docs regression; typecheck, 80 tests and build passed. Windows x64 VSIX packaged successfully (6,950 files, about 8.97 MB) and VS Code CLI reported successful installation into an isolated profile. The installed package passed native CRLF/Undo/reopen/later-edit/ripgrep checks (docs/vsix-native-results.json). The native fixture now focuses the editor and awaits its change event; checking the document immediately after global Undo was unreliable during host startup.

Live setup discovered TrueForge 0.180.1 rejects loopback MCP registration by default: HTTP 400, Outbound URL blocked for host "127.0.0.1". README now documents the narrowly scoped OUTBOUND_URL_ALLOWED_HOSTS=["127.0.0.1"] server setting. Gemini model catalog authentication succeeded. The available OpenAI credential returned HTTP 401; a valid independent fallback provider has not been established. No credentials are committed.

Live Task C passed in 7.5 seconds with the real invalid OpenAI-compatible credential: three failed primary sessions (initial plus two retries), then a distinct Gemini 2.5 fallback session returned done. Checkout git status remained empty; no tool calls or approvals occurred. Exact provider terminal errors and session IDs are in docs/live-C-sessions.json. The normal primary/fallback defaults now use the two available Google models, with shared-provider limitations stated explicitly.

Quota follow-up: provider-directed 429 waits are now honored up to 60 seconds, with a small clock allowance, while ordinary failures keep exponential backoff. Stop clears the default wait timer immediately. The no-replay guard after approved operations is preserved. Typecheck, 83 tests and build passed.

Updated VSIX verification: compact Windows package contains 20 files / 2,448,119 bytes (about 2.33 MiB). Integrity, required ripgrep binary, excluded SDK dependencies and absence of .env files verified by scripts/verify-vsix.py. SHA-256 and file evidence: docs/vsix-package-results.json. CLI installation succeeded; installed bundled extension explicitly activated and native CRLF/Undo/reopen/later-edit/ripgrep checks passed: docs/vsix-activation-native-results.json.

## Final live rerun after quota-aware retry fix

Both A and B were rerun against real providers using 2cc66c3. Both failed before any approval or workspace mutation: HTTP 429, 20 free-tier requests per day exhausted. Gemini 2.5 and the primary upstream reported roughly 13 hours 44 minutes to reset. Exact terminal errors and session IDs: docs/live-A-retry-sessions.json and docs/live-B-retry-sessions.json. Controller outputs/context: docs/live-A-retry-aware.json and docs/live-B-retry-aware.json. Both git status outputs are empty in docs/live-final-status.json. The longer daily-reset hint is not a recoverable short wait; the seconds-based retry improvement cannot create additional daily quota. No A/B success or manual review demo is claimed.

Task C remains a successful real bad-key/fallback test. Its disposable invalid agent/provider were removed after recording evidence; working Google provider settings were retained. Current primary/fallback share one provider. The official organizer definitions for A1-A3/B1-B4 were not supplied or located, so the rubric mapping remains explicitly an interpretation. Sunil Kumar is the verified owner; no unsupported team roles are invented. Raw context snippets from Flask are covered by docs/FLASK-LICENSE.txt.

Official source located through https://techfest.org/api/compis/: competition forge-a-thon links the TrueFoundry Forge-a-thon PDF. All pages were extracted and the rubric table visually checked. Source SHA-256 and pages are recorded in docs/official-rubric.json. Earlier label interpretations were incorrect; docs/RUBRIC.md and the write-up scorecard now map all nine official criteria and 100 points. The official Task C repeats the inline request; the earlier successful greeting probe is now clearly identified as generic fallback evidence, not the prescribed fixed task. The native harness and runner have been corrected accordingly.

28 October follow-up: the official rubric blocker is resolved in 12e1221. A real inline rerun on configured Gemini 3.8 also returned HTTP 429 before approval (docs/live-A-38-recheck.json). No edits were applied. The next alternate-model availability check could not reach a provider because the local TrueForge backend went offline and the restart did not become reachable during verification. No alternate availability or successful fixed Task C is claimed. The required on-screen demos and timestamps remain pending.
Restricted-host recheck: Windows TypeScript initially hit VirtualAlloc errno 1455 (memory exhaustion). A reduced-concurrency retry with an explicitly writable temporary directory passed typecheck and 78/84 tests. Four junction fixtures failed with EPERM and two process timeout/abort tests timed out in this restricted host. These failures are retained, not skipped or relabeled as passes; the earlier full 84-test gate remains the last fully successful local run. The user selected waiting for the quota reset; a one-time follow-up is scheduled for 28 October at 12:35 IST to retry live validation and recheck access.

28 October resumed verification: GitHub API confirms main already contains cc98d90. Restricted-shell recheck passed 76/84 with EPERM junctions, EACCES loopback connections and child-process timeouts. Running the same suite in the Windows host runtime passed all 84 tests without source changes. The stale Task C demo instructions still used a read-only request and claimed the greeting probe as the official task; corrected to repeat Task A and reject proposals, with a documentation regression. Required typecheck, 85 tests and build passed. TrueForge is reachable and the real Task A reset recheck is in progress; no new live success is claimed here.

Submission follow-up: user supplied B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa and Samyuktha BR as members. No institution/team name/roles were supplied. Added scripts/build-writeup.py, which generates a three-page PDF from the eight-section Markdown source. All three rendered pages were inspected; member names and page count were independently checked with pypdfium2. PDF remains a validation draft because video timestamps and successful A/B are unavailable. npm run typecheck, npm test (85 tests), and npm run build passed.

Exact official Task C completed with status done on 28 October: unreachable disposable primary, two retries, fresh Gemini 2.5 fallback. Three proposed helpers.py edits were rejected and the checkout remained clean. Disposable provider and agent deleted afterward. Evidence: live-C-official-recheck.json, live-reset-sessions.json and live-reset-workspaces.json. Team subsequently confirmed as Git Push, VIT Vellore.

A subsequent Gemini 2.5 attempt applied an invalid overescaped full-file proposal, then stopped after an approved operation; no replay occurred. Independent ast.parse failed at helpers.py:29. This is NOT a Task A pass. The automated approval harness had checked filename only and accepted all 61 hunks, including unrelated changes. Hardened harness now requires unchanged text outside get_debug_flag, validates proposed Python syntax before approval, and independently verifies actual changed files and requested behavior after completion. Added two scope regressions. Preserved the failed diff in scratch and restored only its generated helpers.py change. Product review/edit logic was not changed. Required typecheck, all 87 tests and build pass.

Groq follow-up requested by user: fallback manifest now uses groq/gpt-oss-120b while primary/inline remain Gemini. Local setup helper verifies Groq generation before configuring only the Groq provider and synchronizing agents; PowerShell hides the key and clears its transient environment value. Existing unrelated Groq models are preserved and a conflicting provider is refused. No key is in process/user/machine environment or current TrueForge providers, so actual Groq provisioning and live A/B remain blocked until local credential entry. The strict A rerun ended 429 before review; all disposable A/B/C checkouts are clean. Latest Gemini terminal error states 20 requests/day exhausted, roughly 18h19m reset hint. Typecheck, all 92 tests and build pass.

Final delivery verification: the Groq-ready win32-x64 VSIX contains 20 files / 2,448,940 bytes, including ripgrep. Its SHA-256 is d4645950e0aaa7f35fc56c6e9a8768b23289989328dbfd22a0621aedd95e1ae6. Generated reports and fixtures are excluded. Integrity and committed fallback manifest checks pass. Final package was installed into an isolated profile and passed bundled activation, CRLF/native undo, repeated custom undo after reopen, later-edit protection and ripgrep. Its bundled extension bytes match the final build. Typecheck, 92 tests and build pass. GitHub Actions for 7d4bbf9 passed Windows, macOS and Linux (ci-groq-results.json). The three-page PDF includes all eight sections, confirmed team/members, sourced scorecard and honest pending video timestamps.

Remaining: local Groq key entry and real-provider Groq verification; successful scoped live Tasks A/B; required on-screen A/B/C demo video and corresponding PDF timestamps. No successful A/B, completed submission, or live Groq claim is made. Exact official Task C is verified separately. All disposable Flask checkouts are clean after recovering the invalid generated A edit.

Groq credential follow-up: user completed private local setup; provider and fallback registration were verified without displaying the stored key. The first real fallback tool turn exposed HTTP 400 on unsupported reasoning_content. TrueForge 0.180.1 custom compatibility code also drops include_reasoning. A Qwen no-reasoning probe avoided that error but hit 7000 input tokens/minute. Added a loopback-only, fixed-upstream Groq HTTP adapter that normalizes only incompatible reasoning, preserves tool calls/SSE, waits for 429 before streaming, and aborts on downstream disconnect. Setup starts it without inheriting GROQ_API_KEY. Added streaming/cancellation/auth/path/limit regressions. Extension retry hints now recognize Groq try-again wording. Typecheck, all 100 tests and build passed. Real A/B validation continues; no success claimed here.

29 October follow-up: native test launch was blocked by the installed VS Code updater mutex. Downloaded the official isolated VS Code Insiders 1.145.0 archive and verified Microsoft SHA-256 c133a6cde23a36bf34f4f17d04f31704ed7876c2fbd51f1feef9a0c6a06e1775 before extraction; no working editor was terminated. Qwen with a quota-aware adapter advanced but reached a hard 413: 9274 input tokens versus its 7000 limit. Restored GPT-OSS fallback with serial tool calls, a sufficient output allowance, and explicit use of preloaded editor tools. Groq SSE generation/schema errors now receive bounded retries only while all tool-call chunks remain undelivered; real text streams immediately and is never replayed. Added four regression cases. Typecheck, 104 tests and build pass. No A/B success claimed. Screen recording app approval timed out; no video was recorded.

29 October recovery: inspected the interrupted working tree. Wrapped-call approval resolution, streamed tool activity and unsupported client-response reporting survived; optional exact-edit code did not. Typecheck, 107 tests and build passed. The latest live A trace reached a wrapped proposal but the old client denied call_tool before review; a later ask_user_question was incorrectly reported as done. These cases now have regressions. No live A/B pass is claimed. The user explicitly removed the demo video from scope.

Compact proposal follow-up: propose_write now supports either complete new_content or 1-20 exact edits. Each anchor must match exactly once; CRLF follows the existing file. Candidate construction occurs in both approval and execution, so a changed base cannot reuse a permit. Both forms still use the same hunk review, single-use candidate key and WorkspaceEdit apply path. Inline/agent instructions prefer exact edits for existing files; no whole-file reconstruction is needed for a small change. Added seven regressions for matching, ambiguity, CRLF, partial hunk permits, cancellation and refusal before review. Typecheck, 114 tests and build passed. The user excluded demo video; no recording is required by this session, and official video credit is not claimed.

### 29 October 2026: exact-edit validation

Task A passed in a real-provider native VS Code host after Gemini quota failure and Groq fallback. Only helpers.py changed within the selected function. Independent truth/false/docstring checks passed, followed by all 35 Flask helper tests (asgiref installed only in a disposable test dependency directory). Typecheck, 114 unit tests and build passed. Task B exact-edits attempt ended after four read/search calls and returned an excerpt without proposing changes; this is a failed task, preserved in live-B-exact-edits.json. Raised the Groq compaction threshold from 4000 to 16000 input tokens for the next attempt; this is a tuning change, not proof of successful compaction. Video explicitly excluded by user.

### 29 October 2026: provider wrapper correction

The context-tuned B run hit Gemini's five-request/minute limit, switched to Groq, and failed provider-side tool validation (missing mcp_server/tool_name on call_tool). Cancelled the remaining old-instruction retry with the session cancel API before any review; the checkout stayed clean. Groq instructions incorrectly prohibited wrappers despite this backend exposing call_tool. They now include the full wrapper schema and a task-continuation reminder. A separate focused Groq B rerun uses FORGE_LIVE_PRIMARY=forge-agent-fallback; normal product defaults remain Gemini primary with Groq fallback. Typecheck, 114 tests and build passed for 1b7b97b.

### 29 October 2026: HTTP-level recovery

Groq pre-delivery regeneration previously covered SSE frames only. Added the same bounded retry to recognized HTTP 400 tool_use_failed/validation errors, with required-field feedback and preserved original history. Ordinary 400, authentication errors, oversized prompts and visible text are not replayed. Added two HTTP regression tests; all 116 tests, typecheck and build passed for 2cce0da. The focused real-provider Task B rerun is recorded separately in live-B-http-recovery.json.

### 29 October 2026: account context cap identified

The HTTP recovery run progressed through search and reads, then Groq returned HTTP 413: Limit 8000, Requested 9593 on single-request TPM. No review or changes occurred. This confirms that raising compaction to 16000 exceeded this account's usable request budget. Reduced the fallback trigger to 5500 and instructed bounded 40-line reads/eight search results. Provider limits remain external; the next focused run tests the configuration rather than claiming success from flags.

### 29 October 2026: final package and native editor validation

Final checks for 6aac57f: typecheck, 117 tests, build. The win32-x64 VSIX contains 20 files and includes the platform ripgrep binary; exact byte count and SHA256 are in vsix-final-package-results.json. It installed successfully in an isolated VS Code Insiders profile. Native activation and editor tests passed (CRLF, one native Undo, repeated Forge Undo after reopen, refusal to overwrite later manual edits, and real ripgrep execution). This native run deliberately pointed bootstrap at unreachable loopback port 1 to avoid replacing the active live B MCP registration; it does not claim connected backend setup. See vsix-final-native-results.json.

### 29 October 2026: focused model comparison

GPT-OSS B with bounded context continued to fail required call_tool schema validation before any review. Stopped the remaining retries and retained failed evidence in live-B-bounded-context.json. A Qwen comparison uses the same real controller/MCP/editor and official filename-free request, with a recorded 1000-token context budget, 4500-token compaction trigger and reasoning=none. Added optional validated harness overrides; corrected a TypeScript SDK/raw JSON casing mismatch in the override before committing. Typecheck passed. Product defaults remain Gemini primary and Groq GPT-OSS fallback.

### 29 October 2026: Qwen output quota

Qwen progressed through direct searches/reads without GPT-OSS wrapper failures, then rejected a request expecting 2048 output tokens under its 1000-output-TPM account cap. Added an optional validated adapter output ceiling, with forwarding tests; it is off by default. The explicit 900-token Qwen comparison preserves the official request and normal review/application safety. Settings and failures are recorded separately; no task pass is inferred from provider availability.
