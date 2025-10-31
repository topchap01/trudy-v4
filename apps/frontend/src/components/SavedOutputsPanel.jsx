// apps/frontend/src/components/SavedOutputsPanel.jsx
import { useEffect, useState } from 'react'
import { getCampaign } from '../lib/campaigns'

const TYPES = ['framingNarrative','evaluationNarrative','ideaRoutes','hooks','retailerDeck','prizeLadder','mechanics','compliance','riskProfile','custom']

export default function SavedOutputsPanel({ campaignId }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')

  async function reload() {
    const c = await getCampaign(campaignId)
    const outs = (c.outputs || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    setItems(outs)
  }

  useEffect(() => { reload() }, [campaignId])

  const shown = filter === 'all' ? items : items.filter((x) => x.type === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Saved Outputs</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded p-1">
          <option value="all">All</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {shown.map((o) => (
          <div key={o.id} className="border rounded p-2">
            <div className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString()} • {o.type}</div>
            <div className="mt-2 text-sm whitespace-pre-wrap">{o.content?.slice(0, 2000)}</div>
          </div>
        ))}
        {shown.length === 0 && <div className="text-sm text-gray-500">No outputs yet.</div>}
      </div>
    </div>
  )
}
