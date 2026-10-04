import { formatScore, winningChances, type PositionEval } from '../lib/analysis'

/** Vertical evaluation bar. `flipped` puts White's share at the top, for when you play Black. */
export function EvalBar({ evaluation, flipped = false }: { evaluation?: PositionEval; flipped?: boolean }) {
  let white = 0.5
  let label = ''
  if (evaluation?.result) {
    white = evaluation.result === '1-0' ? 1 : evaluation.result === '0-1' ? 0 : 0.5
    label = evaluation.result === '1/2-1/2' ? '½' : evaluation.result
  } else if (evaluation) {
    white = (1 + winningChances(evaluation.score)) / 2
    label = formatScore(evaluation.score).replace('+', '')
  }
  const whiteAhead = white >= 0.5
  const labelAtBottom = whiteAhead !== flipped
  return (
    <div className="eval-bar" title="Engine evaluation">
      <div className={`eval-bar-white ${flipped ? 'top' : 'bottom'}`} style={{ height: `${white * 100}%` }} />
      <span className={`eval-bar-label ${labelAtBottom ? 'bottom' : 'top'} ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  )
}
