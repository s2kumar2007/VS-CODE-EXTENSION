# Submission status

Verified on 28 October 2026. Team Git Push, VIT Vellore: B. Sunil Kumar, Eric Bejoy, Sreekeerthana Adapa, Samyuktha BR.

| Item | State | Evidence |
|---|---|---|
| Typecheck / unit tests / build | Pass: 92 tests | docs/AUDIT.md |
| Windows / macOS / Linux CI | Pass for 7d4bbf9 | docs/ci-groq-results.json |
| Windows package / installation / native editing | Pass | docs/vsix-groq-package-results.json; docs/vsix-groq-native-results.json |
| Official rubric / team / three-page PDF | Prepared; video timestamps pending | docs/RUBRIC.md; docs/WRITEUP.md; scripts/build-writeup.py |
| Exact official Task C | Pass in automated real-provider native host; rejected writes; clean checkout | docs/live-C-official-recheck.json |
| Live Task A | Not passed; quota errors and an invalid proposal, whose generated change was restored | docs/live-A-scoped-recheck.json; docs/live-A-25-validation.json |
| Live Task B | Not passed; provider quota | docs/live-B-reset-recheck.json |
| Groq fallback | Committed configuration and setup helper tested; local key missing | scripts/configure-groq.ps1; test/groqSetup.test.ts |
| Required on-screen demo video | Not recorded | scripts/demo.md |

Run powershell -NoProfile -File .\scripts\configure-groq.ps1 from the repo in a normal terminal. Enter the key only in the hidden local prompt. The helper verifies real Groq generation before configuring it in TrueForge. Then reload the extension and rerun A/B with FORGE_LIVE_FALLBACK=forge-agent-fallback. No credentials belong in the repository or chat. Gemini authenticated successfully; real terminal errors identify five-requests/minute and 20-requests/day free-tier limits, not a missing key.
