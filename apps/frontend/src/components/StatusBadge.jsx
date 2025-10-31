import { Badge } from './ui/badge'

export default function StatusBadge({ status }) {
  const map = {
    DRAFT: 'border-gray-300',
    RUNNING: 'border-green-600 text-green-700',
    PAUSED: 'border-amber-600 text-amber-700',
    COMPLETE: 'border-blue-600 text-blue-700',
    FAILED: 'border-red-600 text-red-700',
  }
  return <Badge className={map[status]}>{status}</Badge>
}
