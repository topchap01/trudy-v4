import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { toast } from '../components/ui/toaster.jsx'
import Button from '../components/Button.jsx'
import { getShelfEvaluation } from '../lib/campaigns.js'

/* ── Colour maps ────────────────────────────────────────────────── */
const JOB_BADGE = {
  BREAKER: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CONVERTER: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  BUILDER: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  LOADER: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  HARVESTER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  KEEPER: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

const VERDICT_STYLE = {
  GO: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700',
  REWORK: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700',
  KILL: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
}

/* ── Score bar ──────────────────────────────────────────────────── */
function ScoreBar({ label, value, max = 10, color = 'sky' }) {
  const pct = Math.min(100, (value / max) * 100)
  const colors = {
    sky: 'bg-sky-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-600 dark:text-gray-400 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colors[color] || colors.sky}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-gray-700 dark:text-gray-300 font-medium">{value}</span>
    </div>
  )
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

/* ── Creative Director: lens-tagged headline card ──────────────── */
const LENS_STYLE = {
  TRANSACTIONAL:   { label: 'Transactional',   chip: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  CULTURAL_MOMENT: { label: 'Cultural Moment', chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200' },
  BRAND_TRUTH:     { label: 'Brand Truth',     chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  EMOTIONAL_JOB:   { label: 'Emotional Job',   chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
  WILDCARD:        { label: 'Wildcard',        chip: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200' },
}

function HeadlineAngleCard({ angle }) {
  const lens = LENS_STYLE[angle.lens] || LENS_STYLE.TRANSACTIONAL
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Badge className={lens.chip}>{lens.label}</Badge>
        {angle.pilot && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{angle.pilot}</Badge>}
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{angle.headline}</p>
      {angle.subhead && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{angle.subhead}</p>}
      {angle.rationale && <p className="text-xs text-gray-500 dark:text-gray-500 italic mt-2">{angle.rationale}</p>}
    </div>
  )
}

/* ── Ambition zone badge (SAFE / BOLD / RIDICULOUS) ────────────── */
const AMBITION_STYLE = {
  SAFE:       'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300',
  BOLD:       'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-400',
  RIDICULOUS: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200 border-fuchsia-400',
}
// Left-edge stripe colour per zone — surfaces the SAFE/BOLD/RIDICULOUS spread at a glance
const AMBITION_STRIPE = {
  SAFE:       'border-l-4 border-l-slate-400 dark:border-l-slate-500',
  BOLD:       'border-l-4 border-l-amber-500 dark:border-l-amber-400',
  RIDICULOUS: 'border-l-4 border-l-fuchsia-500 dark:border-l-fuchsia-400',
}
function AmbitionBadge({ zone }) {
  if (!zone) return null
  const cls = AMBITION_STYLE[zone] || AMBITION_STYLE.SAFE
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${cls}`}>{zone}</span>
}

/* ── Route Card (Mode 1) ───────────────────────────────────────── */
function RouteCard({ route, onSelect }) {
  const threeSecond = route.threeSecondScore || route.three_second_score || {}
  const msg = route.messageHierarchy || route.message_hierarchy || {}
  const provocateur = route.provocateur || {}
  const pragmatist = route.pragmatist || {}

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{route.name || route.routeName || 'Untitled Route'}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {route.job && <Badge className={JOB_BADGE[route.job] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}>{route.job}</Badge>}
            {route.mechanic && <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">{route.mechanic}</Badge>}
            {route.pilot && <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200">{route.pilot}</Badge>}
          </div>
        </div>
        <Button size="sm" onClick={() => onSelect(route)}>
          Select for Stress Test
        </Button>
      </div>

      {/* Concept */}
      {route.concept && (
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{route.concept}</p>
      )}

      {/* 3-Second Score */}
      {(threeSecond.reward != null || threeSecond.belief != null || threeSecond.friction != null) && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">3-Second Score</p>
          {threeSecond.reward != null && <ScoreBar label="Reward" value={threeSecond.reward} color="green" />}
          {threeSecond.belief != null && <ScoreBar label="Belief" value={threeSecond.belief} color="sky" />}
          {threeSecond.friction != null && <ScoreBar label="Friction" value={threeSecond.friction} color="red" />}
        </div>
      )}

      {/* Message Hierarchy */}
      {(msg.headline || msg.subline) && (
        <div className="border-l-4 border-sky-500 pl-4">
          {msg.headline && <p className="text-base font-bold text-gray-900 dark:text-white">{msg.headline}</p>}
          {msg.subline && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{msg.subline}</p>}
        </div>
      )}

      {/* Provocateur + Pragmatist scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {provocateur.score != null && (
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase">Provocateur</span>
              <span className="text-sm font-bold text-orange-800 dark:text-orange-200">{provocateur.score}/10</span>
            </div>
            {provocateur.note && <p className="text-xs text-orange-600 dark:text-orange-400">{provocateur.note}</p>}
          </div>
        )}
        {pragmatist.score != null && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase">Pragmatist</span>
              <span className="text-sm font-bold text-blue-800 dark:text-blue-200">{pragmatist.score}/10</span>
            </div>
            {pragmatist.note && <p className="text-xs text-blue-600 dark:text-blue-400">{pragmatist.note}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Evaluation Verdict (Mode 2) ───────────────────────────────── */
function EvaluationResult({ data }) {
  // Handle both camelCase and snake_case, and both nested and flat structures
  const verdictStr = typeof data.verdict === 'string' ? data.verdict : (data.verdict?.verdict || data.verdict_label || '')
  const verdictRationale = data.verdictRationale || data.verdict_rationale || (typeof data.verdict === 'object' ? data.verdict?.rationale : '') || ''
  const killSheet = data.killSheet || data.kill_sheet || {}
  const threeSecond = data.threeSecondScore || data.three_second_score || data.threeSecondEquation || {}
  const msgObj = data.messageHierarchy || data.message_hierarchy || {}
  const msg = typeof msgObj === 'object' && msgObj.improved ? msgObj.improved : msgObj
  const retailerReadiness = data.retailerReadiness || data.retailer_readiness || data.retailerPitch || {}
  const alternativeRoutes = data.alternativeRoutes || data.alternative_routes || []
  const whatWorks = data.whatWorks || data.what_works || []
  const whatBreaks = (data.whatBreaks || data.what_breaks || []).filter(b => typeof b === 'string' || (b && b.issue))
  const whatToChange = (data.whatToChange || data.what_to_change || []).filter(c => typeof c === 'string' ? !c.startsWith('[Provocateur]') : true) // Filter out legacy Provocateur injections
  const oneJob = data.oneJob || data.one_job || ''
  const oneJobIssue = data.oneJobIssue || data.one_job_issue || ''
  const frictionAudit = data.frictionAudit || data.friction_audit || null
  // Reclassification — when the score signals contradicted a KILL verdict
  const reclassification = data.reclassification || null
  // Provocateur, Pragmatist, Creative Director as separate voices
  const provocateur = data.provocateur || {}
  const pragmatist = data.pragmatist || {}
  const creativeDirector = data.creativeDirector || data.creative_director || {}
  const headlineAngles = Array.isArray(creativeDirector.headlineAngles) ? creativeDirector.headlineAngles : []
  const signatureMoment = creativeDirector.signatureMoment || creativeDirector.signature_moment || ''
  const threeSecondInterpretation = threeSecond.interpretation || threeSecond.narrative || ''
  const msgCurrent = msgObj.current || null
  const msgImproved = msgObj.improved || msg
  const approvalRationale = retailerReadiness.approvalRationale || retailerReadiness.approval_rationale || ''

  return (
    <div className="space-y-8">
      {/* Verdict badge */}
      <div className="text-center">
        <Badge className={`text-2xl px-6 py-2 border-2 font-bold ${VERDICT_STYLE[verdictStr] || VERDICT_STYLE.REWORK}`}>
          {verdictStr || 'PENDING'}
        </Badge>
        {verdictRationale && (
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {verdictRationale}
          </p>
        )}
        {reclassification && (
          <div className="mt-4 mx-auto max-w-2xl rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Reclassified</span>
              <span className="text-xs text-amber-700 dark:text-amber-300">{reclassification.from} → {reclassification.to}</span>
            </div>
            <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{reclassification.rationale}</p>
          </div>
        )}
        {oneJob && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Detected Job: <span className="font-medium text-gray-700 dark:text-gray-300">{oneJob}</span>
            {oneJobIssue && <span className="ml-2 text-amber-600 dark:text-amber-400">— {oneJobIssue}</span>}
          </p>
        )}
      </div>

      {/* What Works */}
      {whatWorks.length > 0 && (
        <Section title="What Works">
          <ul className="space-y-2">
            {whatWorks.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                <span className="text-gray-700 dark:text-gray-300">{typeof item === 'string' ? item : item.point || item.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* What Breaks */}
      {whatBreaks.length > 0 && (
        <Section title="What Breaks">
          <ul className="space-y-3">
            {whatBreaks.map((item, i) => {
              // Schema is { issue, shelfReference, fix }. Older outputs used point/text/shelfRef.
              const issueText = typeof item === 'string' ? item : (item.issue || item.point || item.text || '')
              const shelfRef = item.shelfReference || item.shelfRef || ''
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5 shrink-0">&#10007;</span>
                  <div>
                    {issueText && <span className="text-gray-700 dark:text-gray-300">{issueText}</span>}
                    {shelfRef && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 italic">Shelf: {shelfRef}</span>}
                    {item.fix && <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">Fix: {item.fix}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* What to Change */}
      {whatToChange.length > 0 && (
        <Section title="What to Change">
          <ol className="space-y-2 list-decimal list-inside">
            {whatToChange.map((item, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                {typeof item === 'string' ? item : item.action || item.text}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Kill Sheet */}
      {killSheet && (Array.isArray(killSheet) ? killSheet.length > 0 : Object.keys(killSheet).length > 0) && (
        <Section title="Kill Sheet">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Array.isArray(killSheet) ? killSheet : Object.entries(killSheet)
              .filter(([k]) => !['failCount', 'passCount', 'verdict'].includes(k))
              .map(([key, val]) => {
                if (typeof val === 'string') {
                  const isPass = val.toUpperCase().startsWith('PASS')
                  return { check: key, pass: isPass, note: val }
                }
                if (typeof val === 'object' && val !== null) {
                  return { check: key, pass: Boolean(val.pass), note: val.note || '' }
                }
                return { check: key, pass: false, note: String(val || '') }
              })
            ).filter(Boolean).map((item, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm
                  ${item.pass
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                    : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{item.check || `Check ${i + 1}`}</span>
                  <Badge className={item.pass
                    ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                    : 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'}>
                    {item.pass ? 'PASS' : 'FAIL'}
                  </Badge>
                </div>
                {item.note && <p className="text-xs text-gray-500 dark:text-gray-400">{item.note}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 3-Second Score — with scale context and interpretation */}
      {(threeSecond.reward != null || threeSecond.belief != null || threeSecond.friction != null) && (
        <Section title="3-Second Equation">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Conversion = (Reward × Belief) ÷ Friction. Each scored 1-10 where 10 is optimal.</p>
          <div className="space-y-3 max-w-lg">
            {threeSecond.reward != null && (
              <div>
                <ScoreBar label="Reward" value={threeSecond.reward} color="green" />
                {threeSecond.rewardNote && <p className="text-xs text-gray-500 dark:text-gray-400 ml-[5.5rem] mt-0.5">{threeSecond.rewardNote}</p>}
              </div>
            )}
            {threeSecond.belief != null && (
              <div>
                <ScoreBar label="Belief" value={threeSecond.belief} color="sky" />
                {threeSecond.beliefNote && <p className="text-xs text-gray-500 dark:text-gray-400 ml-[5.5rem] mt-0.5">{threeSecond.beliefNote}</p>}
              </div>
            )}
            {threeSecond.friction != null && (
              <div>
                <ScoreBar label="Friction" value={threeSecond.friction} color="red" />
                {threeSecond.frictionNote && <p className="text-xs text-gray-500 dark:text-gray-400 ml-[5.5rem] mt-0.5">{threeSecond.frictionNote}</p>}
              </div>
            )}
          </div>
          {threeSecondInterpretation && (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3">
              {threeSecondInterpretation}
            </p>
          )}
        </Section>
      )}

      {/* Budget scenarios were removed — they were confidently-precise fiction
          without grounding in actual media spend, audience size, or store distribution.
          The Pragmatist's note carries narrative cost reasoning instead. */}

      {/* Message Hierarchy — current vs improved */}
      {(msgImproved?.headline || msgCurrent?.headline) && (
        <Section title="Message Hierarchy">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">What the shopper sees in 3 seconds: TRIGGER WORD → PRIZE → QUANTITY → ODDS → COST TO ENTER</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {msgCurrent?.headline && (
              <div className="border-l-4 border-gray-300 dark:border-gray-600 pl-4">
                <span className="text-xs font-semibold text-gray-400 uppercase">Current</span>
                <p className="text-base font-bold text-gray-600 dark:text-gray-400 mt-1">{msgCurrent.headline}</p>
                {msgCurrent.shelfBreakScore != null && <p className="text-xs text-gray-400 mt-1">Shelf-break score: {msgCurrent.shelfBreakScore}/10</p>}
              </div>
            )}
            {msgImproved?.headline && (
              <div className="border-l-4 border-sky-500 pl-4">
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase">Improved</span>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{msgImproved.headline}</p>
                {msgImproved.subline && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{msgImproved.subline}</p>}
                {msgImproved.packCopy && <p className="text-xs text-gray-400 mt-2">Pack: {msgImproved.packCopy}</p>}
                {msgImproved.staffLine && <p className="text-xs text-gray-400">Staff: {msgImproved.staffLine}</p>}
                {msgImproved.shelfBreakScore != null && <p className="text-xs text-sky-500 mt-1">Shelf-break score: {msgImproved.shelfBreakScore}/10</p>}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Retailer Readiness */}
      {retailerReadiness && Object.keys(retailerReadiness).length > 0 && (
        <Section title="Retailer Readiness">
          {retailerReadiness.wouldCategoryManagerSayYes != null && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-lg ${retailerReadiness.wouldCategoryManagerSayYes ? 'text-green-600' : 'text-red-600'}`}>
                  {retailerReadiness.wouldCategoryManagerSayYes ? '✓' : '✗'}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {retailerReadiness.wouldCategoryManagerSayYes ? 'Category manager would likely approve' : 'Category manager would likely push back'}
                </span>
              </div>
              {approvalRationale && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 ml-7">{approvalRationale}</p>
              )}
            </div>
          )}
          {Array.isArray(retailerReadiness.risks) && retailerReadiness.risks.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase">Risks</span>
              <ul className="mt-1 space-y-1">
                {retailerReadiness.risks.map((r, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">!</span>
                    <span>{typeof r === 'string' ? r : r.risk || r.text || JSON.stringify(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {retailerReadiness.pitch && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">S.O.S. Pitch</span>
              {retailerReadiness.pitch.simple && <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Simple:</strong> {retailerReadiness.pitch.simple}</p>}
              {retailerReadiness.pitch.operational && <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Operational:</strong> {retailerReadiness.pitch.operational}</p>}
              {retailerReadiness.pitch.sales && <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Sales:</strong> {retailerReadiness.pitch.sales}</p>}
            </div>
          )}
        </Section>
      )}

      {/* Provocateur + Pragmatist — separate voice sections */}
      {(provocateur.note || pragmatist.note) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {provocateur.note && (
            <Section title="The Provocateur">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase">Creative Challenge</span>
                {provocateur.score != null && <span className="text-sm font-bold text-orange-700 dark:text-orange-300">{provocateur.score}/10</span>}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{provocateur.note}</p>
            </Section>
          )}
          {pragmatist.note && (
            <Section title="The Pragmatist">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Commercial Reality</span>
                {pragmatist.score != null && <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{pragmatist.score}/10</span>}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{pragmatist.note}</p>
            </Section>
          )}
        </div>
      )}

      {/* Creative Director — 5 distinctly-positioned headlines + signature moment */}
      {(headlineAngles.length > 0 || signatureMoment || creativeDirector.note) && (
        <Section title="The Creative Director">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400 uppercase">Headline Craft</span>
            {creativeDirector.score != null && <span className="text-sm font-bold text-fuchsia-700 dark:text-fuchsia-300">{creativeDirector.score}/10</span>}
          </div>
          {creativeDirector.note && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{creativeDirector.note}</p>
          )}
          {headlineAngles.length > 0 && (
            <div className="space-y-3 mb-4">
              {headlineAngles.map((angle, i) => (
                <HeadlineAngleCard key={i} angle={angle} />
              ))}
            </div>
          )}
          {signatureMoment && (
            <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase mb-1">Signature Moment</div>
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{signatureMoment}</p>
            </div>
          )}
        </Section>
      )}

      {/* Friction Audit */}
      {frictionAudit && (frictionAudit.rationale || frictionAudit.fieldsToRemove?.length || frictionAudit.fieldsToAdd?.length) && (
        <Section title="Friction Audit">
          <div className="flex items-center gap-3 mb-3">
            {frictionAudit.currentLevel && (
              <span className="text-sm text-gray-600 dark:text-gray-400">Current: <strong>{frictionAudit.currentLevel}</strong></span>
            )}
            {frictionAudit.optimalLevel && (
              <>
                <span className="text-gray-300 dark:text-gray-600">→</span>
                <span className="text-sm text-sky-600 dark:text-sky-400">Optimal: <strong>{frictionAudit.optimalLevel}</strong></span>
              </>
            )}
          </div>
          {frictionAudit.rationale && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{frictionAudit.rationale}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {frictionAudit.fieldsToRemove?.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-red-500 uppercase">Remove</span>
                <ul className="mt-1 space-y-0.5">
                  {frictionAudit.fieldsToRemove.map((f, i) => (
                    <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <span className="text-red-400">−</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {frictionAudit.fieldsToAdd?.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-green-500 uppercase">Add</span>
                <ul className="mt-1 space-y-0.5">
                  {frictionAudit.fieldsToAdd.map((f, i) => (
                    <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <span className="text-green-400">+</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Alternative Routes — generated on REWORK and KILL alike */}
      {alternativeRoutes.length > 0 && (
        <Section title="Alternative Routes">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            {verdictStr === 'KILL'
              ? 'Three routes that preserve the concept\'s creative merit while routing around the blockers the Pragmatist flagged. Each occupies a distinct ambition zone.'
              : 'Three routes across the ambition spectrum — each keeps what works, fixes what breaks, and proposes its own creative range.'}
          </p>
          <div className="space-y-6">
            {alternativeRoutes.map((alt, i) => {
              const altAngles = Array.isArray(alt.headlineAngles) ? alt.headlineAngles : (Array.isArray(alt.headline_angles) ? alt.headline_angles : [])
              const altSignature = alt.signatureMoment || alt.signature_moment || ''
              const altZone = alt.ambitionZone || alt.ambition_zone || null
              const stripe = altZone ? (AMBITION_STRIPE[altZone] || '') : ''
              return (
                <div key={i} className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden ${stripe}`}>
                  <div className="bg-gray-50 dark:bg-gray-800 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <AmbitionBadge zone={altZone} />
                      <h4 className="font-semibold text-gray-900 dark:text-white">{alt.name || alt.route_name || `Alternative ${i + 1}`}</h4>
                    </div>
                    <div className="flex gap-2">
                      {(alt.oneJob || alt.one_job) && <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">{alt.oneJob || alt.one_job}</Badge>}
                      {alt.mechanic && <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">{alt.mechanic}</Badge>}
                    </div>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    {(alt.concept || alt.how_it_works) && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{alt.concept || alt.how_it_works}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {(alt.prizeArchitecture || alt.reward) && (
                        <div><span className="font-semibold text-gray-500 uppercase">Prizes</span><p className="text-gray-700 dark:text-gray-300 mt-0.5">{alt.prizeArchitecture || alt.reward}</p></div>
                      )}
                      {(alt.frictionDesign || alt.friction) && (
                        <div><span className="font-semibold text-gray-500 uppercase">Friction</span><p className="text-gray-700 dark:text-gray-300 mt-0.5">{alt.frictionDesign || alt.friction}</p></div>
                      )}
                      {(alt.whatThisFixesFromOriginal || alt.what_this_fixes) && (
                        <div><span className="font-semibold text-green-600 dark:text-green-400 uppercase">What this fixes</span><p className="text-gray-700 dark:text-gray-300 mt-0.5">{alt.whatThisFixesFromOriginal || alt.what_this_fixes}</p></div>
                      )}
                      {alt.budget_protection && (
                        <div><span className="font-semibold text-gray-500 uppercase">Budget</span><p className="text-gray-700 dark:text-gray-300 mt-0.5">{alt.budget_protection}</p></div>
                      )}
                      {alt.retailer_pitch && (
                        <div><span className="font-semibold text-gray-500 uppercase">Retailer pitch</span><p className="text-gray-700 dark:text-gray-300 mt-0.5">{alt.retailer_pitch}</p></div>
                      )}
                    </div>

                    {/* Five-lens headlines for this route */}
                    {altAngles.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400 uppercase mb-2">Headline craft — 5 angles</div>
                        <div className="space-y-2">
                          {altAngles.map((angle, j) => <HeadlineAngleCard key={j} angle={angle} />)}
                        </div>
                      </div>
                    )}
                    {/* Fallback: single headline if no angles supplied */}
                    {altAngles.length === 0 && alt.headline && (
                      <div className="text-xs">
                        <span className="font-semibold text-gray-500 uppercase">Headline</span>
                        <p className="text-gray-700 dark:text-gray-300 font-medium mt-0.5">{alt.headline}</p>
                      </div>
                    )}

                    {/* Signature moment for this route */}
                    {altSignature && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase mb-1">Signature Moment</div>
                        <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{altSignature}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}

/* ── Section wrapper ────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  )
}

/* ── Main Page Component ────────────────────────────────────────── */
export default function ShelfRoutes() {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const urlMode = searchParams.get('mode')

  // Data comes from navigation state (passed by ShelfBrief on submit)
  // OR from persisted storage when the page is opened directly by URL (history view, refresh)
  const passedResult = location.state?.result
  const [data, setData] = useState(passedResult || null)
  const [loading, setLoading] = useState(!passedResult)
  const [hydrationError, setHydrationError] = useState(null)

  // If no nav state and we have a campaignId, fetch the persisted Shelf evaluation
  useEffect(() => {
    if (passedResult) return  // already have data, no need to hydrate
    if (!campaignId) { setLoading(false); return }

    let cancelled = false
    setLoading(true)
    getShelfEvaluation(campaignId)
      .then((res) => {
        if (cancelled) return
        if (res?.verdict) {
          // Reshape to the same { verdict, research } envelope the live response uses
          setData({ verdict: res.verdict, research: res.research, _hydratedAt: res.evaluatedAt })
        } else {
          setHydrationError('No saved evaluation found for this campaign.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setHydrationError(err?.message || 'Failed to load saved evaluation.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [campaignId, passedResult])

  const handleSelectRoute = (route) => {
    navigate(`/shelf/${campaignId}/stress-test?routeId=${encodeURIComponent(route.id || route.name)}`, {
      state: { route, context: data },
    })
  }

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading results...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-gray-500 dark:text-gray-400 mb-2">{hydrationError || 'No results found.'}</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={() => navigate('/shelf')}>Back to Brief</Button>
            <Button variant="outline" onClick={() => navigate('/shelf/history')}>History</Button>
          </div>
        </div>
      </div>
    )
  }

  // Mode prefers the URL param. If absent (e.g. opened from history or deep-linked
  // without ?mode), infer from the loaded data shape — a `verdict` field means this
  // is an evaluation (mode 2), a `routes`/`concepts` array means routes (mode 1).
  const inferredMode = data.verdict ? 2 : (Array.isArray(data.routes) || Array.isArray(data.concepts)) ? 1 : null
  const mode = urlMode === '2' ? 2 : urlMode === '1' ? 1 : (inferredMode ?? 1)

  /* ── Parse routes for Mode 1 ─────────────────────────── */
  const routes = data.routes || data.concepts || []
  const sortedRoutes = [...routes].sort((a, b) => {
    const scoreA = ((a.provocateur?.score || 0) + (a.pragmatist?.score || 0))
    const scoreB = ((b.provocateur?.score || 0) + (b.pragmatist?.score || 0))
    return scoreB - scoreA
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <button
          onClick={() => navigate('/shelf')}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-6 inline-flex items-center gap-1 transition-colors"
        >
          ← Back to Brief
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
          {mode === 1 ? 'Generated Routes' : 'Evaluation Verdict'}
        </h1>

        {mode === 1 ? (
          <div className="space-y-6">
            {sortedRoutes.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">No routes were generated. Try adjusting your brief.</p>
            )}
            {sortedRoutes.map((route, i) => (
              <RouteCard key={route.id || i} route={route} onSelect={handleSelectRoute} />
            ))}
          </div>
        ) : (
          <EvaluationResult data={data.verdict || data} />
        )}
      </div>
    </div>
  )
}
