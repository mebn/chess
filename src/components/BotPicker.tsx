import { useState } from 'react'
import { BOTS } from '../lib/bots'
import type { Color } from '../lib/coach'

type Props = {
  currentBotId: string
  currentColor: Color
  onPick: (botId: string, color: Color) => void
  onClose: () => void
}

export function BotPicker({ currentBotId, currentColor, onPick, onClose }: Props) {
  const [color, setColor] = useState<Color>(currentColor)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose opponent">
        <div className="modal-head">
          <h2>New game</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="picker-row">
          <span className="muted small">Play as</span>
          <div className="segmented">
            <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>♔ White</button>
            <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>♚ Black</button>
          </div>
        </div>

        <p className="muted small">Choose an opponent.</p>
        <div className="bot-grid">
          {BOTS.map((b) => (
            <button key={b.id} className={`bot-card ${b.id === currentBotId ? 'current' : ''}`} onClick={() => onPick(b.id, color)}>
              <span className="bot-avatar">{b.name[0]}</span>
              <span className="bot-info">
                <span className="bot-name">
                  {b.name} <span className="bot-rating">{b.rating}</span>
                </span>
                <span className="bot-desc">{b.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
