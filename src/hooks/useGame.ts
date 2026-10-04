import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Engine } from '../lib/engine'
import { buildPositionEval, classifyMove, type Classification, type PositionEval } from '../lib/analysis'
import { DEFAULT_BOT_ID, getBot, pickBotMove } from '../lib/bots'
import { askPrompt, explainFullMovePrompt, reviewPrompt, streamCoach, type Color, type MoveRecord } from '../lib/coach'

export type CoachText = { text: string; status: 'loading' | 'done' | 'error' }
export type ThreadEntry = { question: string; answer: string; status: CoachText['status'] }
export type Hint = { fen: string; level: 1 | 2 }

const STORAGE_KEY = 'chess-coach:v2'
const ANALYSIS_DEPTH = 14
const MIN_BOT_DELAY_MS = 450

type Saved = {
  botId: string
  playerColor: Color
  moves: MoveRecord[]
  evals: Record<string, PositionEval>
  explanations: Record<string, CoachText>
  thread: ThreadEntry[]
  review: CoachText | null
  resigned: boolean
}

function loadSaved(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const saved = JSON.parse(raw) as Partial<Saved>
    // Anything still streaming when the page closed is incomplete.
    const fix = (c: CoachText): CoachText => (c.status === 'loading' ? { ...c, status: 'error' } : c)
    if (saved.explanations) for (const k in saved.explanations) saved.explanations[k] = fix(saved.explanations[k])
    if (saved.review) saved.review = fix(saved.review)
    if (saved.thread) saved.thread = saved.thread.map((t) => (t.status === 'loading' ? { ...t, status: 'error' } : t))
    return saved
  } catch {
    return {}
  }
}

/** The White and Black plies that make up full move `n` (Black may be missing). */
export function fullMove(moves: MoveRecord[], n: number): MoveRecord[] {
  return moves.slice(2 * n - 2, 2 * n)
}

/** Explanations are per full move, keyed by move number and the position after it. */
export const explanationKey = (n: number, plies: MoveRecord[]) => `${n}|${plies[plies.length - 1]?.fenAfter ?? ''}`

