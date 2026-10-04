import { useEffect, useRef, useState } from 'react'

type Props = {
  dark: boolean
  onToggleDark: () => void
  onOpenCoachSettings: () => void
  coachSummary: string
}

export function SettingsMenu({ dark, onToggleDark, onOpenCoachSettings, coachSummary }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button className={`btn ${open ? 'pressed' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        Settings <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <button className="menu-item" role="menuitemcheckbox" aria-checked={dark} onClick={onToggleDark}>
            <span>Dark mode</span>
            <span className={`switch ${dark ? 'on' : ''}`} aria-hidden />
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item column"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenCoachSettings()
            }}
          >
            <span>Coach settings…</span>
            <span className="menu-sub">{coachSummary}</span>
          </button>
        </div>
      )}
    </div>
  )
}
