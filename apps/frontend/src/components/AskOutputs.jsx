import React, { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import MarkdownBlock from './MarkdownBlock.jsx'

// Very small local fetcher to avoid touching lib if you prefer
async function askOutputs(payload) {
  const r = await fetch('/api/ask/outputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `Request failed: ${r.status}`)
  }
  const j = await r.json()
  return j?.output?.content || ''
}

async function getLatestOutputs(campaignId) {
  const r = await fetch(`/api/campaigns/${campaignId}/outputs/latest`, { method: 'GET' })
  if (!r.ok) return {}
  return await r.json() // { framing, evaluation, ideas, synthesis }
}

function parseCreateRouteNames(ideas = '') {
  return ideas
    .split(/^###\s+/m)
    .filter(Boolean)
    .map(block => (block.split('\n')[0] || '').split('—')[0].trim())
    .filter(Boolean)
}

export default function AskOutputs({ campaignId, onSaved }) {
  const [latest, setLatest] = useState({ evaluation: '', ideas: '', synthesis: '' })
  const [routeNames, setRouteNames] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  // Form state
  const [contextSource, setContextSource] = useState('evaluation') // evaluation | createRoute | synthesis | custom
  const [routeName, setRouteName] = useState('')
  const [customBrief, setCustomBrief] = useState('')

  const [taskType, setTaskType] = useState('hooks') // hooks | hookEvaluation | hookRewrite | retailerDeck | prizeLadder | mechanics | compliance | riskProfile | custom

  // shared controls
  const [intensity, setIntensity] = useState('DISRUPTIVE') // CONSERVATIVE | DISRUPTIVE | OUTRAGEOUS
  const [count, setCount] = useState(20)
  const [length, setLength] = useState('MIX') // SHORT | CORE | LONG | MIX
  const [brandLock, setBrandLock] = useState(true)
  const [seasonal, setSeasonal] = useState('LIGHT') // NONE | LIGHT | HEAVY
  const [tone, setTone] = useState('PREMIUM') // PREMIUM | PLAYFUL | CHALLENGER

  // hookEvaluation inputs
  const [evalHooksRaw, setEvalHooksRaw] = useState('')
  const [selectedRoutes, setSelectedRoutes] = useState([])

  // hookRewrite input
  const [singleHook, setSingleHook] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const l = await getLatestOutputs(campaignId)
        setLatest(l || {})
        const routes = parseCreateRouteNames(l?.ideas || '')
        setRouteNames(routes)
        if (routes.length && !routeName) setRouteName(routes[0])
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const canSubmit = useMemo(() => {
    if (taskType === 'hookEvaluation') return (evalHooksRaw.trim().length > 0)
    if (taskType === 'hookRewrite') return (singleHook.trim().length > 0)
    if (taskType === 'custom') return (customBrief.trim().length > 0)
    return true
  }, [taskType, evalHooksRaw, singleHook, customBrief])

  async function run() {
    setLoading(true)
    setError('')
    try {
      const base = {
        campaignId,
        type: taskType,
        params: {},
        context: { source: contextSource },
      }

      // context
      if (contextSource === 'createRoute' && routeName) {
        base.context.routeName = routeName
      }
      if (contextSource === 'custom' && customBrief.trim()) {
        base.context.customBrief = customBrief.trim()
      }

      // common params
      if (['hooks', 'ideas', 'hookRewrite'].includes(taskType)) {
        base.params.intensity = intensity
      }
      if (taskType === 'hooks') {
        base.params.count = Number(count) || 20
        base.params.length = length
        base.params.brandLock = !!brandLock
        base.params.seasonal = seasonal
        base.params.tone = tone
      }

      if (taskType === 'hookEvaluation') {
        const hooks = evalHooksRaw
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean)
        base.params.hooks = hooks
        base.params.routes = selectedRoutes.length ? selectedRoutes : routeNames // fallback = all
      }

      if (taskType === 'hookRewrite') {
        base.params.hook = singleHook.trim()
        base.params.length = length
        base.params.brandLock = !!brandLock
        base.params.seasonal = seasonal
        base.params.tone = tone
      }

      // custom prompt
      if (taskType === 'custom') {
        base.prompt = customBrief.trim()
      }

      const out = await askOutputs(base)
      setResult(out || '')
      onSaved && onSaved()
    } catch (e) {
      setError(e?.message || String(e))
      setResult('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded p-3 space-y-3">
      <div className="text-sm font-medium">Ask Outputs</div>

      {/* Context */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Context</label>
          <select
            value={contextSource}
            onChange={e => setContextSource(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="evaluation">Evaluated Idea (latest Evaluation)</option>
            <option value="createRoute">Specific Create Route</option>
            <option value="synthesis">Synthesis Champion / Narrative</option>
            <option value="custom">Custom mini-brief</option>
          </select>
        </div>

        {contextSource === 'createRoute' && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Route</label>
            <select
              value={routeName}
              onChange={e => setRouteName(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              {routeNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {contextSource === 'custom' && (
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">Custom brief</label>
            <textarea
              value={customBrief}
              onChange={e => setCustomBrief(e.target.value)}
              rows={3}
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Write the mini-brief here…"
            />
          </div>
        )}
      </div>

      {/* Task */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Task</label>
          <select
            value={taskType}
            onChange={e => setTaskType(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="hooks">Generate Hooks</option>
            <option value="hookEvaluation">Evaluate Hooks vs Route(s)</option>
            <option value="hookRewrite">Rewrite / Sharpen Hook</option>
            <option value="retailerDeck">Retailer Deck Outline</option>
            <option value="prizeLadder">Prize Ladder Options</option>
            <option value="mechanics">Mechanic Variants</option>
            <option value="compliance">Compliance Notes</option>
            <option value="riskProfile">Risk Register</option>
            <option value="custom">Custom Output</option>
          </select>
        </div>

        {/* Intensity only where relevant */}
        {['hooks','ideas','hookRewrite'].includes(taskType) && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Intensity</label>
            <select
              value={intensity}
              onChange={e => setIntensity(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="CONSERVATIVE">Conservative</option>
              <option value="DISRUPTIVE">Disruptive</option>
              <option value="OUTRAGEOUS">Outrageous</option>
            </select>
          </div>
        )}

        {taskType === 'hooks' && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Count</label>
            <input
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={e => setCount(Number(e.target.value || 20))}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>

      {/* Controls for hooks & rewrites */}
      {['hooks','hookRewrite'].includes(taskType) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Length</label>
            <select
              value={length}
              onChange={e => setLength(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="MIX">Mix</option>
              <option value="SHORT">2–4 words</option>
              <option value="CORE">5–7 words</option>
              <option value="LONG">8–12 words</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Seasonal dial</label>
            <select
              value={seasonal}
              onChange={e => setSeasonal(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="NONE">None</option>
              <option value="LIGHT">Light</option>
              <option value="HEAVY">Heavy</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tone</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="PREMIUM">Premium</option>
              <option value="PLAYFUL">Playful</option>
              <option value="CHALLENGER">Challenger</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="brandLock" type="checkbox" checked={brandLock} onChange={e => setBrandLock(e.target.checked)} />
            <label htmlFor="brandLock" className="text-sm">Lock brand into line</label>
          </div>
        </div>
      )}

      {/* Inputs for evaluation / rewrite */}
      {taskType === 'hookEvaluation' && (
        <>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hooks to test (one per line)</label>
            <textarea
              value={evalHooksRaw}
              onChange={e => setEvalHooksRaw(e.target.value)}
              rows={4}
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Enter hooks here, one per line…"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Routes to test against</label>
            <div className="flex flex-wrap gap-2">
              {routeNames.map(n => (
                <label key={n} className="inline-flex items-center gap-1 text-sm border rounded px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedRoutes.includes(n)}
                    onChange={(e) => {
                      setSelectedRoutes(prev =>
                        e.target.checked ? [...prev, n] : prev.filter(x => x !== n)
                      )
                    }}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-1">If none selected, all routes will be used.</div>
          </div>
        </>
      )}

      {taskType === 'hookRewrite' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Hook to rewrite</label>
          <input
            value={singleHook}
            onChange={e => setSingleHook(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Paste the hook to sharpen…"
          />
        </div>
      )}

      {/* Controls & Run */}
      <div className="flex items-center gap-2">
        <Button onClick={run} loading={loading} disabled={!canSubmit}>
          Run Ask Outputs
        </Button>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>

      {/* Result */}
      {result ? (
        <div className="border rounded p-3">
          <MarkdownBlock text={result} />
        </div>
      ) : null}
    </div>
  )
}
