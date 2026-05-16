// apps/frontend/src/lib/clipboard.js
// Toast-enhanced clipboard copy utility.
import { toast } from '../components/ui/toaster.jsx'

/**
 * Copy `text` to the clipboard and show a sonner toast confirming the action.
 *
 * @param {string} text  - The content to copy.
 * @param {string} label - A human-readable label shown in the toast (e.g. "Framing output").
 */
export async function copyToClipboard(text, label = 'text') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch {
    toast.error('Copy failed — please copy manually')
  }
}
