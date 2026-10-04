import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CLASSIFICATION_LABEL, formatScore, type Classification, type PositionEval } from '../lib/analysis'
import { moveLabel, type Color, type MoveRecord } from '../lib/coach'
import type { CoachText, ThreadEntry } from '../hooks/useGame'
import { describeSan } from '../lib/notation'
import { SquareMarkdown } from './SquareText'

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
      <SquareMarkdown>{entry.text}</SquareMarkdown>
    </div>
  )
}

const MISTAKES: Classification[] = ['inaccuracy', 'mistake', 'blunder']

/** Body of the "Move analysis" tab. */
export function AnalysisPanel(props: {
  moveNumber: number
  plies: PlyView[]
  playerColor: Color
  explanation?: CoachText
  canExplain: boolean
  waitingForReply: boolean
  onExplain: () => void
}) {
  const { moveNumber, plies, playerColor, explanation, canExplain, waitingForReply, onExplain } = props

  return (
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
                    <span className="move-title" data-tip={describeSan(move.san) ?? undefined}>{moveLabel(move)}</span>
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
  )
}

type CoachTab = 'analysis' | 'ask' | 'review'

/** Right column: "Move analysis", "Ask your coach" and "Game review" as tabs in one card. */
export function CoachTabs(props: {
  analysis: ReactNode
  analysisLoading: boolean
  thread: ThreadEntry[]
  onAsk: (q: string) => void
  review: CoachText | null
  canReview: boolean
  onReview: () => void
}) {
  const { analysis, analysisLoading, thread, onAsk, review, canReview, onReview } = props
  const [tab, setTab] = useState<CoachTab>('analysis')
  const [question, setQuestion] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const last = thread[thread.length - 1]

  // Keep the newest answer in view while it streams in.
  useEffect(() => {
    const el = bodyRef.current
    if (el && tab === 'ask') el.scrollTop = el.scrollHeight
  }, [tab, thread.length, last?.answer])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    onAsk(q)
    setQuestion('')
  }

  return (
    <section className="card coach-card">
      <div className="card-head tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'analysis'} className={`tab ${tab === 'analysis' ? 'on' : ''}`} onClick={() => setTab('analysis')}>
          Move analysis
          {analysisLoading && tab !== 'analysis' && <span className="tab-dot" />}
        </button>
        <button role="tab" aria-selected={tab === 'ask'} className={`tab ${tab === 'ask' ? 'on' : ''}`} onClick={() => setTab('ask')}>
          Ask your coach
        </button>
        <button role="tab" aria-selected={tab === 'review'} className={`tab ${tab === 'review' ? 'on' : ''}`} onClick={() => setTab('review')}>
          Game review
          {review?.status === 'loading' && tab !== 'review' && <span className="tab-dot" />}
        </button>
      </div>

      {tab === 'analysis' && analysis}
      {tab === 'ask' && (
        <>
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
        </>
      )}
      {tab === 'review' && (
        <div className="card-body">
          {review ? (
            <CoachMarkdown entry={review} />
          ) : (
            <p className="muted small">
              {canReview ? 'Get a summary of the key moments and what to practice.' : 'Play a few moves first, then review the game here.'}
            </p>
          )}
          {review?.status !== 'loading' && (
            <button className="btn review-btn" onClick={onReview} disabled={!canReview}>
              {review ? 'Review again' : 'Review game'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
