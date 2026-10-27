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
