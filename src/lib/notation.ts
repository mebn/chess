// Turns algebraic notation into plain words, e.g. "Nxf7+" -> "Knight takes on f7, check".

const PIECE: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' }
const PROMO: Record<string, string> = { Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' }

const SAN_RE = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/

/**
 * Describe a move in words. `isMove` says a bare square like "e4" is a pawn move
 * (for example after a move number); otherwise a bare square is described as a square.
 */
export function describeSan(san: string, isMove = true): string | null {
  const castle = san.match(/^(O-O(?:-O)?)([+#])?$/)
  if (castle) return withCheck(castle[1] === 'O-O' ? 'Castles kingside' : 'Castles queenside', castle[2])

  const m = san.match(SAN_RE)
  if (!m) return null
  const [, piece, fromFile, fromRank, capture, to, promo, check] = m

  if (!piece && !fromFile && !fromRank && !capture && !promo && !check && !isMove) return `The ${to} square`

  let who = piece ? PIECE[piece] : 'Pawn'
  if (fromFile && fromRank) who += ` on ${fromFile}${fromRank}`
  else if (fromFile) who += piece ? ` on the ${fromFile}-file` : ` from the ${fromFile}-file`
  else if (fromRank) who += ` on rank ${fromRank}`

  let text = `${who} ${capture ? 'takes on' : 'to'} ${to}`
  if (promo) text += `, promotes to a ${PROMO[promo]}`
  return withCheck(text, check)
}

function withCheck(text: string, check?: string) {
  if (check === '#') return `${text}, checkmate`
  if (check === '+') return `${text}, check`
  return text
}
