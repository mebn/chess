import { useEffect, useRef } from 'react'
import type { Classification } from '../lib/analysis'
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

  // Keep the active move centered in the horizontal strip (without scrolling the page).
  useEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('.move.active')
    if (!list) return
    if (!active) {
      list.scrollLeft = list.scrollWidth
      return
    }
    list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.offsetWidth / 2, behavior: 'smooth' })
  }, [activePly, moves.length])

  const rows: [MoveRecord, MoveRecord | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]])

  const cell = (m?: MoveRecord) => {
    if (!m) return null
    const c = classifications[m.ply]
    return (
      <button className={`move ${m.ply === activePly ? 'active' : ''}`} onClick={() => onSelect(m.ply)}>
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
