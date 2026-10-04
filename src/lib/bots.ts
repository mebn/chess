import { Chess } from 'chess.js'
import type { Engine } from './engine'
import { scoreToCp } from './analysis'

export type Bot = {
  id: string
  name: string
  rating: number
  description: string
  /** Stockfish strength limiting (only valid for ratings >= 1320). */
  uciElo?: number
  /** For weak bots: search depth, candidate lines and how loosely they pick among them. */
  depth?: number
  multiPV?: number
  temperature?: number // centipawns; higher means more random among candidates
  randomMoveChance?: number
  movetime?: number
}

export const BOTS: Bot[] = [
  { id: 'pawn', name: 'Pawn', rating: 400, description: 'Just learned how the pieces move. Hangs pieces often.', depth: 1, multiPV: 10, temperature: 300, randomMoveChance: 0.3 },
  { id: 'knight', name: 'Knight', rating: 700, description: 'Knows the basics but misses simple tactics.', depth: 2, multiPV: 8, temperature: 180, randomMoveChance: 0.15 },
  { id: 'bishop', name: 'Bishop', rating: 1000, description: 'Develops pieces and spots one-move threats.', depth: 4, multiPV: 5, temperature: 90, randomMoveChance: 0.05 },
  { id: 'rook', name: 'Rook', rating: 1350, description: 'A solid casual player. Punishes loose pieces.', uciElo: 1350, movetime: 600 },
  { id: 'queen', name: 'Queen', rating: 1600, description: 'Club level. Plays with a plan.', uciElo: 1600, movetime: 700 },
  { id: 'king', name: 'King', rating: 1900, description: 'Strong club player. Few free gifts.', uciElo: 1900, movetime: 800 },
  { id: 'master', name: 'Master', rating: 2200, description: 'Master strength. Very accurate.', uciElo: 2200, movetime: 1000 },
  { id: 'gm', name: 'Grandmaster', rating: 2600, description: 'Grandmaster strength.', uciElo: 2600, movetime: 1200 },
  { id: 'stockfish', name: 'Stockfish', rating: 3200, description: 'Full strength engine. Good luck.', movetime: 1500 },
]

export const DEFAULT_BOT_ID = 'bishop'

export function getBot(id: string): Bot {
  return BOTS.find((b) => b.id === id) ?? BOTS.find((b) => b.id === DEFAULT_BOT_ID)!
}

/** Pick the bot's move in UCI notation. */
export async function pickBotMove(engine: Engine, fen: string, bot: Bot): Promise<string | null> {
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  if (legal.length === 0) return null

  if (bot.uciElo || !bot.depth) {
    const result = await engine.search(fen, {
      movetime: bot.movetime ?? 1000,
      setOptions: bot.uciElo
        ? { UCI_LimitStrength: true, UCI_Elo: bot.uciElo, 'Skill Level': 20 }
        : { UCI_LimitStrength: false, 'Skill Level': 20 },
    })
    return result.bestMove
  }

  // Weak bots: occasionally play a random legal move, otherwise sample among
  // the engine's top candidates, weighted by how good they are.
  if (Math.random() < (bot.randomMoveChance ?? 0)) {
    const m = legal[Math.floor(Math.random() * legal.length)]
    return m.from + m.to + (m.promotion ?? '')
  }

  const result = await engine.search(fen, {
    depth: bot.depth,
    multiPV: bot.multiPV ?? 1,
    setOptions: { UCI_LimitStrength: false, 'Skill Level': 20 },
  })
  const candidates = result.lines.filter((l) => l.pv.length > 0)
  if (candidates.length === 0) return result.bestMove

  const best = scoreToCp(candidates[0].score)
  const t = bot.temperature ?? 100
  const weights = candidates.map((l) => Math.exp((scoreToCp(l.score) - best) / t))
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i].pv[0]
  }
  return candidates[0].pv[0]
}
