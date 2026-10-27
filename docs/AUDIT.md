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
