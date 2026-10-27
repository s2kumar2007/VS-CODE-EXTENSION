# Forge Agent

A VS Code extension for agentic coding. **The agent loop runs on [TrueForge](https://github.com/truefoundry/trueforge)**; this extension is only a client (TS SDK `@truefoundry/trueforge-sdk`) plus an MCP server that exposes the editor to the agent as tools. It never calls a model provider directly and contains no API keys.

## Prerequisites
- Node >= 22.14, VS Code >= 1.90, git, Python (for the Flask demo)
- A Gemini API key (primary) and a Groq API key (fallback), entered **in TrueForge only**

## 1. Start TrueForge
```bash
npx @truefoundry/trueforge@latest      # http://localhost:8790, no auth
```

## 2. Configure models in TrueForge (Settings -> Models)
| Role | Provider | Notes |
|---|---|---|
| Primary | catalog provider `google-gemini` | model e.g. `gemini-2.5-flash` |
| Fallback | `custom` (OpenAI-compatible), **name it `groq`** | base URL `https://api.groq.com/openai/v1`, model e.g. `llama-3.3-70b-versatile` |

Agents reference models as `provider/model` (`google-gemini/gemini-2.5-flash`, `groq/llama-3.3-70b-versatile`). If your model ids differ, edit `agents/*.json`. See `config.example.json` for the shape (placeholders only).

## 3. Agent definitions
`agents/forge-agent.json`, `forge-inline.json`, `forge-agent-fallback.json` are committed. On activation the extension registers its MCP server in TrueForge (`PUT /api/v1/settings/mcp-servers`, name `forge-editor`, random bearer token) and creates/updates these agents by name. Nothing to import manually.

## 4. Run the extension
```bash
npm install
npm run build
code .          # then press F5 ("Run Extension"); in the new window open the Flask folder
```
Tests: `npm test` (38 tests, no VS Code needed). Typecheck: `npm run typecheck`.

## 5. Flask test project
```bash
git clone https://github.com/pallets/flask && cd flask
git checkout 3.1.3          # expected commit 22d92470 (check: git rev-parse --short HEAD)
python -m venv .venv && . .venv/bin/activate && pip install -e . pytest
```

## Usage
- **Forge: Open Agent Panel** - agent mode. Type a request; use `@file:path` / `@symbol:name` (autocomplete after `@`). A "Context used" section lists files/slices, reasons and token counts. Stop cancels.
- **Ctrl+K Ctrl+I** (Cmd on Mac) with a selection - inline edit via the `forge-inline` agent.
- Every `propose_write` opens a diff plus a hunk list (Accept/Reject per hunk, Accept all/Reject all, Confirm). Only accepted hunks are applied (one undo step). `run_command` asks for confirmation.
- **Forge: Undo last applied change** (native Ctrl+Z also works).

## Settings
| Setting | Default |
|---|---|
| `forge.baseUrl` | `http://localhost:8790` |
| `forge.agentName` | `forge-agent` |
| `forge.fallbackAgentName` | `forge-agent-fallback` |
| `forge.contextBudget` | `6000` tokens (~4 chars/token) |

## Safety model
No write reaches disk without review: `propose_write` is gated by TrueForge (`require_approval_for_tools`), and the MCP handler refuses unless the review UI stored a decision for exactly that (path, content). A cancelled or failed run therefore changes nothing.

License: MIT
