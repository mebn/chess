import { useEffect, useState } from 'react'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { Board } from './components/Board'
import { BotPicker } from './components/BotPicker'
import { SettingsDialog } from './components/SettingsDialog'
import { Key } from './components/Key'
import { Tooltip } from './components/Tooltip'
import { SquareHoverContext } from './lib/squareHover'
import { loadSettings, saveSettings, type CoachSettings } from './lib/settings'
import { AnalysisPanel, CoachTabs } from './components/CoachPanel'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { useHotkeys } from './hooks/useHotkeys'
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
  const [hoverSquare, setHoverSquare] = useState<string | null>(null)

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

  const modalOpen = settingsOpen || pickerOpen
  useHotkeys(
    {
      u: g.undo,
      r: g.canRedo ? g.redo : undefined,
      h: () => !viewing && g.requestHint(),
      x: () => !viewing && g.resign(),
      l: () => setViewPly(null),
      s: () => setSettingsOpen(true),
      n: () => setPickerOpen(true),
    },
    !modalOpen,
  )

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
  const pairExplanation = pairPlies.length ? g.explanations[explanationKey(moveNumber, pairPlies)] : undefined

  const myTurn = g.game.turn() === g.playerColor
  // Looking at an earlier position, you can play on from it when it is your turn there.
  const shownGame = new Chess(shownFen)
  const canPlayHere = viewing ? !shownGame.isGameOver() && shownGame.turn() === g.playerColor : !g.gameOver && myTurn
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
    <SquareHoverContext.Provider value={setHoverSquare}>
    <div className="app">
      <main className="layout">
        <section className="board-col">

          <div className="board-row">
            <EvalBar evaluation={g.evals[shownFen]} flipped={g.playerColor === 'b'} />
            <div className="board-wrap">
              <Board
                fen={shownFen}
                orientation={g.playerColor === 'w' ? 'white' : 'black'}
                interactive={!g.botThinking && canPlayHere}
                lastMove={shownMove ? { from: shownMove.uci.slice(0, 2), to: shownMove.uci.slice(2, 4) } : undefined}
                hintSquare={hintSquare}
                hoverSquare={hoverSquare}
                arrows={arrows}
                onMove={(from, to) => {
                  const ok = g.playerMove(from, to, viewing ? ply : undefined)
                  if (ok) setViewPly(null)
                  return ok
                }}
              />
              {g.result && !viewing && (
                <div className="result-overlay" role="status">
                  <div className="result-card">
                    <div className="result-score">{g.result.score}</div>
                    <div className="result-text">{g.result.text}</div>
                  </div>
                </div>
              )}
            </div>
          </div>


          <div className="moves-strip">
            <MoveList moves={g.moves} classifications={g.classifications} activePly={ply} onSelect={(p) => setViewPly(p === livePly ? null : p)} />
          </div>

          <div className="controls">
            <button className="btn" onClick={g.undo} disabled={g.moves.length === 0}>Undo<Key k="U" /></button>
            <button className="btn" onClick={g.redo} disabled={!g.canRedo}>Redo<Key k="R" /></button>
            {viewing ? (
              <button className="btn" onClick={() => setViewPly(null)}>Back to game<Key k="L" /></button>
            ) : (
              <>
                <button className="btn" onClick={g.requestHint} disabled={g.gameOver || g.botThinking || !myTurn}>Hint<Key k="H" /></button>
                <button className="btn subtle" onClick={g.resign} disabled={g.gameOver || g.moves.length === 0}>Resign<Key k="X" /></button>
              </>
            )}
            <span className="spacer" />
            <button className="btn" onClick={() => setSettingsOpen(true)}>Settings<Key k="S" /></button>
            <button className="btn" onClick={() => setPickerOpen(true)}>New<Key k="N" /></button>
          </div>
        </section>

        <aside className="right-col">
          <CoachTabs
            analysis={
              <AnalysisPanel
                moveNumber={moveNumber}
                plies={pairViews}
                playerColor={g.playerColor}
                explanation={pairExplanation}
                canExplain={g.canExplain(moveNumber)}
                waitingForReply={!pairComplete}
                onExplain={() => g.explain(moveNumber)}
              />
            }
            analysisLoading={pairExplanation?.status === 'loading'}
            thread={g.thread}
            onAsk={g.ask}
            review={g.review}
            canReview={g.moves.length >= 2}
            onReview={g.requestReview}
            hotkeysEnabled={!modalOpen}
            canExplain={g.canExplain(moveNumber) && (!pairExplanation || pairExplanation.status === 'error')}
            onExplain={() => g.explain(moveNumber)}
          />
        </aside>
      </main>

      <Tooltip />
      {settingsOpen && (
        <SettingsDialog
          dark={theme === 'dark'}
          onToggleDark={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          settings={coachSettings}
          onSave={saveCoachSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pickerOpen && (
        <BotPicker currentBotId={g.botId} currentColor={g.playerColor} onPick={startNewGame} onClose={() => setPickerOpen(false)} />
      )}
    </div>
    </SquareHoverContext.Provider>
  )
}
