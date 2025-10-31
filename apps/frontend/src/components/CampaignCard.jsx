import { Card, CardContent, CardHeader } from './ui/card'
import StatusBadge from './StatusBadge'
import ScorePill from './ScorePill'
import { Link } from 'react-router-dom'

export default function CampaignCard({ c }) {
  return (
    <Card className="hover:shadow-md transition">
      <CardHeader className="flex items-center justify-between">
        <div className="font-medium">{c.title}</div>
        <div className="flex items-center gap-2">
          <StatusBadge status={c.status} />
          <ScorePill score={c.score ?? null} />
        </div>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        <div className="mb-2">Client: {c.clientName ?? '—'}</div>
        <div className="mb-4">Mode: {c.mode} • Market: {c.market}</div>
        <Link to={`/campaigns/${c.id}`} className="text-sm font-medium text-black underline">Open WarRoom →</Link>
      </CardContent>
    </Card>
  )
}
