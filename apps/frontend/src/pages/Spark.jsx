import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { sparkIdea } from '../lib/campaigns.js'

const SAMPLE_PROMPTS = [
  'Vodafone wants to win students during O-Week with prepaid credit and zero-fuss signup.',
  'Guinness wants an instant-win on-premise promo that makes pubs feel alive nightly.',
  'Beko needs a winter cashback with a hero overlay for Harvey Norman and independents.',
]
const FOCUS_TEMPLATES = [
  'Compare a $50 guaranteed cashback versus a 1-in-3 chance at $150.',
  'Explore a daily instant win AND a weekly hero draw.',
  'Consider how to make retailers care (staff spiff vs credited stock).',
]

const formatValueSummary = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  const parts = []
  if (value.type) parts.push(value.type)
  if (value.amount != null) {
    const currency = value.currency || '$'
    parts.push(`${currency}${value.amount}`)
  }
  if (value.odds) parts.push(value.odds)
  if (value.assured !== undefined) parts.push(value.assured ? 'assured' : 'chance')
  return parts.filter(Boolean).join(' • ')
}

function SummaryGrid({ analysis }) {
  if (!analysis) return null
  const rows = [
    { label: 'Hook', value: analysis.hook },
    { label: 'Support', value: analysis.hook_support },
    { label: 'Mechanic', value: analysis.mechanic },
    { label: 'Value', value: analysis.value?.description || analysis.value?.summary || formatValueSummary(analysis.value) },
    { label: 'Cadence', value: analysis.cadence },
    { label: 'Hero prize', value: analysis.hero_prize },
    { label: 'Audience', value: analysis.audience },
  ].filter((row) => row.value)
  if (!rows.length) return null
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm font-semibold text-gray-900 mb-2">Concept snapshot</div>
      <dl className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">{row.label}</dt>
            <dd className="text-sm text-gray-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function InsightsBlock({ title, items }) {
  if (!Array.isArray(items) || !items.length) return null
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm font-semibold text-gray-900 mb-2">{title}</div>
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function VariantIdeas({ variants }) {
  if (!Array.isArray(variants) || !variants.length) return null
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm font-semibold text-gray-900 mb-2">Variant sparks</div>
      <div className="space-y-3">
        {variants.map((variant, idx) => (
          <div key={variant.name || idx} className="border rounded p-3 bg-slate-50">
            <div className="text-sm font-semibold text-gray-900">{variant.name || `Variant ${idx + 1}`}</div>
            {variant.summary ? <p className="text-sm text-gray-700 mt-1">{variant.summary}</p> : null}
            {variant.overrides ? (
              <pre className="mt-2 bg-slate-900 text-slate-100 text-xs rounded p-2 overflow-auto">{JSON.stringify(variant.overrides, null, 2)}</pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function HookPlaygroundPanel({ hookPlayground }) {
  if (!hookPlayground) return null
  const { options, cadence } = hookPlayground
  if ((!options || !options.length) && (!cadence || !cadence.length)) return null
  return (
    <div className="border rounded-lg p-4 bg-white space-y-3">
      <div className="text-sm font-semibold text-gray-900">Hook playground</div>
      {options?.length ? (
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={`${opt.headline}-${idx}`} className="border rounded p-2 bg-slate-50">
              <div className="text-sm font-semibold text-gray-900">{opt.headline}</div>
              {opt.support ? <div className="text-xs text-gray-700 mt-1">{opt.support}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {cadence?.length ? (
        <div>
          <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Cadence ideas</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
            {cadence.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export default function Spark() {
  const [ideaText, setIdeaText] = useState('')
  const [focusText, setFocusText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [info, setInfo] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event?.preventDefault()
    if (!ideaText.trim()) {
      setError('Describe the spark first.')
      return
    }
    setError('')
    setInfo('')
    setLoading(true)
    const payload = focusText.trim()
      ? `${ideaText.trim()}\n\nFocus:\n${focusText.trim()}`
      : ideaText.trim()

    try {
      const data = await sparkIdea(payload)
      setResult(data)
      setInfo('Trudy distilled the spark. Review and push it into the builder when ready.')
    } catch (err) {
      setResult(null)
      setError(err?.message || 'Failed to process idea')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenBuilder = () => {
    if (!result?.spec) {
      setError('Generate a spec first.')
      return
    }
    try {
      sessionStorage.setItem('sparkSeedSpec', JSON.stringify(result.spec))
      if (result.hookPlayground) {
        sessionStorage.setItem('sparkSeedHooks', JSON.stringify(result.hookPlayground))
      } else {
        sessionStorage.removeItem('sparkSeedHooks')
      }
      const sparkSeedPayload = {
        analysis: result.analysis ?? null,
        hookPlayground: result.hookPlayground ?? null,
        generatedAt: new Date().toISOString(),
      }
      sessionStorage.setItem('sparkSeedPayload', JSON.stringify(sparkSeedPayload))
      navigate('/promo-builder?spark=1')
    } catch {
      setError('Unable to hand off to Promo Builder.')
    }
  }

  const analysis = result?.analysis ?? null
  const summaryList = useMemo(() => {
    if (!analysis) return []
    return [
      analysis.summary,
      analysis.value?.reason,
      analysis.trade?.reward,
    ].filter(Boolean)
  }, [analysis])

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Spark</h1>
        <p className="text-sm text-gray-600">
          Paste a wish, a sketch, or a half-written brief. Trudy will snap it into a structured campaign concept, ready for the Promo Builder.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-xs font-semibold text-gray-600 uppercase">Describe the idea</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={10}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="e.g., Vodafone wants an O-Week instant win for prepaid that banks cashback toward student debt…"
            />
            <label className="block text-xs font-semibold text-gray-600 uppercase">What should Trudy explore or compare? (optional)</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={4}
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              placeholder="e.g., Compare a $50 guaranteed cashback vs a 1-in-3 $150 cash win."
            />
            <div className="flex flex-wrap gap-2 text-xs">
              {FOCUS_TEMPLATES.map((tpl) => (
                <button
                  type="button"
                  key={tpl}
                  className="px-2 py-1 rounded border border-dashed hover:bg-gray-50"
                  onClick={() => setFocusText(tpl)}
                >
                  {tpl}
                </button>
              ))}
            </div>
            <Button type="submit" loading={loading}>
              {loading ? 'Thinking…' : 'Generate concept'}
            </Button>
          </form>
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Need inspiration?</div>
            <ul className="space-y-1 text-sm text-gray-600">
              {SAMPLE_PROMPTS.map((sample) => (
                <li key={sample}>
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() => setIdeaText(sample)}
                  >
                    {sample}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div> : null}
          {info ? <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">{info}</div> : null}
        </div>

        {analysis ? (
          <div className="space-y-4">
            <SummaryGrid analysis={analysis} />
            <HookPlaygroundPanel hookPlayground={result?.hookPlayground} />
            <InsightsBlock
              title="Tensions & audience signals"
              items={
                Array.isArray(analysis.tensions)
                  ? analysis.tensions.filter(Boolean)
                  : (analysis.tensions ? [analysis.tensions] : [])
              }
            />
            <InsightsBlock
              title="Retailer reality"
              items={analysis.retailer_reality ? [analysis.retailer_reality] : []}
            />
            <VariantIdeas variants={analysis.variantIdeas} />
            <div className="border rounded-lg p-4 bg-slate-50 space-y-2">
              <div className="text-sm font-semibold text-gray-900">Next steps</div>
              <p className="text-sm text-gray-700">
                Push this spec into Promo Builder to refine the cards, create a campaign, or attach it as a variant.
              </p>
              <Button onClick={handleOpenBuilder}>Open in Promo Builder</Button>
              {summaryList.length ? (
                <div className="text-xs text-gray-600">
                  {summaryList.map((line, idx) => (
                    <div key={idx}>• {line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-slate-50 text-sm text-gray-500">
            Trudy will surface hooks, mechanics, odds, cadences, and starter variants here once you drop in an idea.
          </div>
        )}
      </div>
    </div>
  )
}