export function useGame() {
  const saved = useMemo(loadSaved, [])
  const [botId, setBotId] = useState(saved.botId ?? DEFAULT_BOT_ID)
  const [playerColor, setPlayerColor] = useState<Color>(saved.playerColor ?? 'w')
  const [moves, setMoves] = useState<MoveRecord[]>(saved.moves ?? [])
  const [evals, setEvals] = useState<Record<string, PositionEval>>(saved.evals ?? {})
  const [explanations, setExplanations] = useState<Record<string, CoachText>>(saved.explanations ?? {})
  const [thread, setThread] = useState<ThreadEntry[]>(saved.thread ?? [])
  const [review, setReview] = useState<CoachText | null>(saved.review ?? null)
  const [resigned, setResigned] = useState(saved.resigned ?? false)
  const [redoStack, setRedoStack] = useState<MoveRecord[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [botThinking, setBotThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)

  const bot = getBot(botId)
  const botEngine = useRef<Engine | null>(null)
  const analyst = useRef<Engine | null>(null)
  const pendingEvals = useRef(new Set<string>())
  const requested = useRef(new Set<string>(Object.keys(saved.explanations ?? {})))
  const controllers = useRef(new Map<string, AbortController>())

  const fen = moves.length ? moves[moves.length - 1].fenAfter : DEFAULT_POSITION
  const game = useMemo(() => new Chess(fen), [fen])
  const gameOver = resigned || game.isGameOver()

  const result = useMemo(() => {
    if (resigned) return { score: playerColor === 'w' ? '0-1' : '1-0', text: 'You resigned' }
    if (game.isCheckmate()) {
      const score = game.turn() === 'w' ? '0-1' : '1-0'
      return { score, text: game.turn() === playerColor ? 'Checkmate. The bot wins.' : 'Checkmate. You win!' }
    }
    if (game.isStalemate()) return { score: '1/2-1/2', text: 'Draw by stalemate' }
    if (game.isThreefoldRepetition()) return { score: '1/2-1/2', text: 'Draw by repetition' }
    if (game.isInsufficientMaterial()) return { score: '1/2-1/2', text: 'Draw by insufficient material' }
    if (game.isDraw()) return { score: '1/2-1/2', text: 'Draw by the fifty-move rule' }
    return null
  }, [game, playerColor, resigned])

  // Engines live for the lifetime of the component.
  useEffect(() => {
    try {
      botEngine.current = new Engine()
      analyst.current = new Engine()
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e))
    }
    const pending = pendingEvals.current
    return () => {
      botEngine.current?.terminate()
      analyst.current?.terminate()
      botEngine.current = null
      analyst.current = null
      pending.clear()
    }
  }, [])

  // Persist the game so a refresh does not lose it.
  useEffect(() => {
    const data: Saved = { botId, playerColor, moves, evals, explanations, thread, review, resigned }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage full or unavailable; the game still works without it.
    }
  }, [botId, playerColor, moves, evals, explanations, thread, review, resigned])

  // Analyse every position in the game that we have not evaluated yet.
  useEffect(() => {
    const engine = analyst.current
    if (!engine) return
    const fens = [DEFAULT_POSITION, ...moves.map((m) => m.fenAfter)]
    for (const f of fens) {
      if (evals[f] || pendingEvals.current.has(f)) continue
      pendingEvals.current.add(f)
      engine
        .search(f, { depth: ANALYSIS_DEPTH })
        .then((r) => setEvals((prev) => ({ ...prev, [f]: buildPositionEval(f, r) })))
        .catch(() => undefined)
        .finally(() => pendingEvals.current.delete(f))
    }
  }, [moves, evals])

  const applyMove = useCallback((from: string, to: string, promotion?: string, base: MoveRecord[] = moves): boolean => {
    const baseFen = base.length ? base[base.length - 1].fenAfter : DEFAULT_POSITION
    const chess = new Chess(baseFen)
    let move
    try {
      move = chess.move({ from, to, promotion: promotion ?? 'q' })
    } catch {
      return false
    }
    const record: MoveRecord = {
      ply: base.length + 1,
      color: move.color,
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ''),
      fenBefore: baseFen,
      fenAfter: chess.fen(),
    }
    setMoves([...base, record])
    setRedoStack([])
    setHint(null)
    return true
  }, [moves])

  /** Called by the board when the player tries a move. `atPly` plays from an earlier position, dropping the moves after it. */
  const playerMove = useCallback((from: string, to: string, atPly?: number): boolean => {
    if (botThinking) return false
    if (atPly === undefined || atPly >= moves.length) {
      if (gameOver || game.turn() !== playerColor) return false
      return applyMove(from, to)
    }
    const base = moves.slice(0, atPly)
    const chess = new Chess(base.length ? base[base.length - 1].fenAfter : DEFAULT_POSITION)
    if (chess.isGameOver() || chess.turn() !== playerColor) return false
    if (!applyMove(from, to, undefined, base)) return false
    abortFrom(atPly)
    setResigned(false)
    setReview(null)
    return true
  }, [applyMove, botThinking, game, gameOver, moves, playerColor])

  // The bot moves whenever it is its turn.
  useEffect(() => {
    const engine = botEngine.current
    if (!engine || gameOver || game.turn() === playerColor) return
    let cancelled = false
    setBotThinking(true)
    const started = Date.now()
    pickBotMove(engine, fen, bot)
      .then(async (uci) => {
        const wait = MIN_BOT_DELAY_MS - (Date.now() - started)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        if (cancelled || !uci) return
        applyMove(uci.slice(0, 2), uci.slice(2, 4), uci[4])
      })
      .catch((e) => setEngineError(String(e)))
      .finally(() => {
        if (!cancelled) setBotThinking(false)
      })
    return () => {
      cancelled = true
      engine.stop()
      setBotThinking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, gameOver, playerColor])

  const classifications = useMemo(() => {
    const out: Record<number, Classification> = {}
    for (const m of moves) {
      const before = evals[m.fenBefore]
      const after = evals[m.fenAfter]
      if (!before || !after) continue
      out[m.ply] = classifyMove(before, after, m.color, m.uci, new Chess(m.fenAfter).isCheckmate(), m.ply)
    }
    return out
  }, [moves, evals])

  const explain = useCallback((n: number) => {
    const plies = fullMove(moves, n)
    if (plies.length === 0) return
    const key = explanationKey(n, plies)
    controllers.current.get(key)?.abort()
    const controller = new AbortController()
    controllers.current.set(key, controller)
    requested.current.add(key)
    const prompt = explainFullMovePrompt({
      plies: plies.map((m) => ({ move: m, before: evals[m.fenBefore], after: evals[m.fenAfter], classification: classifications[m.ply] })),
      history: moves,
      bot,
      playerColor,
    })
    setExplanations((prev) => ({ ...prev, [key]: { text: '', status: 'loading' } }))
    streamCoach(prompt, (text) => setExplanations((prev) => ({ ...prev, [key]: { text, status: 'loading' } })), controller.signal)
      .then((text) => setExplanations((prev) => ({ ...prev, [key]: { text, status: 'done' } })))
      .catch((e) => {
        if (controller.signal.aborted) return
        setExplanations((prev) => ({ ...prev, [key]: { text: String(e.message ?? e), status: 'error' } }))
      })
      .finally(() => controllers.current.delete(key))
  }, [bot, classifications, evals, moves, playerColor])

  /** A full move can be explained once both sides have played it (or the game ended) and the engine has evaluated it. */
  const canExplain = useCallback((n: number) => {
    const plies = fullMove(moves, n)
    if (plies.length === 0) return false
    const complete = plies.length === 2 || (gameOver && 2 * n - 1 === moves.length)
    return complete && plies.every((m) => evals[m.fenBefore] && evals[m.fenAfter])
  }, [evals, gameOver, moves])

  // Auto-explain each full move once White and Black have both played it.
  useEffect(() => {
    if (moves.length === 0) return
    const last = Math.ceil(moves.length / 2)
    for (const n of [last - 1, last]) {
      if (n < 1 || !canExplain(n)) continue
      if (requested.current.has(explanationKey(n, fullMove(moves, n)))) continue
      explain(n)
    }
  }, [moves, canExplain, explain])

  // Cancel explanations still streaming for full moves that are no longer complete
  // after keeping `ply` plies, so replaying them later starts a fresh explanation.
  const abortFrom = (ply: number) => {
    const aborted: string[] = []
    for (const [key, c] of controllers.current) {
      if (2 * Number(key.split('|')[0]) > ply) {
        c.abort()
        controllers.current.delete(key)
        requested.current.delete(key)
        aborted.push(key)
      }
    }
    if (aborted.length) {
      setExplanations((prev) => {
        const next = { ...prev }
        for (const k of aborted) delete next[k]
        return next
      })
    }
  }

  const undo = useCallback(() => {
    if (moves.length === 0) return
    let n: number
    if (resigned) n = 0
    else if (botThinking) n = 1
    else n = moves[moves.length - 1].color === playerColor ? 1 : 2
    // Never undo the bot's opening move when you play Black; it would just replay it.
    const keep = Math.max(playerColor === 'b' ? 1 : 0, moves.length - n)
    if (keep >= moves.length && !resigned) return
    abortFrom(keep)
    setResigned(false)
    setRedoStack((r) => [...moves.slice(keep), ...r])
    setMoves(moves.slice(0, keep))
    setHint(null)
    setReview(null)
  }, [botThinking, moves, playerColor, resigned])

  const redo = useCallback(() => {
    if (redoStack.length === 0 || botThinking) return
    // Mirror undo: bring back your move together with the bot's reply.
    const n = redoStack[0].color === playerColor && redoStack.length > 1 ? 2 : 1
    setMoves([...moves, ...redoStack.slice(0, n)])
    setRedoStack(redoStack.slice(n))
    setHint(null)
  }, [botThinking, moves, playerColor, redoStack])

  const newGame = useCallback((nextBotId?: string, color?: Color) => {
    for (const c of controllers.current.values()) c.abort()
    controllers.current.clear()
    requested.current.clear()
    if (nextBotId) setBotId(nextBotId)
    if (color) setPlayerColor(color)
    setMoves([])
    setRedoStack([])
    setExplanations({})
    setThread([])
    setReview(null)
    setHint(null)
    setResigned(false)
  }, [])

  const requestHint = useCallback(() => {
    if (gameOver || game.turn() !== playerColor) return
    setHint((h) => (h && h.fen === fen ? { fen, level: 2 } : { fen, level: 1 }))
  }, [fen, game, gameOver, playerColor])

  const ask = useCallback((question: string) => {
    const index = thread.length
    const prompt = askPrompt({ question, history: moves, fen, bot, playerColor, current: evals[fen], thread: thread.filter((t) => t.status === 'done') })
    setThread((prev) => [...prev, { question, answer: '', status: 'loading' }])
    const update = (answer: string, status: CoachText['status']) =>
      setThread((prev) => prev.map((t, i) => (i === index ? { ...t, answer, status } : t)))
    streamCoach(prompt, (text) => update(text, 'loading'))
      .then((text) => update(text, 'done'))
      .catch((e) => update(String(e.message ?? e), 'error'))
  }, [bot, evals, fen, moves, playerColor, thread])

  const requestReview = useCallback(() => {
    const prompt = reviewPrompt({ history: moves, bot, playerColor, evals, classifications, result: result?.text ?? 'game still in progress' })
    setReview({ text: '', status: 'loading' })
    streamCoach(prompt, (text) => setReview({ text, status: 'loading' }))
      .then((text) => setReview({ text, status: 'done' }))
      .catch((e) => setReview({ text: String(e.message ?? e), status: 'error' }))
  }, [bot, classifications, evals, moves, playerColor, result])

  return {
    bot, botId, playerColor, moves, fen, game, evals, classifications, explanations, thread, review, hint,
    botThinking, gameOver, result, engineError,
    playerMove, undo, redo, canRedo: redoStack.length > 0 && !botThinking, newGame, requestHint, explain, canExplain, ask, requestReview,
    resign: () => setResigned(true),
  }
}

export type GameState = ReturnType<typeof useGame>
