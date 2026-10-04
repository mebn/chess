import { useEffect, useState } from 'react'
import { DEFAULT_POSITION } from 'chess.js'
import { Board } from './components/Board'
import { BotPicker } from './components/BotPicker'
import { CoachSettingsDialog } from './components/CoachSettingsDialog'
import { SettingsMenu } from './components/SettingsMenu'
import { describeSettings, loadSettings, saveSettings, type CoachSettings } from './lib/settings'
import { AnalysisCard, AskCard, ReviewCard } from './components/CoachPanel'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { explanationKey, fullMove, useGame } from './hooks/useGame'
import type { Color } from './lib/coach'

const BEST_ARROW = 'rgba(21, 120, 27, 0.8)'
const PLAYED_ARROW = 'rgba(200, 60, 40, 0.75)'
const THEME_KEY = 'chess-coach:theme'

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage unavailable; fall back to the system setting.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const g = useGame()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [coachSettings, setCoachSettings] = useState<CoachSettings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Not critical.
    }
  }, [theme])
  const livePly = g.moves.length
  // null means "follow the live game"; otherwise the ply being reviewed.
  // A review is tied to the game length it started at, so new moves or undo jump back to live.
  const [review, setReview] = useState<{ ply: number; at: number } | null>(null)
  const viewPly = review && review.at === livePly ? review.ply : null
  const setViewPly = (p: number | null) => setReview(p === null ? null : { ply: p, at: livePly })
  const ply = viewPly ?? livePly
  const viewing = viewPly !== null && viewPly !== livePly
  const shownMove = ply > 0 ? g.moves[ply - 1] : undefined
  const shownFen = shownMove ? shownMove.fenAfter : DEFAULT_POSITION

  // Arrow keys step through the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') setViewPly(Math.max(0, ply - 1))
      if (e.key === 'ArrowRight') setViewPly(ply + 1 >= livePly ? null : ply + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Hint: first press highlights the piece, second press shows the full move.
  const liveEval = g.evals[g.fen]
  const hintActive = !viewing && g.hint?.fen === g.fen
  const hintMove = hintActive ? liveEval?.bestMove : undefined
  const hintSquare = hintMove ? hintMove.slice(0, 2) : undefined

  const arrows = []
  if (hintMove && g.hint?.level === 2) arrows.push({ startSquare: hintMove.slice(0, 2), endSquare: hintMove.slice(2, 4), color: BEST_ARROW })
  if (viewing && shownMove) {
    const best = g.evals[shownMove.fenBefore]?.bestMove
    const c = g.classifications[shownMove.ply]
    if (best && best !== shownMove.uci && (c === 'inaccuracy' || c === 'mistake' || c === 'blunder')) {
      arrows.push({ startSquare: shownMove.uci.slice(0, 2), endSquare: shownMove.uci.slice(2, 4), color: PLAYED_ARROW })
      arrows.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: BEST_ARROW })
    }
  }

  // The analysis card shows the full move containing the viewed ply. While playing live,
  // keep showing the last complete full move until the current one is finished.
  let moveNumber = Math.ceil(ply / 2)
  if (!viewing && ply % 2 === 1 && !g.gameOver && moveNumber > 1) moveNumber -= 1
  const pairPlies = moveNumber > 0 ? fullMove(g.moves, moveNumber) : []
  const pairViews = pairPlies.map((m) => ({
    move: m,
    before: g.evals[m.fenBefore],
    after: g.evals[m.fenAfter],
    classification: g.classifications[m.ply],
  }))
  const pairComplete = pairPlies.length === 2 || g.gameOver

  const myTurn = g.game.turn() === g.playerColor
  const status = (() => {
    if (g.engineError) return `Engine error: ${g.engineError}`
    if (g.result) return g.result.text
    if (viewing) return `Reviewing move ${Math.ceil(ply / 2)}. Use ← → or click "Back to game".`
    if (g.botThinking) return `${g.bot.name} is thinking…`
    if (hintActive && !liveEval) return 'Looking for a hint…'
    if (hintActive && g.hint?.level === 1) return 'Hint: move the highlighted piece. Press Hint again to see the move.'
    if (hintActive && g.hint?.level === 2 && liveEval?.bestMoveSan) return `Hint: ${liveEval.bestMoveSan}`
    return g.game.inCheck() ? 'You are in check' : 'Your move'
  })()

  const startNewGame = (botId: string, color: Color) => {
    g.newGame(botId, color)
    setPickerOpen(false)
  }

  const saveCoachSettings = (s: CoachSettings) => {
    saveSettings(s)
    setCoachSettings(s)
    setSettingsOpen(false)
  }

  return (
    <div className="app">
      <div className="corner">
        <SettingsMenu
          dark={theme === 'dark'}
          onToggleDark={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onOpenCoachSettings={() => setSettingsOpen(true)}
          coachSummary={describeSettings(coachSettings)}
        />
        <button className="btn" onClick={() => setPickerOpen(true)}>New game</button>
      </div>

      <main className="layout">
        <aside className="left-col">
          <AnalysisCard
            moveNumber={moveNumber}
            plies={pairViews}
            playerColor={g.playerColor}
            explanation={pairPlies.length ? g.explanations[explanationKey(moveNumber, pairPlies)] : undefined}
            canExplain={g.canExplain(moveNumber)}
            waitingForReply={!pairComplete}
            onExplain={() => g.explain(moveNumber)}
            autoExplain={g.autoExplain}
            onToggleAuto={g.setAutoExplain}
          />
        </aside>

        <section className="board-col">
          <div className="player">
            <span className="avatar bot">{g.bot.name[0]}</span>
            <span className="player-name">{g.bot.name}</span>
            <span className="player-rating">{g.bot.rating}</span>
            {g.botThinking && <span className="thinking-dot" />}
          </div>

          <div className="board-row">
            <EvalBar evaluation={g.evals[shownFen]} flipped={g.playerColor === 'b'} />
            <div className="board-wrap">
              <Board
                fen={shownFen}
                orientation={g.playerColor === 'w' ? 'white' : 'black'}
                interactive={!viewing && !g.gameOver && !g.botThinking && myTurn}
                lastMove={shownMove ? { from: shownMove.uci.slice(0, 2), to: shownMove.uci.slice(2, 4) } : undefined}
                hintSquare={hintSquare}
                arrows={arrows}
                onMove={g.playerMove}
              />
            </div>
          </div>

          <div className="player">
            <span className="avatar you">Y</span>
            <span className="player-name">You</span>
            <span className="player-rating">{g.playerColor === 'w' ? 'White' : 'Black'}</span>
          </div>

          <div className="moves-strip">
            <MoveList moves={g.moves} classifications={g.classifications} activePly={ply} onSelect={(p) => setViewPly(p === livePly ? null : p)} />
          </div>

          <div className="controls">
            {viewing ? (
              <button className="btn" onClick={() => setViewPly(null)}>Back to game</button>
            ) : (
              <>
                <button className="btn" onClick={g.undo} disabled={g.moves.length === 0}>Undo</button>
                <button className="btn" onClick={g.requestHint} disabled={g.gameOver || g.botThinking || !myTurn}>Hint</button>
                <button className="btn subtle" onClick={g.resign} disabled={g.gameOver || g.moves.length === 0}>Resign</button>
              </>
            )}
          </div>
          <p className={`status ${g.result ? 'over' : ''}`}>{status}</p>
        </section>

        <aside className="right-col">
          <AskCard thread={g.thread} onAsk={g.ask} agentLabel={describeSettings(coachSettings)} />
          {g.moves.length >= 2 && <ReviewCard review={g.review} onReview={g.requestReview} />}
        </aside>
      </main>

      {settingsOpen && (
        <CoachSettingsDialog settings={coachSettings} onSave={saveCoachSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {pickerOpen && (
        <BotPicker currentBotId={g.botId} currentColor={g.playerColor} onPick={startNewGame} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
