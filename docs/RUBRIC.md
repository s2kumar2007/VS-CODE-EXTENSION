# Official rubric evidence checklist

Source: [Techfest Forge-a-thon problem statement](https://techfest.org/media/compiProbStatement/TrueFoundry_Forge-a-thon_compressed_UvvRJ9C.pdf), pages 7–9. The competition API links this PDF. SHA-256: 5feeee151edc6bf098743e6eaf5e87b8996adc7bc13abbe1fc8409074d6ddb49. Definitions and weights are now sourced; this replaces the earlier provisional mapping. Evidence status is self-reported, not an awarded score.

| ID | Maximum | Criterion | Evidence | Demo proof | Current status |
|---|---:|---|---|---|---|
| A1 | 10 | Inline edit | src/inline/inlineEdit.ts; src/review; docs/live-A-exact-edits.json | Task A: show the editor diff and accept/reject individual hunks. | Passed real-provider native host: scoped reviewed edit and independent false/true/docstring checks; video excluded by user. |
| A2 | 10 | Agent mode | src/panel/ChatPanel.ts; src/agent/controller.ts; docs/live-B-verified.json | Task B: discover and edit at least three files from the filename-free request. | Incomplete: evaluated live on real Groq qwen-3-8-27b; 11 tool calls executed; ended without proposals before host timeout; checkout clean; video excluded by user. |
| A3 | 10 | Streaming and cancellation | src/forge/turnRunner.ts; src/agent/controller.ts; test/cancel.test.ts | Stream text and Stop; show responsive UI and consistent files. | Automated tests pass; video excluded by user. |
| B1 | 15 | Context assembly | src/context; test/context.test.ts; docs/live-B-verified.json | Task B: show selected paths/reasons and the context budget. | Budget/retrieval tests pass; live context selects four items within 991/1000 estimated tokens. |
| B2 | 10 | Diff safety | src/review; src/workspace/vscodeApi.ts; docs/vsix-final-native-results.json | Accept/reject hunks, apply, and Undo on screen. | Installed native tests pass; video excluded by user. |
| B3 | 10 | Resilience | src/agent/resilience.ts; docs/live-C-official-recheck.json; docs/live-reset-sessions.json; docs/live-reset-workspaces.json | Task C: repeat the Task A request against a failed provider and show unchanged git status. | Exact inline Task C passed in the real native-host harness: unreachable primary, two retries, fresh fallback, rejected proposals, clean checkout; video excluded by user. |
| B4 | 10 | TrueForge integration depth | src/mcp; src/forge; agents; test/contract.test.ts | Show MCP approval and an observed context-engineering feature in the session. | Wire/MCP tests pass. Subagent/compaction flags alone do not establish top-anchor behavior. |
| C1 | 10 | Video | scripts/demo.md | A, B, C in order, visible checks and the B session, within four minutes. | Excluded by user; no recording or video credit claimed. |
| C2 | 15 | Write-up | docs/WRITEUP.md | Submit a 1–3 page PDF with eight ordered sections and timestamped scorecard. | Three-page PDF prepared with supplied team details; video excluded by user. |

The nine criteria total 100 points: A=30, B=45, C=25. Actual behavior must be visible to the judges; tests do not replace the prescribed video. The eligibility gate requires the TrueForge loop and MCP editor tools, local reproducibility, provider independence, committed definitions, and the Task B session in the demo.

Live A now has scoped, independently verified native-host evidence; B was evaluated live and ended incomplete before proposals, preserving a clean checkout. No judge score is asserted. Exact Task C now has separate real-provider native-host evidence; the earlier greeting probe is retained as historical evidence only. Native and controlled tests are supporting evidence. The official source makes the sandbox optional; confirmed commands still have the documented host-permission limitation.

The user excluded the demo video on 29 October. The official video criterion and its weight remain unchanged; no video proof or credit is claimed.
