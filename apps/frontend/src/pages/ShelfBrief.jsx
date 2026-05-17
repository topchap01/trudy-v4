import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../components/ui/toaster.jsx'
import Button from '../components/Button.jsx'
import { generateRoutes, evaluateIdea } from '../lib/shelf-api.js'
import { listCampaigns, getBrief } from '../lib/campaigns.js'

/* ── Job definitions from The Shelf ─────────────────────────────── */
const JOBS = [
  { id: 'BREAKER', label: 'Breaker', desc: 'Cold trial — get a stranger to try you for the first time.', color: 'red' },
  { id: 'CONVERTER', label: 'Converter', desc: 'Shelf switching — they are already buying the category, make them pick yours.', color: 'orange' },
  { id: 'BUILDER', label: 'Builder', desc: 'Build frequency — they buy once a month, make it once a week.', color: 'blue' },
  { id: 'LOADER', label: 'Loader', desc: 'Basket trade-up — increase what they spend per trip.', color: 'green' },
  { id: 'HARVESTER', label: 'Harvester', desc: 'Data capture — collect emails, insights, or preferences.', color: 'purple' },
  { id: 'KEEPER', label: 'Keeper', desc: 'Loyalty defence — stop them switching to a competitor.', color: 'amber' },
]

const JOB_COLORS = {
  red: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 dark:border-red-700',
  orange: 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-700',
  blue: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-700',
  green: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200 dark:border-green-700',
  purple: 'border-purple-500 bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-700',
  amber: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700',
}

const JOB_SELECTED = {
  red: 'ring-2 ring-red-500 bg-red-100 dark:bg-red-900',
  orange: 'ring-2 ring-orange-500 bg-orange-100 dark:bg-orange-900',
  blue: 'ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900',
  green: 'ring-2 ring-green-500 bg-green-100 dark:bg-green-900',
  purple: 'ring-2 ring-purple-500 bg-purple-100 dark:bg-purple-900',
  amber: 'ring-2 ring-amber-500 bg-amber-100 dark:bg-amber-900',
}

// Aligned with packages/heuristics/taxonomy.json mechanics array
const MECHANICS = [
  'Cashback',
  'Instant Win',
  'Prize Draw (Single)',
  'Prize Draw (Multi)',
  'GWP',
  'Bundle Deal',
  'Trade-In',
  'Extended Warranty',
  'Finance / Interest-Free',
  'Percentage Discount',
  'Competition',
  'Collect-to-Win',
  'Conditional',
  'Unique Code',
  '1-in-X',
  'Sweepstake',
  'Other',
]

const PROGRESS_MESSAGES = [
  'Researching category...',
  'Analysing competitive landscape...',
  'Consulting The Shelf...',
  'Generating routes...',
  'Scoring & ranking...',
]

/* ── Reusable form field components ─────────────────────────────── */
function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      {children}
    </label>
  )
}

function TextInput({ id, value, onChange, placeholder, required, type = 'text', min }) {
  return (
    <input
      id={id}
      type={type}
      min={min}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
    />
  )
}

function TextArea({ id, value, onChange, placeholder, required, rows = 3, minLength }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      rows={rows}
      minLength={minLength}
      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors resize-y"
    />
  )
}

