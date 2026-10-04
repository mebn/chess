import { useEffect, useRef } from 'react'
import type { Classification } from '../lib/analysis'
import { describeSan } from '../lib/notation'
import type { MoveRecord } from '../lib/coach'

type Props = {
  moves: MoveRecord[]
  classifications: Record<number, Classification>
  activePly: number
  onSelect: (ply: number) => void
}

const SYMBOL: Partial<Record<Classification, string>> = {
  best: '★',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

export function MoveList({ moves, classifications, activePly, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const labelCount = Object.keys(classifications).length

  // Follow the game: stay scrolled to the newest move. When reviewing an earlier move, center it instead.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('.move.active')
    if (!active || activePly >= moves.length) {
      list.scrollTo({ left: list.scrollWidth, behavior: 'smooth' })
      return
    }
    const listBox = list.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    const target = list.scrollLeft + (box.left - listBox.left) - (list.clientWidth - box.width) / 2
    list.scrollTo({ left: target, behavior: 'smooth' })
    // Move labels (★, ?!) arrive after the engine rates a move and widen the row, so rerun then too.
  }, [activePly, moves.length, labelCount])

  const rows: [MoveRecord, MoveRecord | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]])

  const cell = (m?: MoveRecord) => {
    if (!m) return null
    const c = classifications[m.ply]
    return (
      <button className={`move ${m.ply === activePly ? 'active' : ''}`} data-tip={describeSan(m.san) ?? undefined} onClick={() => onSelect(m.ply)}>
        <span>{m.san}</span>
        {c && SYMBOL[c] && <span className={`move-tag ${c}`}>{SYMBOL[c]}</span>}
      </button>
    )
  }

  return (
    <div className="move-list" ref={listRef}>
      {rows.length === 0 && <p className="muted small move-empty">Moves will appear here.</p>}
      {rows.map(([w, b], i) => (
        <div className="move-pair" key={i}>
          <span className="move-num">{i + 1}.</span>
          {cell(w)}
          {cell(b)}
        </div>
      ))}
    </div>
  )
}
