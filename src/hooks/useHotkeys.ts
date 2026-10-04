import { useEffect, useRef } from 'react'

/** Single-key shortcuts. Ignored while typing in a field or when a modifier key is held. */
export function useHotkeys(keys: Record<string, (() => void) | undefined>, enabled = true) {
  const ref = useRef(keys)
  useEffect(() => {
    ref.current = keys
  })

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      const fn = ref.current[e.key.toLowerCase()]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
