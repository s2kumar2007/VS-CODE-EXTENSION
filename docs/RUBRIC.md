# Official rubric evidence checklist

Source: [Techfest Forge-a-thon problem statement](https://techfest.org/media/compiProbStatement/TrueFoundry_Forge-a-thon_compressed_UvvRJ9C.pdf), pages 7–9. The competition API links this PDF. SHA-256: 5feeee151edc6bf098743e6eaf5e87b8996adc7bc13abbe1fc8409074d6ddb49. Definitions and weights are now sourced; this replaces the earlier provisional mapping. Evidence status is self-reported, not an awarded score.

| ID | Maximum | Criterion | Evidence | Demo proof | Current status |
|---|---:|---|---|---|---|
| A1 | 10 | Inline edit | src/inline/inlineEdit.ts; src/review/ReviewPanel.ts | Task A: show the editor diff and accept/reject individual hunks. | Live A blocked by daily quota; native mechanisms pass. |
| A2 | 10 | Agent mode | src/panel/ChatPanel.ts; src/agent/controller.ts | Task B: discover and edit at least three files from the filename-free request. | Live B blocked by daily quota. |
| A3 | 10 | Streaming and cancellation | src/forge/turnRunner.ts; src/agent/controller.ts; test/cancel.test.ts | Stream text and Stop; show responsive UI and consistent files. | Automated tests pass; required video not recorded. |
| B1 | 15 | Context assembly | src/context; test/context.test.ts; docs/live-B-retry-aware.json | Task B: show selected paths/reasons and the context budget. | Budget/retrieval tests pass; live trace selects 22 items within 6000 estimated tokens. |
| B2 | 10 | Diff safety | src/review; src/workspace/vscodeApi.ts; docs/vsix-activation-native-results.json | Accept/reject hunks, apply, and Undo on screen. | Installed native tests pass; video not recorded. |
| B3 | 10 | Resilience | src/agent/resilience.ts; docs/live-C.json; docs/live-C-sessions.json | Task C: repeat the Task A request against a failed provider and show unchanged git status. | Earlier greeting probe demonstrates fallback only; exact Task C rerun pending. |
| B4 | 10 | TrueForge integration depth | src/mcp; src/forge; agents; test/contract.test.ts | Show MCP approval and an observed context-engineering feature in the session. | Wire/MCP tests pass. Subagent/compaction flags alone do not establish top-anchor behavior. |
| C1 | 10 | Video | scripts/demo.md | A, B, C in order, visible checks and the B session, within four minutes. | Video not supplied; no credit claimed. |
| C2 | 15 | Write-up | docs/WRITEUP.md | Submit a 1–3 page PDF with eight ordered sections and timestamped scorecard. | Markdown draft exists; team institution, final PDF and video timestamps remain unconfirmed. |

The nine criteria total 100 points: A=30, B=45, C=25. Actual behavior must be visible to the judges; tests do not replace the prescribed video. The eligibility gate requires the TrueForge loop and MCP editor tools, local reproducibility, provider independence, committed definitions, and the Task B session in the demo.

No live A/B success or score is asserted. Native and controlled tests are supporting evidence. The earlier successful greeting-based failure probe must not be presented as the exact fixed Task C. The official source makes the sandbox optional; confirmed commands still have the documented host-permission limitation.
