import { Chess } from 'chess.js'
import type { Bot } from './bots'
import { loadSettings, requestFields, type CoachSettings } from './settings'
import { CLASSIFICATION_LABEL, formatScore, type Classification, type PositionEval } from './analysis'

export type Color = 'w' | 'b'

export type MoveRecord = {
  ply: number // 1-based
  color: Color
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
}

/** Stream text from the local Claude Code coach endpoint. */
export async function streamCoach(
  prompt: string,
  onText: (fullText: string) => void,
  signal?: AbortSignal,
  settings: CoachSettings = loadSettings(),
) {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...requestFields(settings) }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Coach request failed (${res.status})`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  return text
}

export function moveLabel(m: MoveRecord) {
  const n = Math.ceil(m.ply / 2)
  return m.color === 'w' ? `${n}. ${m.san}` : `${n}... ${m.san}`
}

export function pgnOf(moves: MoveRecord[]) {
  return moves.map((m) => (m.color === 'w' ? `${Math.ceil(m.ply / 2)}. ${m.san}` : m.san)).join(' ') || '(no moves yet)'
}

function board(fen: string) {
  return new Chess(fen).ascii()
}

function evalText(e?: PositionEval) {
  if (!e) return 'unknown'
  if (e.result) return e.result === '1/2-1/2' ? 'draw' : `game over (${e.result})`
  return formatScore(e.score)
}

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black')

function intro(bot: Bot, playerColor: Color) {
  return `I am playing ${sideName(playerColor)} against the "${bot.name}" bot (rated about ${bot.rating}), which plays ${sideName(playerColor === 'w' ? 'b' : 'w')}.`
}

type PlyData = {
  move: MoveRecord
  before?: PositionEval
  after?: PositionEval
  classification?: Classification
}

export function explainFullMovePrompt(opts: { plies: PlyData[]; history: MoveRecord[]; bot: Bot; playerColor: Color }) {
  const { plies, history, bot, playerColor } = opts
  const first = plies[0].move
  const last = plies[plies.length - 1].move
  const n = Math.ceil(first.ply / 2)

  const details = plies.map(({ move, before, after, classification }) => {
    const who = move.color === playerColor ? 'me' : 'the bot'
    return `${moveLabel(move)} played by ${who} (${sideName(move.color)}):
- Evaluation before: ${evalText(before)}, after: ${evalText(after)}
- Engine's best move instead: ${before?.bestMoveSan ?? 'unknown'} (line: ${before?.pvSan.join(' ') || 'unknown'})
- Classification: ${classification ? CLASSIFICATION_LABEL[classification] : 'unknown'}`
  })

  const after = plies[plies.length - 1].after
  return `${intro(bot, playerColor)}

Game so far (PGN): ${pgnOf(history.slice(0, last.ply))}

Explain full move ${n}: ${plies.map((p) => p.move.san).join(' and ')}.

Board BEFORE move ${n} (uppercase = White, lowercase = Black):
${board(first.fenBefore)}
FEN: ${first.fenBefore}

Board AFTER move ${n}:
${board(last.fenAfter)}
FEN: ${last.fenAfter}

Stockfish data (scores are from White's perspective, in pawns):
${details.join('\n\n')}

Expected continuation now: ${after?.pvSan.join(' ') || 'none'}

For each of the moves above, in order, explain what it does and why it was played: its idea, threats or plans it creates, and whether it was good. For my move, if it was not the best, explain concretely what the engine move would have achieved. For the bot's move, if it was a mistake, hint at how I can exploit it without spelling out the full line. Use the move (in bold) as the start of each part.
Finish with one line starting with **Lesson:** that I can remember for future games, and one line starting with **Next:** about what to focus on in the coming moves.

Keep it under 230 words.`
}

export function askPrompt(opts: {
  question: string
  history: MoveRecord[]
  fen: string
  bot: Bot
  playerColor: Color
  current?: PositionEval
  thread: { question: string; answer: string }[]
}) {
  const { question, history, fen, bot, playerColor, current, thread } = opts
  const recent = thread.slice(-4)
  const previous = recent.length
    ? `\nOur earlier conversation:\n${recent.map((t) => `Me: ${t.question}\nCoach: ${t.answer}`).join('\n\n')}\n`
    : ''
  const turn = fen.split(' ')[1] as Color
  const toMove = `${sideName(turn)} (${turn === playerColor ? 'me' : 'the bot'})`
  return `${intro(bot, playerColor)}

Game so far (PGN): ${pgnOf(history)}

Current board (uppercase = White, lowercase = Black), ${toMove} to move:
${board(fen)}
FEN: ${fen}

Stockfish on the current position (White's perspective): ${evalText(current)}, best move ${current?.bestMoveSan ?? 'unknown'}, line: ${current?.pvSan.join(' ') || 'unknown'}
${previous}
My question: ${question}

Answer as my coach. Be concrete and brief (under 200 words unless I ask for more).`
}

export function reviewPrompt(opts: {
  history: MoveRecord[]
  bot: Bot
  playerColor: Color
  evals: Record<string, PositionEval>
  classifications: Record<number, Classification>
  result: string
}) {
  const { history, bot, playerColor, evals, classifications, result } = opts
  const rows = history.map((m) => {
    const before = evals[m.fenBefore]
    const after = evals[m.fenAfter]
    const c = classifications[m.ply]
    const who = m.color === playerColor ? 'me' : 'bot'
    const better = c && ['inaccuracy', 'mistake', 'blunder'].includes(c) && before?.bestMoveSan ? `, best was ${before.bestMoveSan}` : ''
    return `${moveLabel(m)} (${who}) eval ${evalText(after)}${c ? `, ${CLASSIFICATION_LABEL[c]}` : ''}${better}`
  })
  return `${intro(bot, playerColor)} Result: ${result}.

PGN: ${pgnOf(history)}

Move by move with Stockfish evaluations (White's perspective):
${rows.join('\n')}

Please review my game:
1. A two-sentence summary of how the game went.
2. The 2-3 key moments that decided the game (cite the move numbers) and what I should have done instead.
3. Patterns in my mistakes (for example: missed tactics, king safety, piece activity, endgame technique).
4. Three concrete things I should practice to improve, matched to my level.

Keep it under 350 words.`
}
