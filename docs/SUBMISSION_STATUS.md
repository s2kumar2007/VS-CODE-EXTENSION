# Submission status

Verified on 29 October 2026. Team Git Push, VIT Vellore: B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa, Samyuktha BR.

| Item | State | Evidence |
|---|---|---|
| Typecheck / unit tests / build | Pass: 116 tests | docs/AUDIT.md |
| Windows / macOS / Linux CI | Pass for bdea965 | docs/ci-groq-results.json |
| Windows package / installation / native editing | Earlier package passed; final refresh in progress | docs/vsix-groq-package-results.json; docs/vsix-groq-native-results.json |
| Official rubric / team / three-page PDF | Source updated; PDF refresh in progress | docs/RUBRIC.md; docs/WRITEUP.md |
| Exact official Task C | Pass in automated real-provider native host; rejected writes; clean checkout | docs/live-C-official-recheck.json |
| Live Task A | Pass: scoped reviewed edit, independent behavior checks and all 35 Flask helper tests | docs/live-A-exact-edits.json; docs/live-A-flask-tests.json |
| Live Task B | Under validation; prior attempt ended without proposals, not a pass | docs/live-B-exact-edits.json; docs/live-B-context-tuned.json |
| Groq fallback | Configured privately; real generation and Task A fallback verified | scripts/configure-groq.ps1; docs/live-A-exact-edits.json |
| Demo video | Excluded by user; no recording or credit claimed | scripts/demo.md |

Provider credentials are stored only in local TrueForge settings outside the repository. Keep the loopback Groq adapter running beside TrueForge; see README. Provider quota and malformed-generation failures remain possible. Automated native-host task checks use scoped programmatic review and do not establish a manual UI demonstration. See WRITEUP section 8 for command permissions, multiwindow and platform limitations.
