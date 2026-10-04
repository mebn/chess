import { Chess } from 'chess.js'
import type { Score, SearchResult } from './engine'

/** Engine evaluation of a position, normalized to White's perspective. */
export type PositionEval = {
  fen: string
  score: Score // White's perspective
  bestMove: string | null // UCI
  bestMoveSan: string | null
  pvSan: string[]
  /** Set when the game is over in this position. */
  result?: '1-0' | '0-1' | '1/2-1/2'
}

export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book'

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  best: 'Best move',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  book: 'Opening',
}

export function toWhitePerspective(score: Score, fen: string): Score {
  const blackToMove = fen.split(' ')[1] === 'b'
  return blackToMove ? { type: score.type, value: -score.value } : score
}

/** Score as centipawns, with mates mapped to large values. */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value
  if (score.value === 0) return 0
  return Math.sign(score.value) * (10000 - Math.abs(score.value) * 10)
}

/** Lichess-style winning chances in [-1, 1] for White. */
export function winningChances(score: Score): number {
  if (score.type === 'mate') return score.value === 0 ? 0 : Math.sign(score.value)
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1
}

export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#'
    return `${score.value > 0 ? '' : '-'}M${Math.abs(score.value)}`
  }
  const pawns = Math.round(score.value / 10) / 10
  if (pawns === 0) return '0.0'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

/** Convert a list of UCI moves to SAN, starting from fen. Stops at the first illegal move. */
export function uciLineToSan(fen: string, uci: string[], max = 8): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const m of uci.slice(0, max)) {
    try {
      const move = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
      out.push(move.san)
    } catch {
      break
    }
  }
  return out
}

export function buildPositionEval(fen: string, result: SearchResult): PositionEval {
  const top = result.lines[0]
  const chess = new Chess(fen)
  const score: Score = top ? toWhitePerspective(top.score, fen) : { type: 'cp', value: 0 }
  const pvSan = top ? uciLineToSan(fen, top.pv) : []
  const evaluation: PositionEval = { fen, score, bestMove: result.bestMove, bestMoveSan: pvSan[0] ?? null, pvSan }
  if (chess.isCheckmate()) evaluation.result = chess.turn() === 'w' ? '0-1' : '1-0'
  else if (chess.isGameOver()) evaluation.result = '1/2-1/2'
  return evaluation
}

/**
 * Classify a move by how much it dropped the mover's winning chances,
 * comparing the eval before the move with the eval after it.
 */
export function classifyMove(
  before: PositionEval,
  after: PositionEval,
  moverColor: 'w' | 'b',
  playedUci: string,
  afterIsCheckmate: boolean,
  ply: number,
): Classification {
  if (afterIsCheckmate) return 'best'
  if (before.bestMove && playedUci === before.bestMove) return 'best'
  const sign = moverColor === 'w' ? 1 : -1
  const drop = sign * (winningChances(before.score) - winningChances(after.score))
  if (ply < 8 && drop < 0.05) return 'book'
  if (drop >= 0.3) return 'blunder'
  if (drop >= 0.2) return 'mistake'
  if (drop >= 0.1) return 'inaccuracy'
  if (drop >= 0.03) return 'good'
  return 'excellent'
}
