import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PromoBuilderCanvas from '../components/PromoBuilderCanvas.jsx'
import Button from '../components/Button.jsx'
import {
  createCampaign,
  listCampaigns,
  putBrief,
  getVariants,
  saveVariants as persistVariants,
  runVariantEvaluate,
} from '../lib/campaigns.js'
import {
  createEmptyWorkspace,
  workspaceHasEntries,
  workspaceToOverrides,
  specFromWorkspace,
  workspaceFromSpec,
} from '../utils/promoBuilderMapping.js'

const buildVariantId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`

const MODES = [
  { id: 'NEW', label: 'Create new campaign' },
  { id: 'ATTACH', label: 'Attach to existing campaign' },
]

export default function PromoBuilder() {
  const [seedSpec] = useState(() => {
    const raw = sessionStorage.getItem('sparkSeedSpec')
    if (!raw) return null
    sessionStorage.removeItem('sparkSeedSpec')
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })
  const [seedHooks] = useState(() => {
    const raw = sessionStorage.getItem('sparkSeedHooks')
    if (!raw) return null
    sessionStorage.removeItem('sparkSeedHooks')
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })
  const [seedSparkPayload] = useState(() => {
    const raw = sessionStorage.getItem('sparkSeedPayload')
    if (!raw) return null
    sessionStorage.removeItem('sparkSeedPayload')
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })
  const [workspace, setWorkspace] = useState(() =>
    seedSpec ? workspaceFromSpec(seedSpec) : createEmptyWorkspace()
  )
  const [mode, setMode] = useState('NEW')

  // New campaign fields
  const [clientName, setClientName] = useState(seedSpec?.client || '')
  const [brand, setBrand] = useState(seedSpec?.brand || '')
  const [campaignTitle, setCampaignTitle] = useState(
    seedSpec?.title || (seedSpec?.hook ? `${seedSpec.hook} concept` : '')
  )
  const [market, setMarket] = useState(seedSpec?.market || 'AU')
  const [category, setCategory] = useState(seedSpec?.category || '')

  // Existing campaign attachment
  const [campaigns, setCampaigns] = useState([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [campaignError, setCampaignError] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [variantName, setVariantName] = useState(
    seedSpec?.hook ? `${seedSpec.hook} alt` : ''
  )
  const [variantNotes, setVariantNotes] = useState('')

  // Status flags
  const [savingNew, setSavingNew] = useState(false)
  const [savingVariant, setSavingVariant] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [recentCampaignId, setRecentCampaignId] = useState('')
  const [seedNotice, setSeedNotice] = useState(Boolean(seedSpec))

  const hookOptions = useMemo(() => {
    const opts = seedHooks?.options
    if (!Array.isArray(opts)) return []
    return opts
      .map((opt) => ({
        headline: typeof opt?.headline === 'string' ? opt.headline : '',
        support: typeof opt?.support === 'string' ? opt.support : '',
      }))
      .filter((opt) => opt.headline)
      .slice(0, 5)
  }, [seedHooks])

  const cadenceIdeas = useMemo(() => {
    const lines = seedHooks?.cadence
    return Array.isArray(lines) ? lines.filter(Boolean).slice(0, 5) : []
  }, [seedHooks])

  const sparkInsights = useMemo(() => {
    const analysis = seedSparkPayload?.analysis
    if (!analysis) return null
    const summary = typeof analysis.summary === 'string' ? analysis.summary.trim() : ''
    const audience = typeof analysis.audience === 'string' ? analysis.audience.trim() : ''
    const cadenceNote =
      typeof analysis.cadence === 'string' ? analysis.cadence.trim() : (Array.isArray(analysis?.hook_playground?.cadence) ? analysis.hook_playground.cadence[0] : '')
    const valueLine =
      typeof analysis?.value?.description === 'string'
        ? analysis.value.description.trim()
        : (analysis?.value?.summary || '').toString().trim()
    const tensions = Array.isArray(analysis.tensions) ? analysis.tensions.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : []
    const compliance = Array.isArray(analysis.compliance) ? analysis.compliance.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : []
    const tradeReward = typeof analysis?.trade?.reward === 'string' ? analysis.trade.reward.trim() : ''
    const tradeGuardrail = typeof analysis?.trade?.guardrail === 'string' ? analysis.trade.guardrail.trim() : ''
    return {
      summary,
      audience,
      cadenceNote,
      valueLine,
      tensions,
      compliance,
      tradeReward,
      tradeGuardrail,
    }
  }, [seedSparkPayload])

  const sparkAssetPayload = useMemo(() => {
    if (seedSparkPayload) return seedSparkPayload
    if (seedHooks) return { hookPlayground: seedHooks }
    return null
  }, [seedSparkPayload, seedHooks])

  const navigate = useNavigate()
  const hasWorkspace = workspaceHasEntries(workspace)

  useEffect(() => {
    let ignore = false
    async function loadCampaigns() {
      setLoadingCampaigns(true)
      setCampaignError('')
      try {
        const list = await listCampaigns()
        if (!ignore) setCampaigns(Array.isArray(list) ? list : [])
      } catch (err) {
        if (!ignore) setCampaignError(err?.message || 'Failed to load campaigns')
      } finally {
        if (!ignore) setLoadingCampaigns(false)
      }
    }
    loadCampaigns()
    return () => { ignore = true }
  }, [])

  const selectedCampaignName = useMemo(() => {
    if (!selectedCampaign) return ''
    const hit = campaigns.find((c) => String(c.id) === String(selectedCampaign))
    return hit?.title || ''
  }, [campaigns, selectedCampaign])

  const resetStatus = () => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const ensureWorkspace = () => {
    if (hasWorkspace) return true
    setErrorMessage('Add at least one card before saving — builder outputs drive the spec.')
    return false
  }

  const buildBaselineSpec = () => {
    const spec = specFromWorkspace({}, workspace)
    return {
      ...spec,
      client: clientName || null,
      brand: brand || null,
      title: campaignTitle || `${brand || clientName || 'New'} concept`,
      market: market || null,
      category: category || null,
    }
  }

  const handleCreateCampaign = async () => {
    resetStatus()
    if (mode !== 'NEW') {
      setErrorMessage('Switch to “Create new campaign” to use this action.')
      return
    }
    if (!ensureWorkspace()) return
    if (!clientName.trim() || !brand.trim() || !campaignTitle.trim()) {
      setErrorMessage('Client, Brand, and Campaign Title are required to spin up a campaign.')
      return
    }
    const spec = buildBaselineSpec()
    setSavingNew(true)
    try {
      const payload = {
        clientName: clientName.trim(),
        title: campaignTitle.trim(),
        market: market.trim() || 'AU',
        category: category.trim() || null,
        mode: 'CREATE',
        startDate: null,
        endDate: null,
      }
      const campaign = await createCampaign(payload)
      const assetsPayload = sparkAssetPayload ? { __spark: sparkAssetPayload } : undefined
      await putBrief(campaign.id, {
        parsedJson: spec,
        rawText: null,
        ...(assetsPayload ? { assets: assetsPayload } : {}),
      })
      setRecentCampaignId(campaign.id)
      setSuccessMessage('Campaign created — opening War Room is the next step.')
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to create campaign')
    } finally {
      setSavingNew(false)
    }
  }

  const loadVariantsForCampaign = async (campaignId) => {
    try {
      const list = await getVariants(campaignId)
      return Array.isArray(list) ? list : []
    } catch (err) {
      throw new Error(err?.message || 'Failed to load variants')
    }
  }

  const saveVariantToCampaign = async ({ runEvaluation = false } = {}) => {
    resetStatus()
    if (mode !== 'ATTACH') {
      setErrorMessage('Switch to “Attach to existing campaign” to use this action.')
      return
    }
    if (!ensureWorkspace()) return
    if (!selectedCampaign) {
      setErrorMessage('Pick a campaign to attach this build to.')
      return
    }
    const overrides = workspaceToOverrides(workspace)
    if (!Object.keys(overrides).length) {
      setErrorMessage('No meaningful overrides were captured from the builder.')
      return
    }
    const name = variantName.trim() || 'Promo Builder concept'
    const notes = variantNotes.trim() || null
    const variant = {
      id: buildVariantId(),
      name,
      notes,
      overrides,
    }
    setSavingVariant(true)
    try {
      const existing = await loadVariantsForCampaign(selectedCampaign)
      const variantSaveOptions = sparkAssetPayload ? { spark: sparkAssetPayload } : undefined
      const saved = await persistVariants(selectedCampaign, [...existing, variant], variantSaveOptions)
      setSuccessMessage(`Saved ${name} to ${selectedCampaignName || 'campaign'}.`)
      setVariantName('')
      setVariantNotes('')
      if (runEvaluation) {
        await runVariantEvaluate(selectedCampaign, variant.id)
        setSuccessMessage(`Saved and kicked off Evaluation for ${name}. Check War Room for results.`)
      }
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to save variant')
    } finally {
      setSavingVariant(false)
    }
  }

  const goToRecentCampaign = () => {
    if (!recentCampaignId) return
    navigate(`/campaigns/${recentCampaignId}/war-room?phase=brief`)
  }

  const applyHookSuggestion = (hook) => {
    if (!hook?.headline) return
    setWorkspace((prev) =>
      prev.map((column) => {
        if (column.lane !== 'Hook') return column
        if (!column.entries.length) {
          return {
            ...column,
            entries: [
              {
                id: crypto.randomUUID(),
                cardId: 'hook-core',
                values: { headline: hook.headline, support: hook.support || '' },
              },
            ],
          }
        }
        const [first, ...rest] = column.entries
        return {
          ...column,
          entries: [
            {
              ...first,
              values: { ...(first.values || {}), headline: hook.headline, support: hook.support || '' },
            },
            ...rest,
          ],
        }
      })
    )
    setSeedNotice(false)
  }

  const applyCadenceSuggestion = (line) => {
    if (!line) return
    setWorkspace((prev) =>
      prev.map((column) => {
        if (column.lane !== 'Cadence') return column
        if (!column.entries.length) {
          return {
            ...column,
            entries: [
              {
                id: crypto.randomUUID(),
                cardId: 'cadence-instant',
                values: { cadence_copy: line, winner_vis: '' },
              },
            ],
          }
        }
        const [first, ...rest] = column.entries
        return {
          ...column,
          entries: [
            {
              ...first,
              values: { ...(first.values || {}), cadence_copy: line },
            },
            ...rest,
          ],
        }
      })
    )
    setSeedNotice(false)
  }

  const disableNewAction = savingNew || !hasWorkspace
  const disableVariantAction = savingVariant || !hasWorkspace

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Promo Builder</h1>
        <p className="text-sm text-gray-600">
          Build hooks, value ladders, mechanics, cadence and trade pieces visually. When it’s ready, either spin up a new
          campaign or drop it into an existing War Room as a variant.
        </p>
      </header>
      {seedNotice ? (
        <div className="border rounded bg-sky-50 text-sm text-sky-900 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span>Loaded a concept from Spark. Review the cards and then save or attach it.</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setSeedNotice(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <aside className="space-y-5">
          <div className="border rounded-lg p-4 bg-white space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase">Workflow</div>
            <div className="flex flex-col gap-2">
              {MODES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`text-left px-3 py-2 rounded border ${
                    mode === opt.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white'
                  }`}
                  onClick={() => { setMode(opt.id); resetStatus() }}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <p className="text-xs opacity-80">
                    {opt.id === 'NEW'
                      ? 'Create a fresh campaign and auto-fill the brief from this builder.'
                      : 'Attach this concept to an existing campaign as a variant.'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {(hookOptions.length || cadenceIdeas.length || sparkInsights) ? (
            <div className="spark-panel space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Spark primer</p>
                  <p className="text-lg font-semibold text-slate-900">Lock the promise before you riff</p>
                  <p className="text-sm text-slate-700/80">Keep these cues from Spark in sight while you shape the cards.</p>
                </div>
                <span className="spark-chip">
                  <span className="spark-chip__dot" />
                  Spark
                </span>
              </div>

              {sparkInsights ? (
                <div className="spark-grid md:grid-cols-2">
                  {sparkInsights.summary ? (
                    <div className="spark-card">
                      <h4>Summary</h4>
                      <p>{sparkInsights.summary}</p>
                    </div>
                  ) : null}
                  {sparkInsights.audience ? (
                    <div className="spark-card">
                      <h4>Audience</h4>
                      <p>{sparkInsights.audience}</p>
                    </div>
                  ) : null}
                  {sparkInsights.valueLine ? (
                    <div className="spark-card">
                      <h4>Value lens</h4>
                      <p>{sparkInsights.valueLine}</p>
                    </div>
                  ) : null}
                  {sparkInsights.cadenceNote ? (
                    <div className="spark-card">
                      <h4>Cadence</h4>
                      <p>{sparkInsights.cadenceNote}</p>
                    </div>
                  ) : null}
                  {sparkInsights.tensions?.length ? (
                    <div className="spark-card">
                      <h4>Shopper tensions</h4>
                      <ul>
                        {sparkInsights.tensions.map((line, idx) => (
                          <li key={`tension-${idx}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {sparkInsights.compliance?.length ? (
                    <div className="spark-card">
                      <h4>Compliance guardrails</h4>
                      <ul>
                        {sparkInsights.compliance.map((line, idx) => (
                          <li key={`compliance-${idx}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {(sparkInsights.tradeReward || sparkInsights.tradeGuardrail) ? (
                    <div className="spark-card">
                      <h4>Trade cue</h4>
                      <p>{[sparkInsights.tradeReward, sparkInsights.tradeGuardrail].filter(Boolean).join(' • ')}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {(hookOptions.length || cadenceIdeas.length) ? (
                <div className="spark-grid">
                  {hookOptions.map((hook, idx) => (
                    <div key={`${hook.headline}-${idx}`} className="spark-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4>Hook option</h4>
                          <p className="text-base font-semibold text-slate-900">{hook.headline}</p>
                          {hook.support ? <p className="text-xs text-slate-600 mt-1">{hook.support}</p> : null}
                        </div>
                        <Button variant="outline" onClick={() => applyHookSuggestion(hook)}>
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                  {cadenceIdeas.map((line, idx) => (
                    <div key={`${line}-${idx}`} className="spark-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4>Cadence riff</h4>
                          <p className="text-sm text-slate-900">{line}</p>
                        </div>
                        <Button variant="outline" onClick={() => applyCadenceSuggestion(line)}>
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === 'NEW' ? (
            <div className="border rounded-lg p-4 bg-white space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Campaign basics</div>
                <p className="text-xs text-gray-600">We only need these to stand up the War Room shell.</p>
              </div>
              <label className="block text-xs font-medium text-gray-600">Client / Company</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., Diageo"
              />
              <label className="block text-xs font-medium text-gray-600">Brand</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g., Guinness"
              />
              <label className="block text-xs font-medium text-gray-600">Campaign Title</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g., Golden Ticket Instant Wins"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Market</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    placeholder="AU"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Category</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Beer"
                  />
                </div>
              </div>
              <Button onClick={handleCreateCampaign} loading={savingNew} disabled={disableNewAction}>
                Create campaign from builder
              </Button>
              {recentCampaignId ? (
                <button
                  type="button"
                  className="text-xs text-sky-700 underline"
                  onClick={goToRecentCampaign}
                >
                  Open latest War Room →
                </button>
              ) : null}
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-white space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Attach to campaign</div>
                <p className="text-xs text-gray-600">Choose a campaign, name the variant, and we’ll handle the rest.</p>
              </div>
              <label className="block text-xs font-medium text-gray-600">Campaign</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
              >
                <option value="">Select…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              {loadingCampaigns && <div className="text-xs text-gray-500">Loading campaigns…</div>}
              {campaignError && <div className="text-xs text-red-600">{campaignError}</div>}
              <label className="block text-xs font-medium text-gray-600">Variant name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder="e.g., 1-in-3 Cashback Overlay"
              />
              <label className="block text-xs font-medium text-gray-600">Notes</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={2}
                value={variantNotes}
                onChange={(e) => setVariantNotes(e.target.value)}
                placeholder="Key tweaks vs baseline"
              />
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => saveVariantToCampaign({ runEvaluation: false })}
                  loading={savingVariant}
                  disabled={disableVariantAction || !selectedCampaign}
                >
                  Save as variant
                </Button>
                <Button
                  variant="outline"
                  onClick={() => saveVariantToCampaign({ runEvaluation: true })}
                  loading={savingVariant}
                  disabled={disableVariantAction || !selectedCampaign}
                >
                  Save & Run Evaluation
                </Button>
              </div>
            </div>
          )}

          {(errorMessage || successMessage) && (
            <div
              className={`text-xs border rounded px-3 py-2 ${
                errorMessage ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'
              }`}
            >
              {errorMessage || successMessage}
            </div>
          )}
        </aside>

        <main className="space-y-4">
          <div className="border rounded-lg bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Workspace</div>
                <p className="text-xs text-gray-600">
                  Drag in cards, reorder them, and flesh out the details. Everything here drives the spec we save.
                </p>
              </div>
              <Button variant="outline" onClick={() => setWorkspace(createEmptyWorkspace())}>
                Clear
              </Button>
            </div>
            <PromoBuilderCanvas
              workspace={workspace}
              onWorkspaceChange={setWorkspace}
              showSerialized
              showEvaluateButton
              embedded
            />
          </div>
        </main>
      </div>
    </div>
  )
}
