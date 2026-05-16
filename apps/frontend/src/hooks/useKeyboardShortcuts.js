import { useEffect } from 'react'

/**
 * Register keyboard shortcuts.
 * @param {Array<{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, handler: () => void }>} shortcuts
 * @param {Array} deps - dependency array for re-registering
 */
export function useKeyboardShortcuts(shortcuts, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      // Don't fire shortcuts when typing in inputs/textareas
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
        return
      }

      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : true
        const metaMatch = s.meta ? e.metaKey : true
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase()

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch) {
          e.preventDefault()
          s.handler()
          return
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, deps)
}