/* ── Main component ─────────────────────────────────────────────── */
export default function ShelfBrief() {
  const navigate = useNavigate()

  // Mode: 1 = ideas, 2 = evaluate
  const [mode, setMode] = useState(null)

  // Shared fields
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [market, setMarket] = useState('Australia')
  const [retailers, setRetailers] = useState('')
  const [budget, setBudget] = useState('')

  // Mode 1 fields
  const [job, setJob] = useState(null)
  const [duration, setDuration] = useState('')
  const [constraints, setConstraints] = useState('')

  // Mode 2 fields
  const [description, setDescription] = useState('')
  const [mechanic, setMechanic] = useState('')
  const [headline, setHeadline] = useState('')
  const [evalJob, setEvalJob] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [prizeCount, setPrizeCount] = useState('')
  const [majorPrizeValue, setMajorPrizeValue] = useState('')
  const [totalPrizePool, setTotalPrizePool] = useState('')
  const [rewardDescription, setRewardDescription] = useState('')
  const [entryRequirement, setEntryRequirement] = useState('')

  // Existing campaigns
  const [existingCampaigns, setExistingCampaigns] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [loadingCampaignId, setLoadingCampaignId] = useState(null)

  useEffect(() => {
    // Show evaluations first — that's what most users will want to reload or view.
    // Falls back to all campaigns if the mode-filtered call fails for any reason.
    listCampaigns({ mode: 'EVALUATION' })
      .then(c => setExistingCampaigns(c || []))
      .catch(() => listCampaigns().then(c => setExistingCampaigns(c || [])).catch(() => {}))
  }, [])

  const loadCampaign = async (c) => {
    setLoadingCampaignId(c.id)
    // Reset all fields first
    setJob(null)
    setDuration('')
    setConstraints('')
    setDescription('')
    setMechanic('')
    setHeadline('')
    setBudget('')
    setRetailers('')

    // Load shared fields
    setBrand(c.clientName || c.brand || '')
    setCategory(c.category || '')
    setMarket(c.market || 'Australia')
    setShowPicker(false)

    // Fetch the full brief data (not included in list endpoint)
    let spec = {}
    try {
      const brief = await getBrief(c.id)
      if (brief) {
        let pj = brief.parsedJson
        if (typeof pj === 'string') { try { pj = JSON.parse(pj) } catch { pj = {} } }
        spec = pj || {}
      }
    } catch { /* brief may not exist */ }

    // Build a comprehensive description from the FULL brief spec
    // The more detail Claude gets, the better the evaluation
    const parts = [
      c.title && `Campaign: ${c.title}`,
      spec.client && `Client: ${spec.client}`,
      spec.brand && `Brand: ${spec.brand}`,
      spec.typeOfPromotion && `Promotion type: ${spec.typeOfPromotion}`,
      spec.hook && `Hook/headline: ${spec.hook}`,
      spec.mechanicOneLiner && `Mechanic: ${spec.mechanicOneLiner}`,
      spec.entryMechanic && `Entry method: ${spec.entryMechanic}`,
      spec.heroPrize && `Hero prize: ${spec.heroPrize}`,
      spec.heroPrizeCount && `Hero prize quantity: ${spec.heroPrizeCount}`,
      // Runner-up prizes — critical for prize ladder evaluation
      spec.runnerUps?.length && `Runner-up prizes: ${spec.runnerUps.join(', ')}`,
      spec.breadthPrizeCount && `Breadth prize count: ${spec.breadthPrizeCount}`,
      spec.totalWinners && `Total winners: ${spec.totalWinners}`,
      spec.prizePoolValue && `Total prize pool value: $${spec.prizePoolValue}`,
      // Budget & timing
      spec.primaryObjective && `Objective: ${spec.primaryObjective}`,
      spec.budgetBand && `Budget: ${spec.budgetBand}`,
      spec.startDate && spec.endDate && `Campaign period: ${spec.startDate} to ${spec.endDate}`,
      spec.calendarTheme && `Seasonal hook: ${spec.calendarTheme}`,
      // Cashback specifics
      spec.cashback?.amount && `Cashback amount: $${spec.cashback.amount}`,
      spec.cashback?.percent && `Cashback percent: ${spec.cashback.percent}%`,
      spec.cashback?.assured && 'Cashback is assured/guaranteed',
      // Audience
      spec.audienceSummary && `Target audience: ${spec.audienceSummary}`,
      spec.audienceAgeBand && `Age band: ${spec.audienceAgeBand}`,
      spec.audienceLifeStage && `Life stage: ${spec.audienceLifeStage}`,
      // Retail & compliance
      spec.retailerTags?.length && `Retailer channels: ${spec.retailerTags.map(t => t.replace('LIQUOR_', '').replace('_', ' ')).join(', ')}`,
      spec.regulatedCategory && 'Regulated category (age-gated)',
      spec.ageGate && 'Age gate required',
      spec.staffBurden && `Staff burden: ${spec.staffBurden}`,
      spec.proofType && `Proof of purchase: ${spec.proofType}`,
      // GWP
      spec.gwp?.item && `Gift with purchase: ${spec.gwp.item}`,
      // Rewards posture
      spec.rewardPosture && `Reward posture: ${spec.rewardPosture}`,
      // Media
      spec.media?.length && `Media channels: ${spec.media.join(', ')}`,
      // Brand position
      spec.brandPosture && `Brand position: ${spec.brandPosture}`,
    ].filter(Boolean)

    if (parts.length) {
      setDescription(parts.join('. ') + '.')
    } else {
      setDescription(`${c.title || 'Campaign'} for ${c.clientName || 'brand'} in ${c.category || 'category'}.`)
    }

    // Set retailers from retailerTags (e.g., LIQUOR_DAN_MURPHYS → Dan Murphys)
    const retailerList = spec.retailers?.length
      ? spec.retailers.filter(r => r && r.length > 1)
      : spec.retailerTags?.length
        ? spec.retailerTags.map(t => t.replace(/^LIQUOR_/, '').replace(/_/g, ' '))
        : []
    if (retailerList.length) {
      setRetailers(retailerList.join(', '))
    }
    if (spec.typeOfPromotion) {
      const t = spec.typeOfPromotion.toLowerCase()
      if (t.includes('cashback')) setMechanic('Cashback')
      else if (t.includes('instant')) setMechanic('Instant Win')
      else if (t.includes('gwp') || t.includes('gift')) setMechanic('GWP')
      else if (t.includes('draw') || t.includes('sweep')) setMechanic('Prize Draw')
      else if (t.includes('collect')) setMechanic('Collect-to-Win')
      else setMechanic('Other')
    }
    if (spec.hook) setHeadline(spec.hook)
    setMode(2)
    setLoadingCampaignId(null)
    toast.success(`Loaded "${c.title}" — review and evaluate.`)
  }

  // Loading
  const [loading, setLoading] = useState(false)
  const [progressIdx, setProgressIdx] = useState(0)

  /* Progress ticker */
  const startProgress = useCallback(() => {
    setProgressIdx(0)
    const iv = setInterval(() => {
      setProgressIdx(prev => {
        if (prev >= PROGRESS_MESSAGES.length - 1) { clearInterval(iv); return prev }
        return prev + 1
      })
    }, 2800)
    return () => clearInterval(iv)
  }, [])

  /* Submit Mode 1 */
  const handleGenerate = async e => {
    e.preventDefault()
    if (!job) { toast.error('Please select a Job from The Shelf.'); return }
    if (!brand.trim()) { toast.error('Brand is required.'); return }
    if (!category.trim()) { toast.error('Category is required.'); return }

    setLoading(true)
    const stopProgress = startProgress()
    try {
      const result = await generateRoutes({
        job,
        brand: brand.trim(),
        category: category.trim(),
        market: market.trim() || 'Australia',
        retailers: retailers.split(',').map(r => r.trim()).filter(Boolean),
        budget: budget ? Number(budget) : undefined,
        duration: duration ? Number(duration) : undefined,
        constraints: constraints.trim() || undefined,
      })
      const campaignId = result?.campaignId || result?.id || result?.campaign?.id
      if (!campaignId) {
        toast.error('No campaign ID returned. Check backend.')
        return
      }
      toast.success('Routes generated!')
      navigate(`/shelf/${campaignId}/routes?mode=1`, { state: { result } })
    } catch (err) {
      // toast already fired by shelf-api
    } finally {
      stopProgress()
      setLoading(false)
    }
  }

  /* Submit Mode 2 */
  const handleEvaluate = async e => {
    e.preventDefault()
    if (!brand.trim()) { toast.error('Brand is required.'); return }
    if (!category.trim()) { toast.error('Category is required.'); return }

    // Sufficiency hint (server enforces the same rule and will return NEEDS_INPUT)
    const hasRewardSignal = Boolean(rewardDescription.trim()) || majorPrizeValue || totalPrizePool || prizeCount
    const hasStructuredCore = Boolean(mechanic) && hasRewardSignal
    const ideaMeaty = description.trim().length >= 80
    if (!hasStructuredCore && !ideaMeaty) {
      toast.error('Brief needs a mechanic + reward signal, or a longer free-text description (~80+ chars).')
      return
    }

    setLoading(true)
    const stopProgress = startProgress()
    try {
      const result = await evaluateIdea({
        idea: description.trim() || undefined,
        brand: brand.trim(),
        category: category.trim(),
        market: market.trim() || 'Australia',
        retailers: retailers.split(',').map(r => r.trim()).filter(Boolean),
        budget: budget ? Number(budget) : undefined,
        mechanic: mechanic || undefined,
        oneJob: evalJob || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        prizeCount: prizeCount ? Number(prizeCount) : undefined,
        majorPrizeValue: majorPrizeValue ? Number(majorPrizeValue) : undefined,
        totalPrizePool: totalPrizePool ? Number(totalPrizePool) : undefined,
        rewardDescription: rewardDescription.trim() || undefined,
        entryRequirement: entryRequirement.trim() || undefined,
        headline: headline.trim() || undefined,
      })
      const campaignId = result?.campaignId || result?.id || result?.campaign?.id
      if (!campaignId) {
        toast.error('No campaign ID returned. Check backend.')
        return
      }
      toast.success('Evaluation complete!')
      navigate(`/shelf/${campaignId}/routes?mode=2`, { state: { result } })
    } catch (err) {
      // toast already fired
    } finally {
      stopProgress()
      setLoading(false)
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            The Shelf
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">
            Trudy's promotion strategy engine — powered by Provocateur + Pragmatist logic.
          </p>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {/* Mode 1 */}
          <button
            type="button"
            onClick={() => { setMode(1); setLoading(false) }}
            className={`relative rounded-xl border-2 p-6 text-left transition-all cursor-pointer
              ${mode === 1
                ? 'border-sky-600 bg-sky-50 dark:bg-sky-950 ring-2 ring-sky-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-sky-300 dark:hover:border-sky-700'}`}
          >
            <span className="text-2xl mb-2 block">💡</span>
            <span className="text-lg font-semibold text-gray-900 dark:text-white block">I need ideas</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">
              Tell Trudy what you need and she will generate scored promotion routes.
            </span>
            {mode === 1 && (
              <span className="absolute top-3 right-3 h-3 w-3 rounded-full bg-sky-600" />
            )}
          </button>

          {/* Mode 2 */}
          <button
            type="button"
            onClick={() => { setMode(2); setLoading(false) }}
            className={`relative rounded-xl border-2 p-6 text-left transition-all cursor-pointer
              ${mode === 2
                ? 'border-amber-600 bg-amber-50 dark:bg-amber-950 ring-2 ring-amber-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-amber-300 dark:hover:border-amber-700'}`}
          >
            <span className="text-2xl mb-2 block">🔍</span>
            <span className="text-lg font-semibold text-gray-900 dark:text-white block">Evaluate my idea</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">
              Already have a concept? Trudy will score it, find gaps, and suggest fixes.
            </span>
            {mode === 2 && (
              <span className="absolute top-3 right-3 h-3 w-3 rounded-full bg-amber-600" />
            )}
          </button>
        </div>

        {/* Existing campaigns picker — recent evaluations */}
        {existingCampaigns.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPicker(!showPicker)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
              >
                {showPicker ? 'Hide' : `Recent evaluations (${existingCampaigns.length})`} &rarr;
              </button>
              <button
                type="button"
                onClick={() => navigate('/shelf/history')}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
              >
                View all in history →
              </button>
            </div>
            {showPicker && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
                {existingCampaigns.map(c => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-sky-300 dark:hover:border-sky-700 transition-colors flex flex-col gap-2"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 block truncate">
                        {c.title}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5 truncate">
                        {c.clientName || 'No client'} &middot; {c.category || 'No category'}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/shelf/${c.id}/routes`)}
                        className="flex-1 text-xs px-2 py-1.5 rounded border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors"
                      >
                        View verdict
                      </button>
                      <button
                        type="button"
                        disabled={loadingCampaignId === c.id}
                        onClick={() => loadCampaign(c)}
                        className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {loadingCampaignId === c.id ? 'Loading…' : 'Re-run brief'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center mb-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600 mb-4" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
              {PROGRESS_MESSAGES[progressIdx]}
            </p>
          </div>
        )}

        {/* ── Mode 1 Form ──────────────────────────────────────── */}
        {mode === 1 && !loading && (
          <form onSubmit={handleGenerate} className="space-y-6">
            {/* Job selector */}
            <div>
              <Label>What Job does this promotion need to do?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                {JOBS.map(j => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setJob(j.id)}
                    className={`rounded-lg border-2 p-3 text-left transition-all text-sm
                      ${JOB_COLORS[j.color]}
                      ${job === j.id ? JOB_SELECTED[j.color] : 'opacity-80 hover:opacity-100'}`}
                  >
                    <span className="font-semibold block">{j.label}</span>
                    <span className="text-xs mt-0.5 block opacity-80">{j.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Brand + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="brand">Brand *</Label>
                <TextInput id="brand" value={brand} onChange={setBrand} placeholder="e.g. Cadbury" required />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <TextInput id="category" value={category} onChange={setCategory} placeholder="e.g. Chocolate confectionery" required />
              </div>
            </div>

            {/* Market + Retailers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="market">Market</Label>
                <TextInput id="market" value={market} onChange={setMarket} placeholder="Australia" />
              </div>
              <div>
                <Label htmlFor="retailers">Retailers</Label>
                <TextInput id="retailers" value={retailers} onChange={setRetailers} placeholder="Woolworths, Coles, Chemist Warehouse" />
              </div>
            </div>

            {/* Budget + Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="budget">Budget (AUD)</Label>
                <TextInput id="budget" type="number" min="0" value={budget} onChange={setBudget} placeholder="Optional" />
              </div>
              <div>
                <Label htmlFor="duration">Duration (days)</Label>
                <TextInput id="duration" type="number" min="1" value={duration} onChange={setDuration} placeholder="Optional" />
              </div>
            </div>

            {/* Constraints */}
            <div>
              <Label htmlFor="constraints">Constraints or notes</Label>
              <TextArea id="constraints" value={constraints} onChange={setConstraints} placeholder="Any guardrails, legal requirements, retailer restrictions..." rows={3} />
            </div>

            <div className="pt-2">
              <Button type="submit" size="lg" className="w-full sm:w-auto">
                Generate Routes
              </Button>
            </div>
          </form>
        )}

        {/* ── Mode 2 Form ──────────────────────────────────────── */}
        {mode === 2 && !loading && (
          <form onSubmit={handleEvaluate} className="space-y-8">

            {/* ── Section 1: Brand + market context ─────────────── */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Brand &amp; market</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="brand2">Brand *</Label>
                  <TextInput id="brand2" value={brand} onChange={setBrand} placeholder="e.g. Beko" required />
                </div>
                <div>
                  <Label htmlFor="category2">Category *</Label>
                  <TextInput id="category2" value={category} onChange={setCategory} placeholder="e.g. Kitchen appliances" required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="market2">Market</Label>
                  <TextInput id="market2" value={market} onChange={setMarket} placeholder="Australia" />
                </div>
                <div>
                  <Label htmlFor="retailers2">Retailers</Label>
                  <TextInput id="retailers2" value={retailers} onChange={setRetailers} placeholder="Harvey Norman, The Good Guys, JB Hi-Fi" />
                </div>
              </div>
            </section>

            {/* ── Section 2: Campaign structure ─────────────────── */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Campaign structure</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Trudy needs at minimum a <strong>mechanic</strong> plus a <strong>reward signal</strong> (description, prize value, prize count, or pool) to produce a real evaluation. The richer the brief, the sharper the verdict.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mechanic">Mechanic</Label>
                  <select
                    id="mechanic"
                    value={mechanic}
                    onChange={e => setMechanic(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  >
                    <option value="">Select mechanic...</option>
                    {MECHANICS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="evalJob">Job (what should the promo do?)</Label>
                  <select
                    id="evalJob"
                    value={evalJob}
                    onChange={e => setEvalJob(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  >
                    <option value="">Select job...</option>
                    {JOBS.map(j => <option key={j.id} value={j.id}>{j.label} — {j.desc}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start date</Label>
                  <TextInput id="startDate" type="date" value={startDate} onChange={setStartDate} />
                </div>
                <div>
                  <Label htmlFor="endDate">End date</Label>
                  <TextInput id="endDate" type="date" value={endDate} onChange={setEndDate} />
                </div>
              </div>

              <div>
                <Label htmlFor="rewardDescription">Reward — short description</Label>
                <TextInput id="rewardDescription" value={rewardDescription} onChange={setRewardDescription} placeholder="e.g. Tiered cashback up to $1,000 on bundles over $5,000" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="prizeCount">Number of prizes</Label>
                  <TextInput id="prizeCount" type="number" min="0" value={prizeCount} onChange={setPrizeCount} placeholder="e.g. 50" />
                </div>
                <div>
                  <Label htmlFor="majorPrizeValue">Major prize value (AUD)</Label>
                  <TextInput id="majorPrizeValue" type="number" min="0" value={majorPrizeValue} onChange={setMajorPrizeValue} placeholder="e.g. 10000" />
                </div>
                <div>
                  <Label htmlFor="totalPrizePool">Total prize pool (AUD)</Label>
                  <TextInput id="totalPrizePool" type="number" min="0" value={totalPrizePool} onChange={setTotalPrizePool} placeholder="e.g. 50000" />
                </div>
              </div>

              <div>
                <Label htmlFor="entryRequirement">Entry requirement — what does the shopper have to do?</Label>
                <TextArea
                  id="entryRequirement"
                  value={entryRequirement}
                  onChange={setEntryRequirement}
                  placeholder="e.g. Buy 2+ Beko appliances in a single transaction, upload receipt at bekobundle.com.au within 30 days"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="headline">Headline — what is on the pack?</Label>
                <TextInput id="headline" value={headline} onChange={setHeadline} placeholder="e.g. Win up to $1,000 cashback when you bundle 2+ appliances" />
              </div>

              <div>
                <Label htmlFor="budget2">Working budget (AUD)</Label>
                <TextInput id="budget2" type="number" min="0" value={budget} onChange={setBudget} placeholder="Optional — total media + prize + ops budget" />
              </div>
            </section>

            {/* ── Section 3: Additional context (free-text) ───── */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Additional context (optional)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Anything the structured fields can't capture — client objectives, strategic intent, retailer history, prior campaign learnings, creative thinking, constraints. Becomes <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 rounded">&lt;additional_context&gt;</code> in the brief.
              </p>
              <TextArea
                id="description"
                value={description}
                onChange={setDescription}
                placeholder="Optional — anything else worth Trudy knowing about the campaign, the client, or the moment..."
                rows={4}
              />
            </section>

            <div className="pt-2">
              <Button type="submit" size="lg" className="w-full sm:w-auto bg-amber-600 border-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 focus:ring-amber-500">
                Evaluate This Idea
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
