// Sonner toast provider — mount once in App.jsx
import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        className: 'text-sm',
        duration: 3000,
      }}
    />
  )
}

// Re-export toast for convenience
export { toast } from 'sonner'
