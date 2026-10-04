/** Small hint showing a button's keyboard shortcut. */
export function Key({ k }: { k: string }) {
  return <kbd className="key" aria-hidden>{k}</kbd>
}
