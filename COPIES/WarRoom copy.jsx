import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getCampaign,
  getBrief,
  putBrief,
  runFraming,
  runEvaluate,
  runCreate,
  runSynthesis,
  listExports,
  createExport,
  getLatestOutputs,
} from '../lib/campaigns.js'

import SavedOutputsPanel from '../components/SavedOutputsPanel.jsx'
import AskOutputs from '../components/AskOutputs.jsx'
import FramingEditor from '../components/FramingEditor.jsx'
import EvaluationView from '../components/EvaluationView.jsx'
import IdeaRoutes from '../components/IdeaRoutes.jsx'
import ExportPanel from '../components/ExportPanel.jsx'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import MarkdownBlock from '../components/MarkdownBlock.jsx'

export default function WarRoom() {
  const { id } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [brief, setBrief] = useState(null)
  const [classification, setClassification] = useState(null)

  const [framing, setFraming] = useState('')
  const [evaluation, setEvaluation] = useState('')
  const [evalMeta, setEvalMeta] = useState(null)
  const [ideas, setIdeas] = useState('')
  const [synthesis, setSynthesis] = useState('')

  const [exports, setExports] = useState([])

  // Busy flags
  const [loadingFraming, setLoadingFraming] = useState(false)
  const [loadingEvaluate, setLoadingEvaluate] = useState(false)
  const [loadingCreate, setLoadingCreate] = useState(null)
  const [loadingSyn, setLoadingSyn] = useState(false)
  const [loadingHeu, setLoadingHeu] = useState(false)
  const [heuristics, setHeuristics] = useState([])

  // “Latest” timestamps (local, simple, reliable)
  const [lastRun, setLastRun] = useState({
    framing: null,
    evaluation: null,
    create: null,
    synthesis: null,
  })

  // Section anchors for sticky sub-nav
  const briefRef = useRef(null)
  const evalRef = useRef(null)
  const createRef = useRef(null)
  const synthRef = useRef(null)
  const exportRef = useRef(null)

  function markRan(key) {
    setLastRun((x) => ({ ...x, [key]: new Date().toISOString() }))
  }
  // --- Demo prefs (read-only here) ---
  const demoMode = useMemo(() => localStorage.getItem('demoMode') === 'true', []);
  const demoClient = useMemo(() => localStorage.getItem('demoClientName') || '', []);

  // If demo is ON and this campaign doesn't belong to the selected client,
  // show a gentle guard (keeps deep links safe during a client demo).
  const demoGuard = campaign &&
    demoMode &&
    demoClient &&
    String(campaign.clientName || '').toLowerCase() !== demoClient.toLowerCase();

  async function reload() {
    const c = await getCampaign(id)
    setCampaign(c)
    setBrief(await getBrief(id))
    setExports(await listExports(id))
    try {
      const latest = await getLatestOutputs(id)
      if (latest?.framing) setFraming(latest.framing)
      if (latest?.evaluation) setEvaluation(latest.evaluation)
      if (latest?.ideas) setIdeas(latest.ideas)
      if (latest?.synthesis) setSynthesis(latest.synthesis)
    } catch {}
  }

  useEffect(() => {
    if (id) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ===== Actions
  async function saveBrief(rawText, parsedJson) {
    const r = await putBrief(id, { rawText, parsedJson, assets: null })
    setBrief(r.brief)
    setClassification(r.classification)
  }

  async function doFraming() {
    setLoadingFraming(true)
    try {
      const r = await runFraming(id)
      setFraming(r.content || r)
      markRan('framing')
    } catch (err) {
      console.error('Framing failed:', err)
      setFraming(`⚠️ Framing failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingFraming(false)
    }
  }

  async function doEvaluate() {
    setLoadingEvaluate(true)
    try {
      const r = await runEvaluate(id) // { content, meta } or direct string
      setEvaluation(r.content || r)
      setEvalMeta(r.meta || null)
      markRan('evaluation')
    } catch (err) {
      console.error('Evaluate failed:', err)
      setEvaluation(`⚠️ Evaluate failed: ${err?.message || String(err)}`)
      setEvalMeta(null)
    } finally {
      setLoadingEvaluate(false)
    }
  }

  async function doCreateRoutes(intensity = 'DISRUPTIVE', count = 7) {
    setLoadingCreate(intensity)
    try {
      const r = await runCreate(id, { intensity, count })
      setIdeas(r?.content || r)
      markRan('create')
    } catch (err) {
      console.error('Create failed:', err)
      setIdeas(`⚠️ Create failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingCreate(null)
    }
  }

  async function doSynthesis() {
    setLoadingSyn(true)
    try {
      const r = await runSynthesis(id)
      setSynthesis(r.content || r)
      markRan('synthesis')
    } catch (err) {
      console.error('Synthesis failed:', err)
      setSynthesis(`⚠️ Synthesis failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingSyn(false)
    }
  }

  async function scoreHeuristics() {
    setLoadingHeu(true)
    try {
      const r = await fetch(`/api/campaigns/${id}/heuristics/score-idea-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!r.ok) throw new Error('Failed to score heuristics')
      const data = await r.json()
      setHeuristics(data.results || [])
    } catch (e) {
      console.error(e)
      setHeuristics([])
    } finally {
      setLoadingHeu(false)
    }
  }

  async function doExport(options) {
    const art = await createExport(id, options || {})
    setExports((xs) => [art, ...xs])
  }

  const sig = classification?.signals || {}
  const conf = classification?.confidence

  // Utilities
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

  const SubNav = useMemo(() => {
    const Item = ({ label, onClick }) => (
      <button
        className="text-sm px-2 py-1 rounded hover:bg-gray-100 transition"
        onClick={onClick}
      >
        {label}
      </button>
    )
    return function _SubNav() {
      return (
        <div className="sticky top-[56px] z-30 bg-white/90 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
            <Item label="Brief" onClick={() => briefRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Evaluate" onClick={() => evalRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Create" onClick={() => createRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Synthesis" onClick={() => synthRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Export" onClick={() => exportRef.current?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        </div>
      )
    }
  }, [])

  // Extract hooks spotted in Evaluation
  const spottedHooks = useMemo(() => extractHooks(evaluation), [evaluation])

  return (
    <div className="flex h-[100svh]">
      <div className="flex-1 overflow-y-auto">
        {/* Sticky page header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
          <div className="px-6 py-3">
            {campaign && (
              <>
                <h1 className="text-xl sm:text-2xl font-bold">
                  {campaign.clientName} — {campaign.title}
                </h1>
                <div className="space-x-2 mt-1">
                  <Badge kind="mode">Mode: {campaign.mode}</Badge>
                  <Badge>{campaign.status}</Badge>
                  <Badge>Market: {campaign.market || 'AU'}</Badge>
                  {campaign.category ? <Badge>{campaign.category}</Badge> : null}
                </div>
                {classification && (
                  <div className="text-xs text-gray-700 mt-1">
                    <span className="mr-2">
                      Classifier: <strong>{classification.mode}</strong> ({Math.round((conf || 0) * 100)}% conf)
                    </span>
                    <span className={`mr-2 ${sig.hasHook ? 'text-green-700' : 'text-gray-500'}`}>Hook</span>
                    <span className={`mr-2 ${sig.hasMechanic ? 'text-green-700' : 'text-gray-500'}`}>Mechanic</span>
                    <span className={`${sig.hasPrize ? 'text-green-700' : 'text-gray-500'}`}>Prize</span>
                  </div>
                )}
              </>
            )}
          </div>
          <SubNav />
        </header>

        {/* Main content */}

              {/* Demo banner / guard */}
      {demoMode ? (
        <div className="mx-6 mt-2 mb-4 rounded-md border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
          <div className="font-medium">
            Demo mode is ON{demoClient ? ` — restricted to “${demoClient}”` : ''}.
          </div>
          {demoGuard ? (
            <div className="mt-1">
              This campaign belongs to <strong>{campaign?.clientName || '—'}</strong> and is hidden by your current filter.
              <button
                className="ml-2 underline"
                onClick={() => {
                  localStorage.setItem('demoClientName', String(campaign?.clientName || ''));
                  window.location.reload();
                }}
              >
                Switch demo client
              </button>
              <button
                className="ml-3 underline"
                onClick={() => {
                  localStorage.setItem('demoMode', 'false');
                  window.location.reload();
                }}
              >
                Turn demo mode off
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

        <div className="px-6 pb-8">
          {/* Brief */}
          <section ref={briefRef} className="mb-10">
            <SectionHead
              title="Brief"
              metaRight={lastRun.framing ? `Last Framing: ${fmtTime(lastRun.framing)}` : ''}
            />
            <div className="card">
              <FramingEditor brief={brief} campaignId={id} onSave={saveBrief} />
              <div className="mt-3 flex gap-2">
                <Button onClick={doFraming} loading={loadingFraming}>Run Framing (Ava+Clara)</Button>
              </div>

              {/* Framing rendered via Markdown (no literal ###) */}
              {framing ? (
                <div className="mt-3">
                  <RevealBlock markdown text={framing} />
                </div>
              ) : null}
            </div>
          </section>

          {/* Evaluate */}
          <section ref={evalRef} className="mb-10">
            <SectionHead
              title="Evaluate"
              metaRight={lastRun.evaluation ? `Last run: ${fmtTime(lastRun.evaluation)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex gap-2 items-center">
                <Button onClick={doEvaluate} loading={loadingEvaluate}>Run Evaluation</Button>
                {evalMeta && (
                  <div className="text-xs text-gray-500">
                    Stance: {evalMeta.stance} • Model: {String(evalMeta.model)} • Temp: {String(evalMeta.temp)}
                  </div>
                )}
              </div>
              {evaluation && <EvaluationView text={evaluation} />}

              {/* Hooks spotted from Evaluation */}
              {spottedHooks.length ? (
                <div className="mt-4 border rounded p-3 bg-white">
                  <div className="text-sm font-medium mb-2">Hooks spotted</div>
                  <ul className="space-y-1">
                    {spottedHooks.map((h, i) => (
                      <li key={`${h}-${i}`} className="leading-6">
                        <span className="font-semibold">{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      onClick={() => navigator.clipboard.writeText(spottedHooks.join('\n'))}
                    >
                      Copy hooks
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {/* Create */}
          <section ref={createRef} className="mb-10">
            <SectionHead
              title="Create"
              metaRight={lastRun.create ? `Last run: ${fmtTime(lastRun.create)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => doCreateRoutes('CONSERVATIVE', 5)} loading={loadingCreate==='CONSERVATIVE'}>Conservative x5</Button>
                <Button onClick={() => doCreateRoutes('DISRUPTIVE', 7)} loading={loadingCreate==='DISRUPTIVE'}>Disruptive x7</Button>
                <Button variant="outline" onClick={() => doCreateRoutes('OUTRAGEOUS', 10)} loading={loadingCreate==='OUTRAGEOUS'}>Outrageous x10</Button>
              </div>
              {ideas && (
                <IdeaRoutes
                  campaignId={id}
                  text={ideas}
                  onSaved={() => reload()}
                />
              )}
            </div>
          </section>

          {/* Synthesis */}
          <section ref={synthRef} className="mb-10">
            <SectionHead
              title="Synthesis"
              metaRight={lastRun.synthesis ? `Last run: ${fmtTime(lastRun.synthesis)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex gap-2">
                <Button onClick={doSynthesis} loading={loadingSyn}>Run Synthesis</Button>
              </div>
              {synthesis ? (
                <RevealBlock markdown text={synthesis} />
              ) : null}
            </div>
          </section>

          {/* Heuristics */}
          <section className="mb-10">
            <SectionHead title="Heuristics" />
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium">Score Saved Routes</h3>
                <Button onClick={scoreHeuristics} loading={loadingHeu}>Score Saved Routes</Button>
              </div>
              {heuristics?.length ? (
                <div className="mt-3 space-y-3">
                  {heuristics.map(({ routeId, title, scorecard }) => (
                    <div key={routeId} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{title || routeId}</div>
                        <div className="text-sm">Total: <span className="font-semibold">{fmt(scorecard?.total)}/10</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600 mt-2">No scores yet. Click “Score Saved Routes”.</div>
              )}
            </div>
          </section>

          {/* Export */}
          <section ref={exportRef} className="mb-10">
            <SectionHead title="Export" />
            <div className="card">
              <ExportPanel artifacts={exports} onExport={doExport} />
            </div>
          </section>
        </div>
      </div>

      {/* Aside */}
      <aside className="w-[420px] border-l p-4 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Ask for Outputs</h3>
          <AskOutputs campaignId={id} onSaved={reload} />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Saved Outputs</h3>
          <SavedOutputsPanel campaignId={id} />
        </div>
      </aside>
    </div>
  )
}

function SectionHead({ title, metaRight }) {
  return (
    <div className="flex items-end justify-between mb-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {metaRight ? <div className="text-xs text-gray-500">{metaRight}</div> : null}
    </div>
  )
}

// Collapsible renderer; if markdown=true it renders via MarkdownBlock (so no raw ###)
function RevealBlock({ text, markdown = false }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div>
      <div className={`relative ${open ? '' : 'max-h-64 overflow-hidden'}`}>
        {!open && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />}
        {markdown ? (
          <MarkdownBlock text={text} className="border rounded-lg p-4 bg-white" />
        ) : (
          <div className="whitespace-pre-wrap border rounded p-3 bg-white">{text}</div>
        )}
      </div>
      <div className="mt-2">
        <button
          className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
        <button
          className="ml-2 text-sm px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => navigator.clipboard.writeText(text)}
        >
          Copy section
        </button>
      </div>
    </div>
  )
}

function fmt(x) {
  if (typeof x !== 'number') return '-'
  return x % 1 === 0 ? String(x) : x.toFixed(2)
}

// ——— helpers: extract hooks from Evaluation text (quoted lines & “Hook:” lines), deduped ———
function extractHooks(text = '') {
  if (!text) return []
  const out = new Set()

  // 1) Lines like: Hook: ...
  const rxHookLine = /^(?:\*\*)?\s*hook\s*:?\s*(.+)$/gim
  let m
  while ((m = rxHookLine.exec(text)) !== null) {
    pushHook(out, m[1])
  }

  // 2) Quoted phrases “like this” or "like this"
  const rxQuoted = /["“”]([^"“”]{2,100})["“”]/g
  while ((m = rxQuoted.exec(text)) !== null) {
    pushHook(out, m[1])
  }

  // Clean + limit
  const arr = Array.from(out).map(cleanHook).filter(Boolean)
  return arr.slice(0, 20)
}

function pushHook(set, raw) {
  const s = String(raw || '').trim()
  if (!s) return
  set.add(s)
}

function cleanHook(s) {
  let t = String(s || '')
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/^["“”'’]+|["“”'’]+$/g, '')
    .trim()
  // keep it tight
  const words = t.split(/\s+/)
  if (words.length < 2 || words.length > 14) return ''
  return t
}
