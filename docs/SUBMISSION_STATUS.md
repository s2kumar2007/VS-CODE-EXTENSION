# Submission status

Verified on 31 October 2026. Team Git Push, VIT Vellore: B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa, Samyuktha BR.

| Item | State | Evidence |
|---|---|---|
| Typecheck / unit tests / build | Pass: 120 tests | docs/AUDIT.md |
| Windows / macOS / Linux CI | Pass for 8b811ba | docs/ci-groq-results.json |
| Windows package / installation / native editing | Pass: final packaged extension installs, activates offline, and passes native editor checks | docs/vsix-final-package-results.json; docs/vsix-final-native-results.json |
| Official rubric / team / three-page PDF | Source updated; PDF regenerated and verified | docs/RUBRIC.md; docs/WRITEUP.md |
| Exact official Task C | Pass in automated real-provider native host; rejected writes; clean checkout | docs/live-C-official-recheck.json |
| Live Task A | Pass: scoped reviewed edit, independent behavior checks and all 35 Flask helper tests | docs/live-A-exact-edits.json; docs/live-A-flask-tests.json |
| Live Task B | Incomplete: evaluated live with real Groq qwen-3-8-27b; 11 search/read turns executed; ended without proposals due to 15m host timeout; clean checkout preserved | docs/live-B-verified.json; docs/live-B-serial-tools.json |
| Groq fallback | Configured privately; real generation and Task A fallback verified | scripts/configure-groq.ps1; docs/live-A-exact-edits.json |
| Demo video | Excluded by user; no recording or credit claimed | scripts/demo.md |

Provider credentials are stored only in local TrueForge settings outside the repository. Keep the loopback Groq adapter running beside TrueForge; see README. Provider quota and malformed-generation failures remain possible. Automated native-host task checks use scoped programmatic review and do not establish a manual UI demonstration. See WRITEUP section 8 for command permissions, multiwindow and platform limitations.
