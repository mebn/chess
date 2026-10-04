import { Chess, type Square } from 'chess.js'
import { useMemo, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'

type Arrow = { startSquare: string; endSquare: string; color: string }

type Props = {
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  lastMove?: { from: string; to: string }
  hintSquare?: string
  arrows?: Arrow[]
  onMove: (from: string, to: string) => boolean
}

const LIGHT = '#f0d9b5'
const DARK = '#b58863'

function isLightSquare(square: string) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  return (file + rank) % 2 === 0
}

export function Board({ fen, orientation, interactive, lastMove, hintSquare, arrows = [], onMove }: Props) {
  // The selection is tied to the position it was made in, so it clears itself when the position changes.
  const [selection, setSelection] = useState<{ fen: string; square: string } | null>(null)
  const selected = selection?.fen === fen ? selection.square : null
  const setSelected = (square: string | null) => setSelection(square ? { fen, square } : null)
  const chess = useMemo(() => new Chess(fen), [fen])

  const targets = useMemo(() => {
    if (!selected) return []
    return chess.moves({ square: selected as Square, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured }))
  }, [chess, selected])

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(205, 210, 106, 0.75)' }
      styles[lastMove.to] = { background: 'rgba(205, 210, 106, 0.75)' }
    }
    if (chess.inCheck()) {
      const king = chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn())
      if (king) styles[king.square] = { ...styles[king.square], background: 'radial-gradient(circle, rgba(230, 40, 40, 0.9) 0%, rgba(230, 40, 40, 0.5) 40%, transparent 72%)' }
    }
    if (hintSquare) styles[hintSquare] = { ...styles[hintSquare], boxShadow: 'inset 0 0 0 4px rgba(21, 120, 27, 0.85)' }
    if (selected) styles[selected] = { ...styles[selected], background: 'rgba(20, 85, 30, 0.5)' }
    for (const t of targets) {
      styles[t.to] = {
        ...styles[t.to],
        background: t.capture
          ? 'radial-gradient(circle, transparent 58%, rgba(20, 85, 30, 0.35) 60%)'
          : 'radial-gradient(circle, rgba(20, 85, 30, 0.35) 22%, transparent 24%)',
        cursor: 'pointer',
      }
    }
    return styles
  }, [chess, hintSquare, lastMove, selected, targets])

  const ownColor = orientation === 'white' ? 'w' : 'b'
  const isOwnPiece = (pieceType?: string) => interactive && !!pieceType && pieceType.startsWith(ownColor)

  return (
    <Chessboard
      options={{
        id: 'main',
        position: fen,
        boardOrientation: orientation,
        lightSquareStyle: { backgroundColor: LIGHT },
        darkSquareStyle: { backgroundColor: DARK },
        // Our own renderer labels every square, so hide the built-in edge notation.
        showNotation: false,
        squareRenderer: ({ square, children }) => (
          <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
            <span className="square-label" style={{ color: isLightSquare(square) ? DARK : LIGHT }}>{square}</span>
            {children}
          </div>
        ),
        boardStyle: { borderRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)', overflow: 'hidden' },
        squareStyles,
        arrows,
        animationDurationInMs: 180,
        allowDragging: interactive,
        canDragPiece: ({ piece }) => isOwnPiece(piece.pieceType),
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          setSelected(null)
          if (!targetSquare || !interactive) return false
          return onMove(sourceSquare, targetSquare)
        },
        onPieceDrag: ({ square }) => setSelected(square),
        onSquareClick: ({ piece, square }) => {
          if (!interactive) return
          if (selected && targets.some((t) => t.to === square)) {
            onMove(selected, square)
            setSelected(null)
          } else if (isOwnPiece(piece?.pieceType) && square !== selected) {
            setSelected(square)
          } else {
            setSelected(null)
          }
        },
      }}
    />
  )
}
