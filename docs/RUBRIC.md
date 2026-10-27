# Rubric evidence checklist

The request names A1–A3 and B1–B4 but does not include their official definitions, and no organizer rubric is committed in this repository. The working mapping below groups the requested audit dimensions; it is not an assertion of official scoring or a substitute for the organizer rubric. Blocked items remain unchecked.

| Item | Working interpretation | Evidence file(s) | Demo step | Status |
|---|---|---|---|---|
| A1 | Inline edit on get_debug_flag | src/inline/inlineEdit.ts; agents/forge-inline.json; test/native/index.ts | scripts/demo.md Task A: select helper, invoke inline edit, review, verify off/n | [ ] Live model task blocked; native edit/undo mechanism passed |
| A2 | Agent mode, no files named, >=3 changed files | src/panel/ChatPanel.ts; src/context/assemble.ts; agents/forge-agent.json | scripts/demo.md Task B: send exact config command prompt, inspect Context used, review code/tests/docs, run pytest | [ ] Live model task blocked; retrieval and multi-approval regressions passed |
| A3 | Bad key/endpoint recovery | src/agent/resilience.ts; src/agent/controller.ts; test/resilience.test.ts; test/contract.test.ts | scripts/demo.md Task C: disposable bad-provider setup, observe backoff/fallback, confirm unchanged git status before approval | [ ] Automated faults passed; manual offline activation observed; live provider run pending |
| B1 | TrueForge contract and backend agent loop | src/forge/client.ts; agents.ts; turnRunner.ts; test/contract.test.ts | Show local /api/v1/openapi.json and TrueForge session turns; verify pure approval input and owning thread | [x] SDK wire tests and local schema verified; model execution pending |
| B2 | Context selection and bounded budget | src/context; test/context.test.ts; test/contextHost.test.ts | Expand Context used during Task B; run 5000-file budget regression | [x] Automated retrieval, real file reasons and rendered estimate verified |
| B3 | Review, cancellation, paths, commands, undo | src/review; src/workspace; test/safety.test.ts; test/editorSafety.test.ts; test/native/index.ts | Accept one hunk/reject another; Stop while diff open; reopen file and Undo last; try outside paths; cancel command | [x] Automated + native Windows evidence; arbitrary commands remain unsandboxed |
| B4 | Reproducibility, portability and honest docs | README.md; docs/WRITEUP.md; .github/workflows/ci.yml | Fresh clone npm ci, typecheck, tests, build; follow setup; show native results | [x] Three-OS CI passed for 3236dac; Windows VSIX install and native checks passed |

Session behavior: the same session is reused for approval resumes, not between separate user requests. Overlapping requests are rejected; two calls in one completed turn are reviewed sequentially and resumed together. Stale decisions are cleared on cancellation, attempt failure and completion.

No model keys are needed to run unit tests or the native VS Code host tests. Real Tasks A–C must be recorded separately after configuring providers; do not present synthetic fault tests as provider-backed results.
