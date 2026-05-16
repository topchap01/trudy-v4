import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { toast } from '../components/ui/toaster.jsx'
import Button from '../components/Button.jsx'
import { stressTestRoute, exportToTrevor, getShelfOutputs } from '../lib/shelf-api.js'

/* ── Helpers ────────────────────────────────────────────────────── */
function Badge({ children, className = '' }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</h3>
        <span className="text-gray-400 dark:text-gray-500 text-lg">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  )
}

function ScoreBar({ label, value, max = 10, color = 'sky' }) {
  const pct = Math.min(100, (value / max) * 100)
  const colors = {
    sky: 'bg-sky-500', green: 'bg-green-500', red: 'bg-red-500',
    amber: 'bg-amber-500', orange: 'bg-orange-500', blue: 'bg-blue-500',
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-gray-600 dark:text-gray-400 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colors[color] || colors.sky}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-gray-700 dark:text-gray-300 font-medium">{value}</span>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────── */
export default function ShelfStressTest() {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const routeId = searchParams.get('routeId')

  const [route, setRoute] = useState(location.state?.route || null)
  const [context, setContext] = useState(location.state?.context || null)
  const [stressData, setStressData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [trevorPayload, setTrevorPayload] = useState(null)
  const [showTrevor, setShowTrevor] = useState(false)

  /* Load route + run stress test on mount */
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // If we don't have the route from navigation state, fetch outputs and find it
        let currentRoute = route
        let currentContext = context
        if (!currentRoute) {
          const outputs = await getShelfOutputs(campaignId)
          currentContext = outputs
          const routes = outputs.routes || outputs.concepts || []
          currentRoute = routes.find(r => (r.id || r.name) === routeId) || routes[0]
          if (!cancelled) {
            setRoute(currentRoute)
            setContext(currentContext)
          }
        }

        if (!currentRoute) {
          toast.error('Route not found.')
          if (!cancelled) setLoading(false)
          return
        }

        // Run stress test
        const result = await stressTestRoute(currentRoute, currentContext)
        if (!cancelled) setStressData(result)
      } catch {
        // toast already shown
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [campaignId, routeId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Export to Trevor */
  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await exportToTrevor(route)
      setTrevorPayload(result)
      setShowTrevor(true)
      toast.success('Trevor export generated.')
    } catch {
      // toast already shown
    } finally {
      setExporting(false)
    }
  }

  /* ── Loading ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Running stress test...</p>
        </div>
      </div>
    )
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Route not found.</p>
          <Button variant="outline" onClick={() => navigate(`/shelf/${campaignId}/routes`)}>Back to Routes</Button>
        </div>
      </div>
    )
  }

  if (!stressData || (!stressData.verdict && !stressData.killSheet && !stressData.kill_sheet)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Stress test returned no data. The API may have failed.</p>
          <Button variant="outline" onClick={() => navigate(`/shelf/${campaignId}/routes`)}>Back to Routes</Button>
        </div>
      </div>
    )
  }

  // Stress test returns { ok, verdict: { ... } } — extract the verdict
  const data = stressData.verdict || stressData
  const killSheet = data.killSheet || data.kill_sheet || {}
  const budgetScenarios = data.budgetScenarios || data.budget_scenarios || []
  const frictionAudit = data.frictionAudit || data.friction_audit || {}
  const retailerSOS = data.retailerSOS || data.retailer_sos || data.retailerPitch || {}
  const messageHierarchy = data.messageHierarchy || data.message_hierarchy || {}
  const messageComparison = data.messageComparison || data.message_comparison || {}
  const prizeArchitecture = data.prizeArchitecture || data.prize_architecture || []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <button
          onClick={() => navigate(`/shelf/${campaignId}/routes`)}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-6 inline-flex items-center gap-1 transition-colors"
        >
          ← Back to Routes
        </button>

        {/* Route header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Stress Test: {route.name || route.routeName || 'Selected Route'}
          </h1>
          {route.concept && (
            <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">{route.concept}</p>
          )}
        </div>

        <div className="space-y-6">
          {/* ── Kill Sheet ──────────────────────────────────────── */}
          {killSheet.length > 0 && (
            <Section title="Kill Sheet">
              <div className="space-y-3">
                {killSheet.map((item, i) => (
                  <KillSheetItem key={i} item={item} index={i} />
                ))}
              </div>
            </Section>
          )}

          {/* ── Budget Scenarios ────────────────────────────────── */}
          {budgetScenarios.length > 0 && (
            <Section title="Budget Scenarios">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Scenario</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Redemption</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Total Cost</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Cost/Unit</th>
                      <th className="py-2 font-medium text-gray-500 dark:text-gray-400">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetScenarios.map((s, i) => {
                      const riskColor = {
                        SAFE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                        WATCH: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                        BLOWOUT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                      }
                      return (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2.5 pr-4 text-gray-800 dark:text-gray-200 font-medium">
                            {s.label || s.scenario || `${s.redemptionRate}% redemption`}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">
                            {s.redemptionRate != null ? `${s.redemptionRate}%` : '-'}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">
                            {s.cost != null ? `$${Number(s.cost).toLocaleString()}` : '-'}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">
                            {s.costPerUnit != null ? `$${Number(s.costPerUnit).toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2.5">
                            <Badge className={riskColor[s.risk] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}>
                              {s.risk || '-'}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Friction Audit ──────────────────────────────────── */}
          {(frictionAudit.fields || frictionAudit.currentFields) && (
            <Section title="Friction Audit">
              {(frictionAudit.fields || frictionAudit.currentFields || []).length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Fields</p>
                  {(frictionAudit.fields || frictionAudit.currentFields).map((f, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm border-b border-gray-100 dark:border-gray-800 pb-2">
                      <span className={`shrink-0 font-medium ${f.keep === false || f.remove ? 'text-red-500' : 'text-green-500'}`}>
                        {f.keep === false || f.remove ? '✗ Remove' : '✓ Keep'}
                      </span>
                      <div>
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{f.field || f.name}</span>
                        {f.justification && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.justification}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {frictionAudit.fieldsToRemove && frictionAudit.fieldsToRemove.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 dark:text-red-400 uppercase tracking-wide mb-2">Recommended Removals</p>
                  <div className="flex flex-wrap gap-2">
                    {frictionAudit.fieldsToRemove.map((f, i) => (
                      <Badge key={i} className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                        {typeof f === 'string' ? f : f.field || f.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── Retailer S.O.S. Pitch ──────────────────────────── */}
          {(retailerSOS.pitch || retailerSOS.content || retailerSOS.text) && (
            <Section title="Retailer S.O.S. Pitch">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {retailerSOS.pitch || retailerSOS.content || retailerSOS.text}
                </div>
              </div>
              {retailerSOS.keyPoints && Array.isArray(retailerSOS.keyPoints) && (
                <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Key Selling Points</p>
                  <ul className="space-y-1">
                    {retailerSOS.keyPoints.map((p, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-sky-500 shrink-0">•</span> {typeof p === 'string' ? p : p.point || p.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* ── Message Hierarchy Comparison ───────────────────── */}
          {(messageHierarchy.headline || messageComparison.original || messageComparison.improved) && (
            <Section title="Message Hierarchy">
              {messageComparison.original && messageComparison.improved ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase mb-2">Original</p>
                    <p className="font-bold text-gray-800 dark:text-gray-200">{messageComparison.original.headline}</p>
                    {messageComparison.original.subline && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{messageComparison.original.subline}</p>
                    )}
                  </div>
                  <div className="rounded-lg border-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950 p-4">
                    <p className="text-xs font-medium text-sky-600 dark:text-sky-400 uppercase mb-2">Improved</p>
                    <p className="font-bold text-gray-900 dark:text-white">{messageComparison.improved.headline}</p>
                    {messageComparison.improved.subline && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{messageComparison.improved.subline}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-l-4 border-sky-500 pl-4">
                  {messageHierarchy.headline && <p className="text-lg font-bold text-gray-900 dark:text-white">{messageHierarchy.headline}</p>}
                  {messageHierarchy.subline && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{messageHierarchy.subline}</p>}
                </div>
              )}
            </Section>
          )}

          {/* ── Prize Architecture ─────────────────────────────── */}
          {prizeArchitecture.length > 0 && (
            <Section title="Prize Architecture">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Tier</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Prize</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                      <th className="py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Value</th>
                      <th className="py-2 font-medium text-gray-500 dark:text-gray-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prizeArchitecture.map((p, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2.5 pr-4 text-gray-800 dark:text-gray-200 font-medium">{p.tier || `Tier ${i + 1}`}</td>
                        <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">{p.prize || p.description || '-'}</td>
                        <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">{p.quantity ?? p.qty ?? '-'}</td>
                        <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">
                          {p.value != null ? `$${Number(p.value).toLocaleString()}` : '-'}
                        </td>
                        <td className="py-2.5 text-gray-600 dark:text-gray-400">
                          {p.total != null ? `$${Number(p.total).toLocaleString()}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Export to Trevor ────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Button onClick={handleExport} loading={exporting} size="lg">
              Export to Trevor
            </Button>
            <Button variant="outline" onClick={() => navigate(`/shelf/${campaignId}/routes`)}>
              Back to Routes
            </Button>
          </div>

          {/* Trevor payload modal */}
          {showTrevor && trevorPayload && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trevor Export Payload</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(trevorPayload, null, 2))
                    toast.success('Copied to clipboard.')
                  }}
                  className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                >
                  Copy JSON
                </button>
              </div>
              <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto max-h-96">
                {JSON.stringify(trevorPayload, null, 2)}
              </pre>
              <div className="mt-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => setShowTrevor(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Kill Sheet Item (expandable) ───────────────────────────────── */
function KillSheetItem({ item, index }) {
  const [expanded, setExpanded] = useState(false)
  const passed = item.pass || item.result === 'PASS'

  return (
    <div
      className={`rounded-lg border p-4 transition-colors cursor-pointer
        ${passed
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900'
          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-lg ${passed ? 'text-green-500' : 'text-red-500'}`}>
            {passed ? '✓' : '✗'}
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {item.check || item.name || `Check ${index + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={passed
            ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
            : 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'}>
            {passed ? 'PASS' : 'FAIL'}
          </Badge>
          <span className="text-gray-400 text-sm">{expanded ? '−' : '+'}</span>
        </div>
      </div>
      {expanded && item.note && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
          {item.note}
        </p>
      )}
      {expanded && item.detail && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">{item.detail}</p>
      )}
    </div>
  )
}
