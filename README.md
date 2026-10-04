# Chess Coach

A local chess trainer. You play White or Black against bots from 400 to 3200, and a coach explains every full move.

- **Bots**: Stockfish 19 (WASM, runs in the browser). Bots below 1320 sample weaker candidate moves; stronger bots use Stockfish's `UCI_Elo` limiter.
- **Analysis**: a second Stockfish instance evaluates every position and labels each move (best, excellent, good, inaccuracy, mistake, blunder).
- **Coach**: a CLI agent on your machine turns the engine data into plain-language explanations, using that agent's own login (no API keys). Choose it under Settings > Coach settings:
  - **Claude Code** (default, via the Claude Agent SDK, `claude-sonnet-5-5`)
  - **Codex** (`codex exec`)
  - **Custom**: any shell command that reads the prompt on stdin and prints the answer, for example `ollama run llama3`. `{model}` and `{effort}` in the command are replaced with the values from the dialog.

## Run

```bash
npm install
npm run dev
```

You need the agent you pick installed and logged in (run `claude` or `codex` once). Model and thinking level are set in Coach settings, and the Test button there checks that the agent answers.

## Using it

- Drag pieces or click a piece and then its target square. Pawns always promote to a queen.
- **Hint**: the first press highlights the piece to move. The second press shows the move.
- **Undo**: takes back your last move and the bot's reply.
- Pick White or Black in the New game dialog.
- The Settings menu next to New game has the dark mode toggle and Coach settings.
- Click any move in the list (or use the left and right arrow keys) to review it. For inaccuracies, mistakes and blunders, a red arrow shows what was played and a green arrow shows the engine's move.
- **Auto** explains each full move (White and Black together) once both sides have played it. Turn it off to save Claude usage, then press "Explain this move" when you want one.
- **Ask your coach** answers questions about the current position. **Game review** summarizes the key moments and what to practice.

The game is saved in localStorage, so a refresh keeps it.

## Structure

- `server/coach.ts`: Vite plugin that adds `POST /api/coach` (runs the chosen agent and streams its reply) and `GET /api/agents`
- `src/lib/settings.ts`: coach settings (agent, model, thinking level)
- `src/lib/engine.ts`: UCI wrapper around the Stockfish web worker
- `src/lib/bots.ts`: bot definitions and move selection
- `src/lib/analysis.ts`: evaluation math and move classification
- `src/lib/coach.ts`: prompts sent to the coach
- `src/hooks/useGame.ts`: game state, engines, explanations
