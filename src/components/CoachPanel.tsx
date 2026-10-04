import { useEffect, useRef, useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import { CLASSIFICATION_LABEL, formatScore, type Classification, type PositionEval } from '../lib/analysis'
import { moveLabel, type Color, type MoveRecord } from '../lib/coach'
import type { CoachText, ThreadEntry } from '../hooks/useGame'

export type PlyView = {
  move: MoveRecord
  before?: PositionEval
  after?: PositionEval
  classification?: Classification
}

const SUGGESTIONS = ['What is my plan here?', 'What is the bot threatening?', 'Which opening is this?', 'How do I improve my worst piece?']

function evalOf(e?: PositionEval) {
  if (!e) return '…'
  if (e.result) return e.result
  return formatScore(e.score)
}

function CoachMarkdown({ entry }: { entry: CoachText }) {
  if (entry.status === 'loading' && !entry.text) return <div className="typing"><span /><span /><span /></div>
  return (
    <div className={`coach-text ${entry.status === 'error' ? 'error' : ''}`}>
      <Markdown>{entry.text}</Markdown>
    </div>
  )
}

const MISTAKES: Classification[] = ['inaccuracy', 'mistake', 'blunder']

export function AnalysisCard(props: {
  moveNumber: number
  plies: PlyView[]
  playerColor: Color
  explanation?: CoachText
  canExplain: boolean
  waitingForReply: boolean
  onExplain: () => void
  autoExplain: boolean
  onToggleAuto: (v: boolean) => void
}) {
  const { moveNumber, plies, playerColor, explanation, canExplain, waitingForReply, onExplain, autoExplain, onToggleAuto } = props

  return (
    <section className="card analysis-card">
      <div className="card-head">
        <h3>Move analysis</h3>
        <label className="toggle" title="Explain every full move automatically">
          <input type="checkbox" checked={autoExplain} onChange={(e) => onToggleAuto(e.target.checked)} />
          <span>Auto</span>
        </label>
      </div>

      <div className="card-body">
        {plies.length === 0 && (
          <p className="muted small">After each full move (White and Black) the coach explains both moves here, along with what the engine would have played.</p>
        )}

        {plies.length > 0 && (
          <>
            <div className="ply-list">
              {plies.map(({ move, before, after, classification }) => (
                <div className="ply" key={move.ply}>
                  <div className="move-summary">
                    <span className="move-title">{moveLabel(move)}</span>
                    <span className="muted small">{move.color === playerColor ? 'You' : 'Bot'}</span>
                    {classification && <span className={`badge ${classification}`}>{CLASSIFICATION_LABEL[classification]}</span>}
                  </div>
                  <div className="facts">
                    <span>Eval <b>{evalOf(before)}</b> → <b>{evalOf(after)}</b></span>
                    {classification && MISTAKES.includes(classification) && before?.bestMoveSan && (
                      <span>Best was <b className="best-move">{before.bestMoveSan}</b></span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {explanation ? (
              <CoachMarkdown entry={explanation} />
            ) : waitingForReply ? (
              <p className="muted small">The explanation comes once move {moveNumber} is complete.</p>
            ) : (
              <button className="btn subtle" onClick={onExplain} disabled={!canExplain}>
                {canExplain ? 'Explain this move' : 'Analysing…'}
              </button>
            )}
            {explanation?.status === 'error' && (
              <button className="btn subtle" onClick={onExplain}>Try again</button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export function AskCard({ thread, onAsk, agentLabel }: { thread: ThreadEntry[]; onAsk: (q: string) => void; agentLabel: string }) {
  const [question, setQuestion] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const last = thread[thread.length - 1]

  // Keep the newest answer in view while it streams in.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, last?.answer])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    onAsk(q)
    setQuestion('')
  }

  return (
    <section className="card ask-card">
      <div className="card-head">
        <h3>Ask your coach</h3>
        <span className="muted tiny" title="Change in Settings > Coach settings">{agentLabel}</span>
      </div>
      <div className="card-body" ref={bodyRef}>
        {thread.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => onAsk(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="thread">
          {thread.map((t, i) => (
            <div key={i} className="qa">
              <div className="q">{t.question}</div>
              <CoachMarkdown entry={{ text: t.answer, status: t.status }} />
            </div>
          ))}
        </div>
      </div>
      <form className="ask" onSubmit={submit}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about the position…" />
        <button className="btn" type="submit" disabled={!question.trim()}>Ask</button>
      </form>
    </section>
  )
}

export function ReviewCard({ review, onReview }: { review: CoachText | null; onReview: () => void }) {
  return (
    <section className="card review-card">
      <div className="card-head">
        <h3>Game review</h3>
        {review?.status !== 'loading' && (
          <button className="btn subtle small" onClick={onReview}>{review ? 'Redo' : 'Review game'}</button>
        )}
      </div>
      <div className="card-body">
        {review ? <CoachMarkdown entry={review} /> : <p className="muted small">Get a summary of the key moments and what to practice.</p>}
      </div>
    </section>
  )
}
