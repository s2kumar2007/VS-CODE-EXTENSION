# Forge audit — 27 October 2026

Base: 4ca90c9. Windows x64, Node 24.13.1.

## Phase 1 — build health

`npm ci`: 141 packages, zero reported vulnerabilities. All ten declared dependency minimum versions returned HTTP 200 from the npm registry. Initial typecheck passed; tests: 37 passed, one failed (`spawn .../ripgrep-linux-x64/bin/rg ENOENT`, tools.test.ts:51). Root cause: Linux-only binary in test fixture. Fixed platform/architecture selection and portable directory-symlink fixture. Final typecheck, 38 tests, build passed. Fresh-clone verification will be repeated in phase 8.

## Bugs

| ID | File and original line | Symptom / root cause | Fix | Regression |
|---|---|---|---|---|
| P1-1 | test/tools.test.ts:12 | Windows search test fails with ENOENT; Linux binary hardcoded | Select host platform/arch/executable | Existing real MCP search test now runs on Windows |
| P1-2 | test/paths.test.ts:35 | Directory symlink fixture needs Windows symlink privileges | Use junction on Windows, dir elsewhere | Existing real symlink escape test |
