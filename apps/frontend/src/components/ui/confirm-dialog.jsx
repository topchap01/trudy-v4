import { useCallback, useEffect, useRef } from 'react'

/**
 * Accessible confirmation dialog with focus trap.
 * Usage: <ConfirmDialog open={show} title="Delete?" onConfirm={fn} onCancel={fn} />
 */
export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  description = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // 'danger' | 'default'
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)
  const backdropRef = useRef(null)

  // Focus confirm button on open
  useEffect(() => {
    if (open && confirmRef.current) {
      confirmRef.current.focus()
    }
  }, [open])

  // Escape key closes
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === backdropRef.current) onCancel?.()
    },
    [onCancel]
  )

  if (!open) return null

  const confirmColors =
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
      : 'bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-500'

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={description ? 'confirm-desc' : undefined}
    >
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-5 shadow-xl border dark:border-gray-700">
        <h2 id="confirm-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {description && (
          <p id="confirm-desc" className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 transition-colors ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
