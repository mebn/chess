import { Children, useContext, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { describeSan } from '../lib/notation'
import { SquareHoverContext } from '../lib/squareHover'

// A square ("e4"), a move ending on one ("Nxf7+", "exd5", "e8=Q") or castling, not part of a longer word.
const SQUARE_RE = /(?<![A-Za-z0-9-])(?:O-O(?:-O)?[+#]?|([KQRBN]?[a-h]?[1-8]?x?)([a-h][1-8])(=[QRBN])?([+#])?)(?![A-Za-z0-9-])/g
// A move number right before the match ("12. " or "12... ") means a bare square is a pawn move.
const MOVE_NUMBER_BEFORE = /\d+\.(\.\.)?\s*$/

function SquareRef({ square, tip, children }: { square?: string; tip: string | null; children: ReactNode }) {
  const setHover = useContext(SquareHoverContext)
  return (
    <span
      className="sq-ref"
      data-tip={tip ?? undefined}
      onMouseEnter={() => square && setHover(square)}
      onMouseLeave={() => square && setHover(null)}
    >
      {children}
    </span>
  )
}

function linkText(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(SQUARE_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const isMove = MOVE_NUMBER_BEFORE.test(text.slice(0, start))
    out.push(<SquareRef key={start} square={m[2]} tip={describeSan(m[0], isMove)}>{m[0]}</SquareRef>)
    last = start + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Only direct text is linked; nested elements (bold, italics) link their own text via their component.
function linkChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === 'string' ? linkText(child) : child))
}

const components: Components = {
  p: ({ children }) => <p>{linkChildren(children)}</p>,
  li: ({ children }) => <li>{linkChildren(children)}</li>,
  strong: ({ children }) => <strong>{linkChildren(children)}</strong>,
  em: ({ children }) => <em>{linkChildren(children)}</em>,
  h3: ({ children }) => <h3>{linkChildren(children)}</h3>,
  h4: ({ children }) => <h4>{linkChildren(children)}</h4>,
  td: ({ children }) => <td>{linkChildren(children)}</td>,
}

/** Markdown where squares and moves can be hovered to highlight them on the board. */
export function SquareMarkdown({ children }: { children: string }) {
  return <Markdown components={components}>{children}</Markdown>
}
