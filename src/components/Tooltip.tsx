import { useEffect, useState } from 'react'

type Tip = { text: string; x: number; y: number }

/**
 * One floating tooltip for every element with a `data-tip` attribute. It is positioned
 * against the window, so scrolling cards and rows cannot clip it.
 */
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]')
      if (!el?.dataset.tip) return setTip(null)
      const r = el.getBoundingClientRect()
      setTip({ text: el.dataset.tip, x: r.left + r.width / 2, y: r.top })
    }
    const hide = () => setTip(null)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!tip) return null
  // Keep it inside the window horizontally (it is at most ~300px wide).
  const x = Math.min(Math.max(tip.x, 160), window.innerWidth - 160)
  return (
    <div className="tooltip" style={{ left: x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  )
}
