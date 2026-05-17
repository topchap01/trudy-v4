import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { listEvaluations, getShelfEvaluation } from '../lib/campaigns.js'
import Button from '../components/Button.jsx'

/* ── Verdict badge styling — mirrors ShelfRoutes ──────────────── */
const VERDICT_STYLE = {
  GO: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700',
  REWORK: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700',
  KILL: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  NEEDS_INPUT: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900 dark:text-sky-200 dark:border-sky-700',
}

function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="inline-block rounded-full border bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-700 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">PENDING</span>
  const cls = VERDICT_STYLE[verdict] || VERDICT_STYLE.REWORK
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${cls}`}>{verdict}</span>
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(iso).slice(0, 16).replace('T', ' ')
  }
}

/**
 * One row per past evaluation. Lazy-loads the verdict label and improved
 * headline on mount so the user sees the substance, not just "Evaluate:
 * Brand — Category".
 */
function EvaluationCard({ campaign }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getShelfEvaluation(campaign.id)
      .then((res) => {
        if (cancelled) return
        setDetail(res)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [campaign.id])

  const verdict = detail?.verdict?.verdict || null
  const verdictRationale = detail?.verdict?.verdictRationale || ''
  const improvedHeadline = detail?.verdict?.messageHierarchy?.improved?.headline
    || detail?.verdict?.messageHierarchy?.headline
    || ''
  const oneJob = detail?.verdict?.oneJob || ''
  const altCount = Array.isArray(detail?.verdict?.alternativeRoutes) ? detail.verdict.alternativeRoutes.length : 0
  const brand = campaign.clientName || campaign.title?.replace(/^Evaluate:\s*/, '').split('—')[0]?.trim() || 'Brand'
  const category = campaign.category || ''

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col gap-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <VerdictBadge verdict={verdict} />
            {oneJob && <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{String(oneJob).split('—')[0].trim()}</span>}
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white truncate">{brand}</div>
          {category && <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{category}</div>}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap text-right shrink-0">
          {formatDate(campaign.createdAt)}
        </div>
      </div>

      {loading && <div className="h-4 w-1/2 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />}
      {failed && <p className="text-xs text-red-500 italic">Couldn't load this evaluation's verdict.</p>}

      {!loading && !failed && verdictRationale && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">{verdictRationale}</p>
      )}

      {!loading && !failed && improvedHeadline && (
        <div className="text-sm">
          <span className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-wide">Improved headline</span>
          <p className="text-gray-700 dark:text-gray-300 font-medium mt-0.5 italic">"{improvedHeadline}"</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {altCount > 0 && <span>{altCount} alternative route{altCount === 1 ? '' : 's'}</span>}
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(`/shelf/${campaign.id}/routes`)}>
          View evaluation →
        </Button>
      </div>
    </div>
  )
}

export default function ShelfHistory() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listEvaluations()
      .then((list) => setCampaigns(list || []))
      .catch((err) => setError(err?.message || 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Evaluation history</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Every promotion you've put through Trudy. Newest first.</p>
          </div>
          <Link to="/shelf"><Button variant="outline">New brief</Button></Link>
        </div>

        {loading && (
          <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Loading evaluations…</div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && campaigns.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No evaluations yet. Go run your first brief.</p>
            <Link to="/shelf"><Button>Start a brief</Button></Link>
          </div>
        )}

        {!loading && !error && campaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <EvaluationCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
