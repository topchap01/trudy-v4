// apps/frontend/src/pages/WarRoom.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import {
  getCampaign,
  getCampaignDebugBundle,
  getBrief,
  putBrief,
  runFraming,
  runEvaluate,
  runCreate,
  runSynthesis,
  runIdeation,
  listExports,
  createExport,
  getLatestOutputs,
  runOpinion,
  runStrategist,
  runJudge,
  updateWarRoomPrefs,
  updateResearchOverrides,
  saveBriefQAResponse,
  askAnalyst,
  runResearchTask,
  getVariants,
  saveVariants as persistVariants,
  runVariantEvaluate,
  draftVariantOverrides,
} from '../lib/campaigns.js'
import PromoBuilderCanvas from '../components/PromoBuilderCanvas.jsx'
import {
  createEmptyWorkspace,
  workspaceFromSpec,
  specFromWorkspace,
  workspaceHasEntries,
  workspaceToOverrides,
} from '../utils/promoBuilderMapping.js'

import SavedOutputsPanel from '../components/SavedOutputsPanel.jsx'
import AskOutputs from '../components/AskOutputs.jsx'
import FramingEditor from '../components/FramingEditor.jsx'
import EvaluationView from '../components/EvaluationView.jsx'
import IdeaRoutes from '../components/IdeaRoutes.jsx'
import ExportPanel from '../components/ExportPanel.jsx'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import MarkdownBlock from '../components/MarkdownBlock.jsx'

const RESEARCH_SECTIONS = [
  { key: 'brandTruths', label: 'Brand truths' },
  { key: 'shopperTensions', label: 'Shopper tensions' },
  { key: 'retailerReality', label: 'Retailer reality' },
  { key: 'competitorMoves', label: 'Competitor moves' },
  { key: 'categorySignals', label: 'Category signals' },
  { key: 'benchmarks', label: 'Benchmarks' },
]

const MAX_OVERRIDE_ENTRIES = 4
const VARIANT_OVERRIDES_HINT = '{\n  "cashback": {\n    "amount": 300,\n    "assured": false\n  }\n}'
const generateClientId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`
const VARIANT_INITIAL_STATE = { name: '', notes: '', overrides: VARIANT_OVERRIDES_HINT }

const blankOverrideEntry = () => ({ text: '', source: '' })

function buildOverrideDraft(overrides) {
  const draft = {}
  for (const { key } of RESEARCH_SECTIONS) {
    const entries = Array.isArray(overrides?.[key]) ? overrides[key] : []
    draft[key] = entries.map((entry) => ({
      text: entry?.text || '',
      source: entry?.source || '',
    }))
  }
  return draft
}

function buildOverridesPayload(draft) {
  const payload = {}
  for (const { key } of RESEARCH_SECTIONS) {
    const entries = Array.isArray(draft?.[key]) ? draft[key] : []
    const cleaned = entries
      .map((entry) => ({
        text: (entry?.text || '').trim(),
        source: (entry?.source || '').trim(),
      }))
      .filter((entry) => entry.text.length)
      .slice(0, MAX_OVERRIDE_ENTRIES)
    payload[key] = cleaned
  }
  return payload
}

function responsesArrayToMap(responses) {
  const map = {}
  if (Array.isArray(responses)) {
    for (const entry of responses) {
      if (!entry || !entry.issueId) continue
      map[entry.issueId] = {
        issueId: entry.issueId,
        response: entry.response || '',
        resolvedAt: entry.resolvedAt || null,
      }
    }
  }
  return map
}

export default function WarRoom() {
  const { id } = useParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const qs = useMemo(() => new URLSearchParams(search), [search])
  const phaseParam = (qs.get('phase') || '').toLowerCase() // framing|evaluate|create|synthesis|opinion|strategist
  const autorunParam = ['1', 'true', 'yes'].includes((qs.get('autorun') || '').toLowerCase())

  const [campaign, setCampaign] = useState(null)
  const [brief, setBrief] = useState(null)
  const [classification, setClassification] = useState(null)

  const [framing, setFraming] = useState('')
  const [framingMeta, setFramingMeta] = useState(null) // Framing v2 meta
  const [spec, setSpec] = useState({})
  const [evaluation, setEvaluation] = useState('')
  const [evalMeta, setEvalMeta] = useState(null) // Evaluation v4.2+ meta
  const [ideas, setIdeas] = useState('')
  const [synthesis, setSynthesis] = useState('')
  const [opinion, setOpinion] = useState('') // Narrative-only opinion
  const [strategist, setStrategist] = useState('') // scenario playbook
  const [strategistPrompts, setStrategistPrompts] = useState('')
  const [strategistDeepDive, setStrategistDeepDive] = useState(false)
  const [strategistMode, setStrategistMode] = useState('CORE')
  const [ideationHarness, setIdeationHarness] = useState(null)
  const [ideationUnboxed, setIdeationUnboxed] = useState([])
  const [ideationError, setIdeationError] = useState('')
  const [loadingIdeation, setLoadingIdeation] = useState(false)
  const [exports, setExports] = useState([])
  const [warPrefs, setWarPrefs] = useState({ allowHeroOverlay: null, entryFrictionAccepted: null, notes: null })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [warResearch, setWarResearch] = useState(null)
  const [researchOverrides, setResearchOverrides] = useState(null)
  const [overrideDraft, setOverrideDraft] = useState(() => buildOverrideDraft(null))
  const [savingOverrides, setSavingOverrides] = useState(false)
  const [debugBundle, setDebugBundle] = useState(null)
  const [bundleError, setBundleError] = useState('')
  const [savingAnalystNote, setSavingAnalystNote] = useState(false)
  const [analystNote, setAnalystNote] = useState('')
  const [analystChat, setAnalystChat] = useState([])
  const [analystQuestion, setAnalystQuestion] = useState('')
  const [analystLoading, setAnalystLoading] = useState(false)
  const [analystErrorMsg, setAnalystErrorMsg] = useState('')
  const [researchTaskSummary, setResearchTaskSummary] = useState('')
  const [researchTaskGeneratedAt, setResearchTaskGeneratedAt] = useState(null)
  const [researchTaskLoading, setResearchTaskLoading] = useState(false)
  const [researchTaskError, setResearchTaskError] = useState('')
  const [briefQA, setBriefQA] = useState(null)
  const [briefQALoading, setBriefQALoading] = useState(true)
  const [briefQAResponses, setBriefQAResponses] = useState({})
  const [briefQAResponseDrafts, setBriefQAResponseDrafts] = useState({})
  const [briefQAResponseSaving, setBriefQAResponseSaving] = useState({})

  const [variants, setVariants] = useState([])
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [variantDraft, setVariantDraft] = useState({ ...VARIANT_INITIAL_STATE })
  const [variantError, setVariantError] = useState('')
  const [variantSuccess, setVariantSuccess] = useState('')
  const [savingVariantsList, setSavingVariantsList] = useState(false)
  const [runningVariant, setRunningVariant] = useState('')
  const [variantResults, setVariantResults] = useState({})
  const [variantLLMInput, setVariantLLMInput] = useState('')
  const [draftingOverrides, setDraftingOverrides] = useState(false)

  // Brief Spec (raw JSON) editor state
  const [specText, setSpecText] = useState('')       // pretty-printed JSON
  const [specErr, setSpecErr] = useState('')         // parse/save errors
  const [savingSpec, setSavingSpec] = useState(false)
  const [builderWorkspace, setBuilderWorkspace] = useState(createEmptyWorkspace())
  const [builderDirty, setBuilderDirty] = useState(false)
  const [briefTab, setBriefTab] = useState('builder')
  const [sandboxWorkspace, setSandboxWorkspace] = useState(createEmptyWorkspace())
  const [sandboxName, setSandboxName] = useState('')
  const [sandboxNotes, setSandboxNotes] = useState('')
  const [variantTab, setVariantTab] = useState('list')
  const sandboxHasCards = useMemo(() => workspaceHasEntries(sandboxWorkspace), [sandboxWorkspace])
  const qaStatusClass = (status) => {
    switch ((status || '').toUpperCase()) {
      case 'BLOCKER':
        return 'bg-red-100 text-red-800 border border-red-200'
      case 'WARN':
        return 'bg-amber-100 text-amber-800 border border-amber-200'
      case 'PASS':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200'
      default:
        return 'bg-slate-100 text-slate-800 border border-slate-200'
    }
  }

  // Busy flags
  const [loadingFraming, setLoadingFraming] = useState(false)
  const [loadingEvaluate, setLoadingEvaluate] = useState(false)
  const [loadingCreate, setLoadingCreate] = useState(null)
  const [loadingSyn, setLoadingSyn] = useState(false)
  const [loadingOpinion, setLoadingOpinion] = useState(false)
  const [loadingStrategist, setLoadingStrategist] = useState(false)
  const [loadingJudge, setLoadingJudge] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [runAllStep, setRunAllStep] = useState('')

  const [judgeVerdict, setJudgeVerdict] = useState(null)
  const [judgeError, setJudgeError] = useState('')

  // “Latest” timestamps (local, simple, reliable)
  const [lastRun, setLastRun] = useState({
    framing: null,
    evaluation: null,
    create: null,
    synthesis: null,
    opinion: null,
    strategist: null,
    ideation: null,
    judge: null,
  })

  // Guard so autorun fires only once per mount (even if reload() runs)
  const [autorunDone, setAutorunDone] = useState(false)

  // Section anchors for sticky sub-nav
  const briefRef = useRef(null)
  const researchRef = useRef(null)
  const framingSectionRef = useRef(null)
  const strategistRef = useRef(null)
  const evalRef = useRef(null)
  const variantsRef = useRef(null)
  const ideationRef = useRef(null)
  const hooksRef = useRef(null)
  const opinionRef = useRef(null)
  const synthRef = useRef(null)
  const judgeRef = useRef(null)
  const exportRef = useRef(null)
  const analystRef = useRef(null)

  function markRan(key) {
    setLastRun((x) => ({ ...x, [key]: new Date().toISOString() }))
  }

  async function loadVariantsList() {
    if (!id) return
    setVariantsLoading(true)
    setVariantError('')
    try {
      const list = await getVariants(id)
      setVariants(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Failed to load variants', err)
      setVariants([])
      setVariantError(err?.message || 'Failed to load variants')
    } finally {
      setVariantsLoading(false)
    }
  }

  async function persistVariantList(nextList) {
    if (!id) return []
    setSavingVariantsList(true)
    setVariantError('')
    setVariantSuccess('')
    try {
      const saved = await persistVariants(id, nextList)
      setVariants(Array.isArray(saved) ? saved : [])
      setVariantSuccess('Variants saved')
      return Array.isArray(saved) ? saved : []
    } catch (err) {
      console.error('Save variants failed:', err)
      setVariantError(err?.message || 'Failed to save variants')
      return []
    } finally {
      setSavingVariantsList(false)
    }
  }

  const resetVariantDraft = () => setVariantDraft({ ...VARIANT_INITIAL_STATE })

  async function handleAddVariant(e) {
    e?.preventDefault()
    setVariantError('')
    setVariantSuccess('')
    if (!variantDraft.name.trim()) {
      setVariantError('Variant name is required')
      return
    }
    let overrides = {}
    const rawOverrides = variantDraft.overrides.trim()
    if (rawOverrides) {
      try {
        overrides = JSON.parse(rawOverrides)
      } catch {
        setVariantError('Overrides must be valid JSON')
        return
      }
    }
    const next = [
      ...variants,
      {
        name: variantDraft.name.trim(),
        notes: variantDraft.notes.trim() || null,
        overrides,
      },
    ]
    await persistVariantList(next)
    resetVariantDraft()
  }

  async function handleRemoveVariant(variantId) {
    setVariantError('')
    setVariantSuccess('')
    const next = variants.filter((v) => v.id !== variantId)
    await persistVariantList(next)
  }

  async function handleRunVariantEvaluate(variantId) {
    if (!id) return
    setRunningVariant(variantId)
    setVariantError('')
    setVariantSuccess('')
    try {
      const result = await runVariantEvaluate(id, variantId)
      const content =
        typeof result?.content === 'string' ? result.content :
        typeof result?.result?.content === 'string' ? result.result.content :
        ''
      setVariantResults((prev) => ({
        ...prev,
        [variantId]: {
          content: content || 'Variant evaluation completed.',
          updatedAt: new Date().toISOString(),
        },
      }))
      setVariantSuccess('Variant evaluation complete')
      markRan('evaluation')
    } catch (err) {
      console.error('Variant evaluation failed:', err)
      setVariantError(err?.message || 'Variant evaluation failed')
    } finally {
      setRunningVariant('')
    }
  }

  async function handleVariantLLMAssist() {
    if (!id) return
    const instructions = variantLLMInput.trim()
    if (!instructions) {
      setVariantError('Please describe the override you want.')
      return
    }
    setVariantError('')
    setVariantSuccess('')
    setDraftingOverrides(true)
    try {
      const overrides = await draftVariantOverrides(id, instructions)
      setVariantDraft((prev) => ({
        ...prev,
        overrides: JSON.stringify(overrides, null, 2),
      }))
      setVariantSuccess('Overrides drafted via LLM')
    } catch (err) {
      console.error('Variant draft failed:', err)
      setVariantError(err?.message || 'Variant drafting failed')
    } finally {
      setDraftingOverrides(false)
    }
  }

  // Demo prefs (read-only here)
  const demoMode = useMemo(() => localStorage.getItem('demoMode') === 'true', [])
  const demoClient = useMemo(() => localStorage.getItem('demoClientName') || '', [])

  // If demo is ON and this campaign doesn't belong to the selected client,
  // show a gentle guard (keeps deep links safe during a client demo).
  const demoGuard = campaign &&
    demoMode &&
    demoClient &&
    String(campaign.clientName || '').toLowerCase() !== demoClient.toLowerCase();

  const normalizeWarPrefs = (prefs) => ({
    allowHeroOverlay: typeof prefs?.allowHeroOverlay === 'boolean' ? prefs.allowHeroOverlay : null,
    entryFrictionAccepted: typeof prefs?.entryFrictionAccepted === 'boolean' ? prefs.entryFrictionAccepted : null,
    notes: typeof prefs?.notes === 'string' ? prefs.notes : null,
  })

  async function handlePrefUpdate(patch) {
    if (!id) return
    setSavingPrefs(true)
    try {
      const updated = await updateWarRoomPrefs(id, patch)
      setWarPrefs(normalizeWarPrefs(updated))
    } catch (err) {
      console.error('Failed to update guidance', err)
      alert(err?.message || 'Failed to update guidance preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  async function handleOverrideSave() {
    if (!id || !overridesDirty) return
    setSavingOverrides(true)
    try {
      await updateResearchOverrides(id, overridePayload)
      await reload()
    } catch (err) {
      console.error('Failed to update research overrides', err)
      alert(err?.message || 'Failed to update research overrides')
    } finally {
      setSavingOverrides(false)
    }
  }

  async function handleSaveQAResponse(issueId) {
    if (!id || !issueId) return
    const value = briefQAResponseDrafts[issueId] ?? ''
    setBriefQAResponseSaving((prev) => ({ ...prev, [issueId]: true }))
    try {
      const payload = await saveBriefQAResponse(id, issueId, value)
      const resolution = payload?.resolution ?? null
      setBriefQAResponses((prev) => {
        const next = { ...prev }
        if (resolution) next[issueId] = resolution
        else delete next[issueId]
        return next
      })
      setBriefQAResponseDrafts((prev) => ({
        ...prev,
        [issueId]: resolution ? resolution.response : '',
      }))
    } catch (err) {
      console.error('Failed to save QA response', err)
      alert(err?.message || 'Failed to save QA response')
    } finally {
      setBriefQAResponseSaving((prev) => ({ ...prev, [issueId]: false }))
    }
  }

  async function reload() {
    const c = await getCampaign(id)
    setCampaign(c)

    const b = await getBrief(id) // { brief: {...} } or {...}
    const briefObj = b?.brief ?? b ?? null
    setBrief(briefObj)
    await loadVariantsList()

    setBriefQALoading(true)
    let qaReview = null
    let qaResponses = []
    try {
      const qaRes = await fetch(`/api/campaigns/${id}/brief/qa`)
      if (qaRes.ok) {
        const payload = await qaRes.json()
        qaReview = payload?.review || null
        qaResponses = Array.isArray(payload?.responses) ? payload.responses : []
      }
    } catch {
      qaReview = null
    } finally {
      setBriefQA(qaReview)
      const map = responsesArrayToMap(qaResponses)
      setBriefQAResponses(map)
      setBriefQAResponseDrafts(
        Object.fromEntries(Object.entries(map).map(([issueId, entry]) => [issueId, entry.response || ''])),
      )
      setBriefQALoading(false)
    }

    let warRoomData = null
    try {
      const wrRes = await fetch(`/api/campaigns/${id}/war-room`)
      if (wrRes.ok) {
        warRoomData = await wrRes.json()
        setWarPrefs(normalizeWarPrefs(warRoomData?.prefs || {}))
        setWarResearch(warRoomData?.research || null)
        setResearchOverrides(warRoomData?.researchOverrides || null)
        setOverrideDraft(buildOverrideDraft(warRoomData?.researchOverrides || null))
      }
    } catch {
      // ignore
    }

    // hydrate the raw JSON editor from parsedJson and cache spec for derived signals
    let parsedSpec = {}
    try {
      setSpecErr('')
      parsedSpec = briefObj?.parsedJson ?? {}
      setSpecText(JSON.stringify(parsedSpec, null, 2))
      setSpec(parsedSpec)
      setBuilderWorkspace(workspaceFromSpec(parsedSpec))
      setBuilderDirty(false)
    } catch {
      setSpecText('{}')
      setSpec({})
      setBuilderWorkspace(createEmptyWorkspace())
      setBuilderDirty(false)
    }

    // unwrap artifacts array for ExportPanel
    {
      const ex = await listExports(id)
      setExports(ex?.artifacts || ex || [])
    }

    try {
      // latest snapshot (be defensive about shapes)
      const latest = await getLatestOutputs(id)

      const framingStr      = pickOutputContent(latest?.framing)
      const evaluationStr   = pickOutputContent(latest?.evaluation)
      const ideasStr        = pickOutputContent(latest?.ideas)
      const synthesisStr    = pickOutputContent(latest?.synthesis)

      // Robust pick for Opinion so it shows on open:
      let opinionStr        = pickOutputContent(latest?.opinion)
      let strategistStr     = pickOutputContent(latest?.strategist)

      // Fallback: look through a generic outputs array if provided (newest first)
      if ((!opinionStr || !strategistStr) && Array.isArray(latest?.outputs)) {
        const pick = (aliases) => {
          const hit = latest.outputs.find(o => aliases.includes(o?.type))
          return pickOutputContent(hit)
        }
        if (!opinionStr) opinionStr = pick(['opinion','opinionNarrative'])
        if (!strategistStr) strategistStr = pick(['strategist','strategistNarrative'])
      }

      // FINAL FALLBACK: use War Room API snapshot for opinion/strategist
      if (!opinionStr || !strategistStr) {
        const wr = warRoomData
        if (wr?.latest) {
          if (!opinionStr)       opinionStr = pickOutputContent(wr.latest.opinion)
          if (!strategistStr)    strategistStr = pickOutputContent(wr.latest.strategist)
        }
      }

      if (framingStr != null) setFraming(framingStr || '')
      if (evaluationStr != null) setEvaluation(evaluationStr || '')
      if (ideasStr != null) setIdeas(ideasStr || '')
      if (synthesisStr != null) setSynthesis(synthesisStr || '')
      if (opinionStr != null) setOpinion(opinionStr || '')
      if (strategistStr != null) setStrategist(strategistStr || '')
      if (Array.isArray(latest?.outputs)) {
        const judgeOut = latest.outputs.find(o => ['judgeVerdict', 'judge'].includes(o?.type))
        if (judgeOut?.params?.result) {
          setJudgeVerdict(judgeOut.params.result)
          setJudgeError('')
        } else if (judgeOut?.content) {
          try {
            const parsed = JSON.parse(String(judgeOut.content || '{}'))
            if (parsed && typeof parsed === 'object') {
              setJudgeVerdict(parsed)
              setJudgeError('')
            }
          } catch {
            // ignore parse errors
          }
        }
        const evalOutLatest = latest.outputs.find((o) => ['evaluation','evaluationNarrative'].includes(o?.type))
        if (evalOutLatest?.params) {
          setEvalMeta(evalOutLatest.params)
        } else if (evaluationStr != null) {
          setEvalMeta(null)
        }
      }
      const ideationLatest = latest?.ideation || null
      const resolvedIdeation = ideationLatest || (warRoomData?.latest?.ideation || null)
      if (resolvedIdeation) {
        setIdeationHarness(resolvedIdeation.harness || null)
        setIdeationUnboxed(Array.isArray(resolvedIdeation.unboxed) ? resolvedIdeation.unboxed : [])
      } else {
        setIdeationHarness(null)
        setIdeationUnboxed([])
      }
      setIdeationError('')
      // we intentionally do not reset framingMeta here
    } catch {}

    try {
      const bundle = await getCampaignDebugBundle(id)
      setDebugBundle(bundle)
      setBundleError('')
    } catch (err) {
      setDebugBundle(null)
      setBundleError(err?.message || 'Failed to load analyst bundle')
    }
  }

  useEffect(() => {
    if (id) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    setJudgeVerdict(null)
    setJudgeError('')
  }, [id])

  // ===== URL-driven behavior =====
  const sectionByPhase = {
    brief: () => briefRef.current?.scrollIntoView({ behavior: 'smooth' }),
    research: () => researchRef.current?.scrollIntoView({ behavior: 'smooth' }),
    framing: () => framingSectionRef.current?.scrollIntoView({ behavior: 'smooth' }),
    strategist: () => strategistRef.current?.scrollIntoView({ behavior: 'smooth' }),
    evaluate: () => evalRef.current?.scrollIntoView({ behavior: 'smooth' }),
    variants: () => variantsRef.current?.scrollIntoView({ behavior: 'smooth' }),
    ideation: () => ideationRef.current?.scrollIntoView({ behavior: 'smooth' }),
    creative: () => ideationRef.current?.scrollIntoView({ behavior: 'smooth' }),
    sparks: () => ideationRef.current?.scrollIntoView({ behavior: 'smooth' }),
    hooks: () => hooksRef.current?.scrollIntoView({ behavior: 'smooth' }),
    create: () => hooksRef.current?.scrollIntoView({ behavior: 'smooth' }),
    opinion: () => opinionRef.current?.scrollIntoView({ behavior: 'smooth' }),
    synthesis: () => synthRef.current?.scrollIntoView({ behavior: 'smooth' }),
    judge: () => judgeRef.current?.scrollIntoView({ behavior: 'smooth' }),
    export: () => exportRef.current?.scrollIntoView({ behavior: 'smooth' }),
    analyst: () => analystRef.current?.scrollIntoView({ behavior: 'smooth' }),
  }

  const runByPhase = {
    framing: () => doFraming(),
    evaluate: () => doEvaluate(),
    hooks: () => doCreateRoutes('DISRUPTIVE', 7),
    create: () => doCreateRoutes('DISRUPTIVE', 7),
    ideation: () => doIdeation(),
    creative: () => doIdeation(),
    sparks: () => doIdeation(),
    synthesis: () => doSynthesis(),
    opinion: () => doOpinion(),
    strategist: () => doStrategist(),
    judge: () => doJudge(),
  }

  // Scroll to requested section whenever ?phase= changes (even without autorun)
  useEffect(() => {
    if (!phaseParam) return
    const scroll = sectionByPhase[phaseParam]
    if (typeof scroll === 'function') scroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseParam])

  // Autorun a phase exactly once after campaign + brief have loaded
  useEffect(() => {
    if (!autorunParam || autorunDone) return
    if (!campaign || !brief) return
    const run = runByPhase[phaseParam]
    if (typeof run === 'function') {
      run()
      const scroll = sectionByPhase[phaseParam]
      if (typeof scroll === 'function') scroll()
      setAutorunDone(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorunParam, autorunDone, campaign, brief, phaseParam])

  // ===== Actions
  async function saveBrief(rawText, parsedJson) {
    const r = await putBrief(id, { rawText, parsedJson, assets: null })
    const b = r?.brief ?? r
    setBrief(b)
    setClassification(r.classification || null)
    // refresh raw JSON editor with server-merged doc
    try {
      setSpecText(JSON.stringify(b?.parsedJson ?? {}, null, 2))
      setSpecErr('')
      const nextSpec = b?.parsedJson ?? {}
      setSpec(nextSpec)
      setBuilderWorkspace(workspaceFromSpec(nextSpec))
      setBuilderDirty(false)
    } catch {}
  }

  async function saveSpecJSON() {
    setSavingSpec(true); setSpecErr('')
    try {
      let parsed
      try {
        parsed = specText ? JSON.parse(specText) : {}
      } catch (e) {
        setSpecErr('Invalid JSON — please fix and try again.')
        setSavingSpec(false)
        return
      }
      const r = await putBrief(id, { parsedJson: parsed })
      const b = r?.brief ?? r
      setBrief(b)
      setSpecText(JSON.stringify(b?.parsedJson ?? {}, null, 2))
      setSpecErr('')
      const nextSpec = b?.parsedJson ?? {}
      setSpec(nextSpec)
      setBuilderWorkspace(workspaceFromSpec(nextSpec))
      setBuilderDirty(false)
    } catch (e) {
      setSpecErr(e?.message || 'Failed to save spec')
    } finally {
      setSavingSpec(false)
    }
  }

  const handleBuilderWorkspaceChange = (nextWorkspace) => {
    setBuilderWorkspace(nextWorkspace)
    setSpec((prev) => {
      const nextSpec = specFromWorkspace(prev, nextWorkspace)
      setSpecText(JSON.stringify(nextSpec ?? {}, null, 2))
      return nextSpec
    })
    setBuilderDirty(true)
  }

  const handleBuilderSave = async () => {
    await saveSpecJSON()
  }

  const handleBuilderSaveAndEvaluate = async () => {
    await saveSpecJSON()
    await doEvaluate()
  }

  const injectHookIntoWorkspace = (workspace, hook) => {
    return workspace.map((column) => {
      if (column.lane !== 'Hook') return column
      if (!column.entries.length) {
        return {
          ...column,
          entries: [
            {
              id: makeId(),
              cardId: 'hook-core',
              values: { headline: hook.headline, support: hook.support || '' },
            },
          ],
        }
      }
      return {
        ...column,
        entries: column.entries.map((entry, idx) =>
          idx === 0
            ? {
                ...entry,
                values: { ...(entry.values || {}), headline: hook.headline, support: hook.support || '' },
              }
            : entry
        ),
      }
    })
  }

  const injectCadenceIntoWorkspace = (workspace, cadenceLine) => {
    return workspace.map((column) => {
      if (column.lane !== 'Cadence') return column
      if (!column.entries.length) {
        return {
          ...column,
          entries: [
            {
              id: makeId(),
              cardId: 'cadence-instant',
              values: { cadence_copy: cadenceLine, winner_vis: '' },
            },
          ],
        }
      }
      return {
        ...column,
        entries: column.entries.map((entry, idx) =>
          idx === 0
            ? {
                ...entry,
                values: { ...(entry.values || {}), cadence_copy: cadenceLine },
              }
            : entry
        ),
      }
    })
  }

  const applyHookSuggestion = (hook) => {
    if (!hook?.headline) return
    const nextWorkspace = injectHookIntoWorkspace(builderWorkspace, hook)
    handleBuilderWorkspaceChange(nextWorkspace)
    setBriefTab('builder')
    setBuilderDirty(true)
  }

  const applyCadenceSuggestion = (line) => {
    if (!line) return
    const nextWorkspace = injectCadenceIntoWorkspace(builderWorkspace, line)
    handleBuilderWorkspaceChange(nextWorkspace)
    setBriefTab('builder')
    setBuilderDirty(true)
  }

  const cloneWorkspace = (workspace) =>
    workspace.map((column) => ({
      lane: column.lane,
      entries: Array.isArray(column.entries)
        ? column.entries.map((entry) => ({
            ...entry,
            values: { ...(entry.values || {}) },
          }))
        : [],
    }))

  const handleSandboxCopyBaseline = () => {
    setSandboxWorkspace(cloneWorkspace(builderWorkspace))
  }

  const handleSandboxReset = () => {
    setSandboxWorkspace(createEmptyWorkspace())
    setSandboxName('')
    setSandboxNotes('')
  }

  const handleSandboxVariantSave = async ({ runEvaluation: runEval = false } = {}) => {
    setVariantError('')
    setVariantSuccess('')
    if (!sandboxHasCards) {
      setVariantError('Add at least one card in the idea sandbox before saving a variant.')
      return
    }
    const overrides = workspaceToOverrides(sandboxWorkspace)
    if (!overrides || !Object.keys(overrides).length) {
      setVariantError('No overrides were captured from the sandbox.')
      return
    }
    const variantName = sandboxName.trim() || `Idea variant ${variants.length + 1}`
    const payload = {
      id: generateClientId(),
      name: variantName,
      notes: sandboxNotes.trim() || null,
      overrides,
    }
    const saved = await persistVariantList([...variants, payload])
    if (!saved.length) return
    setSandboxName('')
    setSandboxNotes('')
    setVariantTab('list')
    if (!runEval) {
      setVariantSuccess(`Saved “${variantName}” as a variant`)
      return
    }
    await handleRunVariantEvaluate(payload.id)
  }

  async function handleRunAllPhases() {
    if (runningAll) return
    if (!id) return
    if (
      loadingFraming ||
      loadingEvaluate ||
      loadingCreate ||
      loadingSyn ||
      loadingOpinion ||
      loadingStrategist ||
      loadingJudge ||
      loadingIdeation ||
      researchTaskLoading
    ) {
      setRunAllStep('Finish current runs before starting the full sequence.')
      return
    }
    setRunningAll(true)
    setRunAllStep('Starting sequence…')
    const steps = [
      { label: 'Framing', run: () => doFraming() },
      { label: 'Evaluation', run: () => doEvaluate() },
      { label: 'Hooks & Routes', run: () => doCreateRoutes('DISRUPTIVE', 7) },
      { label: 'Creative Sparks', run: () => doIdeation() },
      { label: 'Synthesis', run: () => doSynthesis() },
      { label: 'Opinion', run: () => doOpinion() },
      { label: 'Strategist', run: () => doStrategist() },
      { label: 'Judge', run: () => doJudge() },
    ]
    let hadError = false
    try {
      for (const step of steps) {
        setRunAllStep(`Running ${step.label}…`)
        try {
          await step.run()
        } catch (err) {
          hadError = true
          console.error(`[Run all] ${step.label} failed`, err)
          setRunAllStep(`${step.label} failed — continuing`)
        }
      }
      setRunAllStep(hadError ? 'Sequence finished with issues — check sections for alerts.' : 'All phases complete.')
    } catch (err) {
      console.error('[Run all] sequence aborted', err)
      setRunAllStep('Sequence aborted — check console for details.')
    } finally {
      setRunningAll(false)
    }
  }

  async function doFraming() {
    setLoadingFraming(true)
    try {
      const r = await runFraming(id)
      setFraming(r.content || r)
      setFramingMeta(r.meta || null)
      markRan('framing')
    } catch (err) {
      console.error('Framing failed:', err)
      setFraming(`⚠️ Framing failed: ${err?.message || String(err)}`)
      setFramingMeta(null)
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
      // If backend saved opinionNarrative alongside evaluation, a reload will pull it.
      // Avoid hard reload here to keep UI snappy; rely on next manual reload or page refresh.
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

  async function doOpinion() {
    setLoadingOpinion(true)
    try {
      const r = await runOpinion(id, { stance: 'DECISIVE' })
      const content =
        (r && typeof r === 'object' && typeof r.content === 'string') ? r.content :
        (r && typeof r === 'object' && r.result && typeof r.result.content === 'string') ? r.result.content :
        (typeof r === 'string' ? r : '')
      setOpinion(content)
      markRan('opinion')
    } catch (err) {
      console.error('Opinion failed:', err)
      setOpinion(`⚠️ Opinion failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingOpinion(false)
    }
  }

  async function doStrategist() {
    setLoadingStrategist(true)
    try {
      const extraPrompts = strategistPrompts
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const r = await runStrategist(id, {
        customPrompts: extraPrompts,
        deepDive: strategistDeepDive,
        mode: strategistMode,
      })
      const content =
        (r && typeof r === 'object' && typeof r.content === 'string') ? r.content :
        (r && typeof r === 'object' && r.result && typeof r.result.content === 'string') ? r.result.content :
        (typeof r === 'string' ? r : '')
      setStrategist(content)
      markRan('strategist')
    } catch (err) {
      console.error('Strategist failed:', err)
      setStrategist(`⚠️ Strategist run failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingStrategist(false)
    }
  }

  async function doIdeation() {
    if (!id) return
    setLoadingIdeation(true)
    setIdeationError('')
    try {
      const r = await runIdeation(id)
      const harnessData = r?.harness ?? null
      const unboxedData = Array.isArray(r?.unboxed) ? r.unboxed : []
      setIdeationHarness(harnessData)
      setIdeationUnboxed(unboxedData)
      markRan('ideation')
    } catch (err) {
      console.error('Ideation failed:', err)
      setIdeationError(`⚠️ Creative sparks failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingIdeation(false)
    }
  }

  async function doJudge(opts = {}) {
    setLoadingJudge(true)
    try {
      const verdict = await runJudge(id, opts)
      setJudgeVerdict(verdict || null)
      setJudgeError('')
      markRan('judge')
    } catch (err) {
      console.error('Judge failed:', err)
      setJudgeError(`⚠️ Judge failed: ${err?.message || String(err)}`)
    } finally {
      setLoadingJudge(false)
    }
  }

  async function handleAddAnalystNote() {
    const note = analystNote.trim()
    if (!note || !id) return
    setSavingAnalystNote(true)
    try {
      const assetsIn = (debugBundle?.briefAssets && typeof debugBundle.briefAssets === 'object')
        ? { ...debugBundle.briefAssets }
        : {}
      const notes = Array.isArray(assetsIn.__manualNotes) ? [...assetsIn.__manualNotes] : []
      notes.push({ at: new Date().toISOString(), note })
      assetsIn.__manualNotes = notes
      await putBrief(id, {
        rawText: brief?.rawText ?? null,
        parsedJson: brief?.parsedJson ?? null,
        assets: assetsIn,
      })
      setAnalystNote('')
      const bundle = await getCampaignDebugBundle(id)
      setDebugBundle(bundle)
      setBundleError('')
    } catch (err) {
      setBundleError(err?.message || 'Failed to save note')
    } finally {
      setSavingAnalystNote(false)
    }
  }

  async function handleAskAnalyst() {
    const question = analystQuestion.trim()
    if (!question || !id) return
    const prevChat = analystChat
    const historyPayload = prevChat
      .map((entry) => ({ role: entry.role, content: entry.content }))
      .slice(-8)

    setAnalystChat([...prevChat, { role: 'user', content: question }])
    setAnalystQuestion('')
    setAnalystLoading(true)
    setAnalystErrorMsg('')

    try {
      const res = await askAnalyst(id, { message: question, history: historyPayload })
      const reply = typeof res?.reply === 'string' ? res.reply.trim() : ''
      setAnalystChat((current) => [...current, { role: 'assistant', content: reply || '(no answer returned)' }])
    } catch (err) {
      console.error('Analyst chat failed:', err)
      setAnalystChat(prevChat)
      setAnalystErrorMsg(err?.message || 'Analyst chat failed')
    } finally {
      setAnalystLoading(false)
    }
  }

  function handleClearAnalystChat() {
    setAnalystChat([])
    setAnalystErrorMsg('')
  }

  async function handleResearchTask() {
    if (!id) return
    setResearchTaskLoading(true)
    setResearchTaskError('')
    try {
      const res = await runResearchTask(id, {})
      if (res?.bundle) {
        setDebugBundle(res.bundle)
        setWarResearch(res.bundle.snapshot?.research || null)
      }
      if (typeof res?.summary === 'string') {
        setResearchTaskSummary(res.summary.trim())
        setResearchTaskGeneratedAt(res.generatedAt || new Date().toISOString())
      }
    } catch (err) {
      console.error('Research task failed:', err)
      setResearchTaskError(err?.message || 'Research task failed')
    } finally {
      setResearchTaskLoading(false)
    }
  }

  // Export triggered from ExportPanel (single source of truth)
  async function doExport(options) {
    await createExport(id, options || {})
    // refresh list so both artifacts appear when BOTH is chosen
    const fresh = await listExports(id)
    setExports(fresh?.artifacts || fresh || [])
  }

  const sig = classification?.signals || {}
  const conf = classification?.confidence

  // Utilities
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

  // NEW: identity line prefers Brand — Campaign (Client: …) when brand present
  const identity = useMemo(() => {
    const brand = String(brief?.parsedJson?.brand || '').trim()
    const client = campaign?.clientName || ''
    const title = campaign?.title || ''
    return brand ? `${brand} — ${title} (Client: ${client})` : `${client} — ${title}`
  }, [brief, campaign])

  const manualNotes = useMemo(() => {
    const notes = Array.isArray(debugBundle?.briefAssets?.__manualNotes)
      ? [...debugBundle.briefAssets.__manualNotes]
      : []
    return notes
      .map((entry) => ({
        at: entry?.at ? new Date(entry.at) : null,
        note: entry?.note || '',
      }))
      .filter((entry) => entry.note)
      .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))
  }, [debugBundle])

  const sparkAnalysis = useMemo(() => debugBundle?.snapshot?.spark?.analysis || null, [debugBundle])
  const sparkSummary = typeof sparkAnalysis?.summary === 'string' ? sparkAnalysis.summary.trim() : ''
  const sparkAudience = typeof sparkAnalysis?.audience === 'string' ? sparkAnalysis.audience.trim() : ''
  const sparkValueLine =
    typeof sparkAnalysis?.value?.description === 'string'
      ? sparkAnalysis.value.description.trim()
      : (sparkAnalysis?.value?.summary || '').toString().trim()
  const sparkTensions = Array.isArray(sparkAnalysis?.tensions)
    ? sparkAnalysis.tensions.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean).slice(0, 3)
    : []
  const sparkCompliance = Array.isArray(sparkAnalysis?.compliance)
    ? sparkAnalysis.compliance.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean).slice(0, 3)
    : []
  const sparkTradeReward = typeof sparkAnalysis?.trade?.reward === 'string' ? sparkAnalysis.trade.reward.trim() : ''
  const sparkTradeGuardrail = typeof sparkAnalysis?.trade?.guardrail === 'string' ? sparkAnalysis.trade.guardrail.trim() : ''

  const analystHooks = useMemo(() => {
    const hooks =
      debugBundle?.snapshot?.narratives?.evaluation?.meta?.hooksRecommended ||
      debugBundle?.snapshot?.narratives?.evaluation?.meta?.ui?.hookOptions ||
      []
    return Array.isArray(hooks) ? hooks.slice(0, 5) : []
  }, [debugBundle])

  const sparkHooks = useMemo(() => {
    const raw = debugBundle?.snapshot?.spark?.hookPlayground?.options
    if (!Array.isArray(raw) || !raw.length) return []
    return raw.slice(0, 5).map((opt, idx) => ({
      headline: opt?.headline || `Spark hook ${idx + 1}`,
      support: opt?.support || '',
    }))
  }, [debugBundle])

  const sparkCadence = useMemo(() => {
    const lines = debugBundle?.snapshot?.spark?.hookPlayground?.cadence
    return Array.isArray(lines) ? lines.filter(Boolean).slice(0, 5) : []
  }, [debugBundle])

  const builderHookSuggestions = useMemo(() => {
    const evalHooks = Array.isArray(analystHooks) ? analystHooks.map((headline) => ({ headline, support: '' })) : []
    return [...sparkHooks, ...evalHooks].slice(0, 6)
  }, [sparkHooks, analystHooks])

  const analystVerdict = debugBundle?.snapshot?.narratives?.evaluation?.meta?.ui?.verdict || null

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
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
            <Item label="Brief" onClick={() => briefRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Research" onClick={() => researchRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Framing" onClick={() => framingSectionRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Strategist" onClick={() => strategistRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Evaluation" onClick={() => evalRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Variants" onClick={() => variantsRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Creative Sparks" onClick={() => ideationRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Hooks" onClick={() => hooksRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Opinion" onClick={() => opinionRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Synthesis" onClick={() => synthRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Analyst" onClick={() => analystRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Judge" onClick={() => judgeRef.current?.scrollIntoView({ behavior: 'smooth' })} />
            <Item label="Export" onClick={() => exportRef.current?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        </div>
      )
    }
  }, [])

  // Extract hooks spotted in Evaluation
  const spottedHooks = useMemo(() => extractHooks(evaluation), [evaluation])

  // Derived flags/panels from evalMeta
  const reflective = Boolean(evalMeta?.ui?.reflective || evalMeta?.when_reflective)
  const trade = evalMeta?.ui?.trade
  const tradePriority = String(trade?.priority || '').toUpperCase()
  const tradeRows = Array.isArray(trade?.table) ? trade.table : []
  const hasHighTrade = tradePriority === 'HIGH' && tradeRows.length > 0
  const tradeOpportunity = evalMeta?.ui?.tradeOpportunity
  const runAgainMoves = Array.isArray(evalMeta?.run_again_moves) ? evalMeta.run_again_moves : []
  const symbolism = Array.isArray(evalMeta?.symbolism) ? evalMeta.symbolism : []
  const hookWhyChange = evalMeta?.hook_why_change || null
  const propositionHint = evalMeta?.proposition_hint || null
  const multiAgentEvaluation = evalMeta?.multiAgentEvaluation || null
  const multiAgentImprovement = evalMeta?.multiAgentImprovement || null

  // NEW: surfaced UI/meta
  const ui = evalMeta?.ui || {}
  const verdict = ui?.verdict || null
  const atAGlance = Array.isArray(ui?.atAGlance) ? ui.atAGlance : []
  const assuredValue = Boolean(ui?.assuredValue)
  const dealbreakers = Array.isArray(ui?.dealbreakers) ? ui.dealbreakers : []
  const offerIQ = ui?.offerIQ || evalMeta?.offerIQ || null
  const benchmarks = ui?.benchmarks || evalMeta?.benchmarks || null
  const winsense = ui?.winsense || evalMeta?.winsense || null
  const framingBenchmarks = framingMeta?.benchmarks || null
  const researchPack = warResearch || framingMeta?.research || evalMeta?.research || null
  const researchMeta = researchPack?.meta || null
  const overridePayload = useMemo(() => buildOverridesPayload(overrideDraft), [overrideDraft])
  const baselineOverridePayload = useMemo(
    () => buildOverridesPayload(buildOverrideDraft(researchOverrides || null)),
    [researchOverrides]
  )
  const overridesDirty = useMemo(
    () => JSON.stringify(overridePayload) !== JSON.stringify(baselineOverridePayload),
    [overridePayload, baselineOverridePayload]
  )
  const researchCachedAtDate = useMemo(() => {
    if (!researchMeta?.cachedAt) return null
    const d = new Date(researchMeta.cachedAt)
    return Number.isNaN(d.getTime()) ? null : d
  }, [researchMeta?.cachedAt])
  const stalePhases = useMemo(() => {
    if (!researchCachedAtDate) return []
    const entries = [
      lastRun.evaluation ? ['Evaluation', lastRun.evaluation] : null,
      lastRun.opinion ? ['Opinion', lastRun.opinion] : null,
      lastRun.strategist ? ['Strategist', lastRun.strategist] : null,
    ].filter(Boolean)
    return entries
      .filter(([, iso]) => {
        const t = new Date(iso)
        return !Number.isNaN(t.getTime()) && t.getTime() < researchCachedAtDate.getTime()
      })
      .map(([label]) => label)
  }, [researchCachedAtDate, lastRun])
  const positionVsMarket = String(benchmarks?.positionVsMarket || 'UNKNOWN')
  const priorOpinion = ui?.priorOpinion || null
  // DEFAULT TO COLLAPSED unless explicitly false
  const hideScoreboard = ui?.hideScoreboard !== false
  const heroPrefValue = warPrefs?.allowHeroOverlay ?? null
  const entryPrefValue = warPrefs?.entryFrictionAccepted ?? null
  const briefSummary = useMemo(() => {
    const s = spec || {}
    const items = []
    const trim = (v) => (typeof v === 'string' ? v.trim() : '')
    const join = (v) => {
      if (Array.isArray(v)) return v.filter(Boolean).join(', ')
      if (typeof v === 'string') return v.split(/[,•\n]+/g).map((x) => x.trim()).filter(Boolean).join(', ')
      return ''
    }
    const brand = trim(s.brand || campaign?.title || '')
    const client = trim(campaign?.clientName || '')
    if (brand || client) {
      items.push({ label: 'Client / Brand', value: [client, brand].filter(Boolean).join(' — ') })
    }
    if (s.typeOfPromotion) items.push({ label: 'Promotion type', value: s.typeOfPromotion })
    const mechanic = trim(s.mechanicOneLiner || s.entryMechanic || '')
    if (mechanic) items.push({ label: 'Mechanic', value: mechanic })
    const hook = trim(s.hook || '')
    if (hook) items.push({ label: 'Hook', value: hook })
    const heroPrize = trim(s.heroPrize || '')
    const heroCount = typeof s.heroPrizeCount === 'number' ? s.heroPrizeCount : null
    if (heroPrize || heroCount != null) {
      items.push({
        label: 'Hero prize',
        value: [heroPrize, heroCount != null ? `x${heroCount}` : null].filter(Boolean).join(' '),
      })
    }
    const runners = join(s.runnerUps)
    if (runners) items.push({ label: 'Runner-ups', value: runners })
    const totalWinners = s.totalWinners ?? s.breadthPrizeCount ?? null
    if (totalWinners != null) items.push({ label: 'Total winners', value: String(totalWinners) })
    const retailersLine = join(s.retailers)
    if (retailersLine) items.push({ label: 'Retailers', value: retailersLine })
    const mediaLine = join(s.media)
    if (mediaLine) items.push({ label: 'Media', value: mediaLine })
    if (s.primaryObjective) items.push({ label: 'Primary objective', value: s.primaryObjective })
    if (s.primaryKpi) items.push({ label: 'Primary KPI', value: s.primaryKpi })
    const posture = trim(s.brandPosture || '')
    if (posture) items.push({ label: 'Brand posture', value: posture })
    const start = campaign?.startDate ? new Date(campaign.startDate).toLocaleDateString() : ''
    const end = campaign?.endDate ? new Date(campaign.endDate).toLocaleDateString() : ''
    if (start || end) items.push({ label: 'Timing', value: [start, end].filter(Boolean).join(' → ') })
    return items
  }, [spec, campaign])

  return (
    <div className="flex h-[100svh]">
      <div className="flex-1 overflow-y-auto">
        {/* Sticky page header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
          <div className="px-6 py-3">
            {campaign && (
              <>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <span>{identity}</span>
                  {reflective && <span className="text-[10px] px-2 py-0.5 rounded border bg-gray-50">PAST</span>}
                </h1>
                <div className="space-x-2 mt-1">
                  <Badge kind="mode">Mode: {campaign.mode}</Badge>
                  <Badge>{campaign.status}</Badge>
                  <Badge>Market: {campaign.market || 'AU'}</Badge>
                  {campaign.category ? <Badge>{campaign.category}</Badge> : null}
                  {assuredValue ? <Badge kind="success">Assured value</Badge> : <Badge kind="neutral">Non-assured</Badge>}
                  {verdict ? <VerdictBadge verdict={verdict} /> : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button onClick={handleRunAllPhases} loading={runningAll}>
                    Run all phases
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/campaigns/${id}/edit`)}>
                    Edit campaign brief
                  </Button>
                </div>
                {runAllStep ? (
                  <div
                    className={`mt-2 text-xs ${
                      runningAll
                        ? 'text-sky-700'
                        : /issues|failed|aborted/i.test(runAllStep)
                          ? 'text-amber-700'
                          : 'text-gray-600'
                    }`}
                  >
                    {runAllStep}
                  </div>
                ) : null}
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
        <div className="px-6 pb-8">
          {/* Brief QA */}
          <section className="mb-10">
            <SectionHead
              title="Brief QA"
              metaRight={briefQA?.createdAt ? `Last run: ${new Date(briefQA.createdAt).toLocaleString()}` : ''}
            />
            <div className="card">
              {briefQALoading ? (
                <div className="text-sm text-gray-600">Checking brief…</div>
              ) : briefQA ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${qaStatusClass(briefQA.overall_status)}`}>
                      {briefQA.overall_status || 'WARN'}
                    </span>
                    <span className="text-sm text-gray-700">{briefQA.summary || 'QA run complete.'}</span>
                  </div>
                  {Array.isArray(briefQA.issues) && briefQA.issues.length ? (
                    <ul className="space-y-3">
                      {briefQA.issues.map((issue) => {
                        const key = issue?.id || `${issue?.field}-${issue?.details}`
                        const resolution = issue?.id ? briefQAResponses[issue.id] : null
                        const draftValue = issue?.id ? briefQAResponseDrafts[issue.id] ?? '' : ''
                        const saving = issue?.id ? briefQAResponseSaving[issue.id] : false
                        return (
                          <li key={key} className="border border-slate-200 rounded p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${qaStatusClass(issue.severity)}`}>
                                {issue.severity}
                              </span>
                              <span className="font-semibold text-sm text-slate-800">{issue.field || 'Unspecified field'}</span>
                              {issue?.id ? (
                                <span className="text-[11px] text-gray-400">#{issue.id.slice(0, 6)}</span>
                              ) : null}
                            </div>
                            <div className="text-sm text-gray-700">{issue.details || 'No details provided.'}</div>
                            {issue.fix ? <div className="text-xs text-gray-500">Fix: {issue.fix}</div> : null}
                            {issue?.id ? (
                              <div className="pt-2 border-t border-dashed border-slate-200">
                                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                                  Your response {resolution?.resolvedAt ? `(updated ${new Date(resolution.resolvedAt).toLocaleString()})` : ''}
                                </label>
                                <textarea
                                  className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-slate-400"
                                  rows={3}
                                  value={draftValue}
                                  onChange={(e) =>
                                    setBriefQAResponseDrafts((prev) => ({ ...prev, [issue.id]: e.target.value }))
                                  }
                                  placeholder="Explain how this is addressed or why it is acceptable."
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                  <Button
                                    disabled={saving}
                                    loading={saving}
                                    className="px-2 py-1 text-xs"
                                    onClick={() => handleSaveQAResponse(issue.id)}
                                  >
                                    Save response
                                  </Button>
                                  {resolution?.response ? (
                                    <span className="text-xs text-emerald-700">Saved</span>
                                  ) : (
                                    <span className="text-xs text-gray-500">Not saved yet</span>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-600">No issues flagged.</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  No QA run recorded yet. Run the brief QA script or auto-review to generate findings.
                </div>
              )}
            </div>
          </section>

          {/* Guidance */}
          <section className="mb-10">
            <SectionHead title="Guidance" metaRight={savingPrefs ? 'Saving…' : ''} />
            <div className="card">
              <div className="text-sm text-gray-600 mb-3">
                Set strategic guardrails once and every agent (Strategist, Evaluation, Synthesis, Opinion) will honour them.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <PrefToggle
                  label="Hero overlay"
                  description="Should we actively pursue a hero/premiere overlay, or stay breadth-only for now?"
                  value={heroPrefValue}
                  onChange={(val) => handlePrefUpdate({ allowHeroOverlay: val })}
                  saving={savingPrefs}
                />
                <PrefToggle
                  label="Entry mechanic"
                  description="Is the current entry mechanic approved? Lock it to stop repeat “simplify entry” advice."
                  value={entryPrefValue}
                  onChange={(val) => handlePrefUpdate({ entryFrictionAccepted: val })}
                  saving={savingPrefs}
                  trueLabel="Locked"
                  falseLabel="Flag friction"
                />
              </div>
            </div>
          </section>

          {/* Research */}
          <section ref={researchRef} className="mb-10">
            <SectionHead
              title="Research"
              metaRight={researchMeta?.cachedAt ? `Cached ${new Date(researchMeta.cachedAt).toLocaleString()}` : ''}
            />
            <div className="card">
              <ResearchPanel pack={researchPack} overrides={researchOverrides} />
              <ResearchOverridesEditor
                dossier={researchPack?.dossier}
                draft={overrideDraft}
                overrides={researchOverrides}
                onSectionChange={(section, entries) => {
                  setOverrideDraft((prev) => ({ ...(prev || {}), [section]: entries }))
                }}
                onImportAuto={(section) => {
                  const autoEntries = Array.isArray(researchPack?.dossier?.[section]) ? researchPack.dossier[section] : []
                  setOverrideDraft((prev) => ({
                    ...(prev || {}),
                    [section]: autoEntries.map((entry) => ({ text: entry?.text || '', source: entry?.source || '' })),
                  }))
                }}
                onClearSection={(section) => {
                  setOverrideDraft((prev) => ({ ...(prev || {}), [section]: [] }))
                }}
                dirty={overridesDirty}
                saving={savingOverrides}
                onSave={handleOverrideSave}
              />
            </div>
          </section>

          {/* Brief */}
          <section ref={briefRef} className="mb-10">
            <SectionHead
              title="Brief"
              metaRight={lastRun.framing ? `Last Framing: ${fmtTime(lastRun.framing)}` : ''}
            />
            <div className="card">
              {briefSummary.length ? (
                <div className="mb-6 border border-slate-200 rounded p-4 bg-slate-50">
                  <div className="text-sm font-semibold mb-3 text-slate-900">Campaign snapshot</div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {briefSummary.map(({ label, value }) => (
                      <div key={label} className="text-sm">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                        <dd className="mt-0.5 text-slate-900">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2 mb-4">
                {[
                  { id: 'builder', label: 'Builder' },
                  { id: 'form', label: 'Guided form' },
                  { id: 'json', label: 'JSON' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`text-sm px-3 py-1 rounded ${briefTab === tab.id ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border'} `}
                    onClick={() => setBriefTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {briefTab === 'builder' && (
                <div className="space-y-8">
                  <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded p-3 bg-slate-50 text-sm text-slate-700">
                      <div className="font-semibold text-slate-900 mb-1">Baseline brief builder</div>
                      <p>Use this to keep the master brief tidy. Edits sync straight into the JSON and every downstream agent.</p>
                      <ul className="list-disc pl-5 mt-2 text-xs text-slate-600 space-y-1">
                        <li>Stack cards for hook, value, mechanic, cadence, trade and compliance.</li>
                        <li>Hit “Save brief” to persist, or “Save & Run Evaluation” to re-score straight away.</li>
                        <li>Need to explore alternate paths? Jump into the sandbox below without touching the baseline.</li>
                      </ul>
                    </div>

                    {(sparkSummary || sparkAudience || sparkValueLine || sparkTensions.length || sparkCompliance.length || sparkTradeReward || sparkTradeGuardrail) ? (
                      <div className="spark-panel space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Spark cues</p>
                            <p className="text-lg font-semibold text-slate-900">The promise we’re honouring</p>
                            <p className="text-sm text-slate-700/80">Every edit should keep these anchors intact.</p>
                          </div>
                          <span className="spark-chip">
                            <span className="spark-chip__dot" />
                            Spark
                          </span>
                        </div>
                        <div className="spark-grid md:grid-cols-2">
                          {sparkSummary ? (
                            <div className="spark-card">
                              <h4>Summary</h4>
                              <p>{sparkSummary}</p>
                            </div>
                          ) : null}
                          {sparkAudience ? (
                            <div className="spark-card">
                              <h4>Audience</h4>
                              <p>{sparkAudience}</p>
                            </div>
                          ) : null}
                          {sparkValueLine ? (
                            <div className="spark-card">
                              <h4>Value lens</h4>
                              <p>{sparkValueLine}</p>
                            </div>
                          ) : null}
                          {sparkTensions.length ? (
                            <div className="spark-card">
                              <h4>Shopper tensions</h4>
                              <ul>
                                {sparkTensions.map((line, idx) => (
                                  <li key={`spark-tension-${idx}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {sparkCompliance.length ? (
                            <div className="spark-card">
                              <h4>Compliance</h4>
                              <ul>
                                {sparkCompliance.map((line, idx) => (
                                  <li key={`spark-guard-${idx}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {(sparkTradeReward || sparkTradeGuardrail) ? (
                            <div className="spark-card">
                              <h4>Trade cue</h4>
                              <p>{[sparkTradeReward, sparkTradeGuardrail].filter(Boolean).join(' • ')}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {builderHookSuggestions.length || sparkCadence.length ? (
                      <div className="spark-panel space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hook & cadence kit</p>
                            <p className="text-lg font-semibold text-slate-900">Drop these straight into the builder</p>
                          </div>
                          <span className="spark-chip">
                            <span className="spark-chip__dot" />
                            Ready to use
                          </span>
                        </div>
                        <div className="spark-grid">
                          {builderHookSuggestions.length ? builderHookSuggestions.map((hook, idx) => (
                            <div key={`${hook.headline}-${idx}`} className="spark-card">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h4>Hook option</h4>
                                  <p className="text-base font-semibold text-slate-900">{hook.headline}</p>
                                  {hook.support ? <p className="text-xs text-slate-600 mt-1">{hook.support}</p> : null}
                                </div>
                                <Button variant="outline" onClick={() => applyHookSuggestion(hook)}>Use</Button>
                              </div>
                            </div>
                          )) : null}
                          {sparkCadence.length ? sparkCadence.map((line, idx) => (
                            <div key={`${line}-${idx}`} className="spark-card">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h4>Cadence riff</h4>
                                  <p className="text-sm text-slate-900">{line}</p>
                                </div>
                                <Button variant="outline" onClick={() => applyCadenceSuggestion(line)}>Use</Button>
                              </div>
                            </div>
                          )) : null}
                        </div>
                      </div>
                    ) : null}

                    <PromoBuilderCanvas
                      workspace={builderWorkspace}
                        onWorkspaceChange={handleBuilderWorkspaceChange}
                        showSerialized={false}
                        showEvaluateButton={false}
                        embedded
                      />
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button onClick={handleBuilderSave} loading={savingSpec}>Save brief</Button>
                        <Button
                          variant="outline"
                          onClick={handleBuilderSaveAndEvaluate}
                          loading={savingSpec || loadingEvaluate}
                        >
                          Save & Run Evaluation
                        </Button>
                        {builderDirty && <span className="text-xs text-amber-600">Unsaved builder changes</span>}
                      </div>
                    </div>
                    <BuilderDiagnosticsPanel
                      atAGlance={atAGlance}
                      dealbreakers={dealbreakers}
                      offerIQ={offerIQ}
                      winsense={winsense}
                      tradeOpportunity={tradeOpportunity}
                      tradeSummary={tradeRows}
                      hasHighTrade={hasHighTrade}
                    />
                  </div>

                </div>
              )}

              {briefTab === 'form' && (
                <div>
                  <FramingEditor brief={brief} campaignId={id} onSave={saveBrief} />
                </div>
              )}

              {briefTab === 'json' && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Brief Spec (raw JSON)</div>
                    {specErr ? <div className="text-xs text-red-600">{specErr}</div> : null}
                  </div>
                  <textarea
                    className="w-full border rounded p-2 font-mono text-sm"
                    rows={14}
                    spellCheck={false}
                    value={specText}
                    onChange={(e) => { setSpecText(e.target.value); setSpecErr('') }}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button onClick={saveSpecJSON} loading={savingSpec}>Save Spec</Button>
                    <button
                      className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                      onClick={() => {
                        try {
                          setSpecText(JSON.stringify(brief?.parsedJson ?? {}, null, 2))
                          setSpecErr('')
                        } catch {}
                      }}
                    >
                      Reset to server
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Framing */}
          <section ref={framingSectionRef} className="mb-10">
            <SectionHead
              title="Framing"
              metaRight={lastRun.framing ? `Last run: ${fmtTime(lastRun.framing)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex flex-wrap gap-2 items-center">
                <Button onClick={doFraming} loading={loadingFraming} disabled={runningAll}>Run Framing</Button>
                {framingMeta?.model ? (
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span>Model: {String(framingMeta.model)}</span>
                    {framingMeta?.behavioural_objective ? (
                      <span>Objective: {framingMeta.behavioural_objective}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {framing ? (
                <RevealBlock markdown text={framing} />
              ) : (
                <div className="text-sm text-gray-600">No framing yet. Click “Run Framing”.</div>
              )}
              <BenchmarkSnapshotCard
                framingBench={framingBenchmarks}
                evalBench={benchmarks}
                researchMeta={researchMeta}
                stalePhases={stalePhases}
              />
            </div>
          </section>

          {/* Strategist */}
          <section ref={strategistRef} className="mb-10">
            <SectionHead
              title="Strategist"
              metaRight={lastRun.strategist ? `Last run: ${fmtTime(lastRun.strategist)}` : ''}
            />
            <div className="card space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Button onClick={doStrategist} loading={loadingStrategist} disabled={runningAll}>Run Strategist</Button>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={strategistDeepDive}
                    onChange={(e) => setStrategistDeepDive(e.target.checked)}
                  />
                  Deep dive (longer scenarios)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  {['CORE', 'ALT'].map((mode) => {
                    const active = strategistMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setStrategistMode(mode)}
                        className={`px-3 py-1 rounded border transition ${
                          active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {mode === 'CORE' ? 'Core mode' : 'ALT mode'}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Extra prompts (optional) — one per line
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                  placeholder="e.g. Explore a partner overlay for independents"
                  value={strategistPrompts}
                  onChange={(e) => setStrategistPrompts(e.target.value)}
                />
              </div>
              {strategist ? (
                <RevealBlock text={strategist} />
              ) : (
                <div className="text-sm text-gray-600">
                  No strategist scenarios yet. Click “Run Strategist” for a trio of “what if” moves.
                </div>
              )}
            </div>
          </section>

          {/* Evaluation */}
          <section ref={evalRef} className="mb-10">
            <SectionHead
              title="Evaluation"
              metaRight={lastRun.evaluation ? `Last run: ${fmtTime(lastRun.evaluation)}` : ''}
            />
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="card">
                <div className="mb-3 flex flex-wrap gap-2 items-center">
                  <Button onClick={doEvaluate} loading={loadingEvaluate} disabled={runningAll}>Run Evaluation</Button>
                  {evalMeta && (
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>Stance: {evalMeta.stance}</span>
                      <span>Model: {String(evalMeta.model?.prose || evalMeta.model)}</span>
                      <span>Temp: {String(evalMeta.temp?.prose ?? evalMeta.temp)}</span>
                      {reflective && <span className="px-2 py-0.5 rounded border bg-gray-50">PAST</span>}
                    </div>
                  )}
                </div>

                {(verdict || positionVsMarket || assuredValue) && (
                  <div className="mb-3 grid md:grid-cols-3 gap-3">
                    <div className="spark-card">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="spark-chip spark-chip--pill">Verdict</span>
                        <span className="spark-chip-dot spark-chip-dot--glow" />
                      </div>
                      {verdict ? <VerdictBadge verdict={verdict} /> : <span className="text-sm text-slate-600">—</span>}
                    </div>
                    <div className="spark-card">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="spark-chip spark-chip--pill">Position</span>
                        <span className="spark-chip-dot spark-chip-dot--blue" />
                      </div>
                      <PosPill pos={positionVsMarket} />
                    </div>
                    <div className="spark-card">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="spark-chip spark-chip--pill">Assured</span>
                        <span className="spark-chip-dot spark-chip-dot--amber" />
                      </div>
                      <p className="text-sm text-slate-900">{assuredValue ? 'Yes (cashback/GWP)' : 'No'}</p>
                    </div>
                  </div>
                )}

                {dealbreakers?.length ? (
                  <div className="mb-3 border rounded p-3 bg-red-50 border-red-200">
                    <div className="text-sm font-semibold text-red-800 mb-1">Dealbreakers</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-red-900">
                      {dealbreakers.slice(0,5).map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                ) : null}

                {multiAgentEvaluation ? (
                  <div className="mb-3">
                    <MultiAgentRoomPanel data={multiAgentEvaluation} />
                  </div>
                ) : null}
                {multiAgentImprovement ? (
                  <div className="mb-3">
                    <MultiAgentUpgradePanel data={multiAgentImprovement} />
                  </div>
                ) : null}

                {(hookWhyChange || propositionHint) && (
                  <div className="mb-3 grid md:grid-cols-2 gap-3">
                    {hookWhyChange && (
                      <InfoNote title="Hook critique">
                        {hookWhyChange}
                      </InfoNote>
                    )}
                    {propositionHint && (
                      <InfoNote title="Proposition hint">
                        {propositionHint}
                      </InfoNote>
                    )}
                  </div>
                )}

                {symbolism?.length ? (
                  <div className="mb-3 border rounded p-3 bg-white">
                    <div className="text-sm font-medium mb-1">Symbolism bridge</div>
                    <ul className="list-disc pl-5 space-y-1">
                      {symbolism.slice(0,5).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                ) : null}

            {evaluation && <EvaluationView text={evaluation} />}

            {sparkHooks.length || sparkCadence.length ? (
              <div className="space-y-4">
                {sparkHooks.length ? (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-semibold mb-2">Spark hooks</div>
                    <ul className="space-y-2">
                      {sparkHooks.map((hook, idx) => (
                        <li key={`${hook.headline}-${idx}`}>
                          <div className="font-semibold text-sm">{hook.headline}</div>
                          {hook.support ? <div className="text-xs text-gray-600">{hook.support}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {sparkCadence.length ? (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-semibold mb-2">Spark cadence</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                      {sparkCadence.map((line, idx) => (
                        <li key={`${line}-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {atAGlance?.length ? (
              <ScoreboardBlock items={atAGlance} defaultCollapsed={hideScoreboard} />
            ) : null}
          </div>

              <div className="space-y-4">
                {/* OfferIQ panel */}
                {offerIQ ? <OfferIQPanel offerIQ={offerIQ} /> : null}

                {/* Benchmarks */}
                {benchmarks ? <BenchmarksPanel bm={benchmarks} /> : null}

                {/* Trade plan (HIGH priority only) */}
                {hasHighTrade && (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Trade plan (HIGH priority)</div>
                    <TradeTable rows={tradeRows} />
                  </div>
                )}
                {!hasHighTrade && tradeOpportunity?.flag && (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-medium mb-1 text-amber-800">Trade opportunity</div>
                    <p className="text-sm text-gray-700">{tradeOpportunity.why}</p>
                    {tradeOpportunity.suggestion ? (
                      <p className="text-xs text-gray-500 mt-1">{tradeOpportunity.suggestion}</p>
                    ) : null}
                  </div>
                )}

                {/* Reflection: if we ran this again (past campaigns) */}
                {reflective && (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-medium mb-2">If we ran this again</div>
                    {runAgainMoves?.length ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {runAgainMoves.slice(0,5).map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    ) : (
                      <div className="text-sm text-gray-600">No explicit changes captured.</div>
                    )}
                  </div>
                )}

                {/* Memory: prior Opinion */}
                {priorOpinion ? (
                  <div className="border rounded p-3 bg-white">
                    <div className="text-sm font-medium mb-1">Prior Opinion (latest)</div>
                    <RevealBlock markdown text={priorOpinion} />
                  </div>
                ) : null}

                {/* Hooks spotted from Evaluation */}
                {spottedHooks.length ? (
                  <div className="border rounded p-3 bg-white">
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
          </div>
        </section>

        {/* Variants */}
        <section ref={variantsRef} className="mb-10">
          <SectionHead title="Variants" />
          <div className="card space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
              {[
                { id: 'list', label: 'Variant list' },
                { id: 'sandbox', label: 'Sandbox builder' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`text-sm px-3 py-1 rounded ${
                    variantTab === tab.id ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border'
                  }`}
                  onClick={() => setVariantTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {variantError ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{variantError}</div>
            ) : null}
            {variantSuccess ? (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">{variantSuccess}</div>
            ) : null}

            {variantTab === 'list' ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Capture quick “what if” overrides without touching the base brief. Save JSON variants, run evaluations, and keep everything in one rail.
                </p>
                {variantsLoading ? (
                  <div className="text-sm text-gray-600">Loading variants…</div>
                ) : variants.length ? (
                  <div className="space-y-3">
                    {variants.map((variant) => (
                      <div key={variant.id} className="border rounded p-3 bg-white space-y-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold">{variant.name}</div>
                            {variant.notes ? <div className="text-sm text-gray-600">{variant.notes}</div> : null}
                            <div className="text-xs text-gray-400">
                              Updated {variant.updatedAt ? new Date(variant.updatedAt).toLocaleString() : 'recently'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleRunVariantEvaluate(variant.id)}
                              loading={runningVariant === variant.id}
                            >
                              Run evaluation
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleRemoveVariant(variant.id)}
                              disabled={savingVariantsList || runningVariant === variant.id}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                        <details className="text-sm">
                          <summary className="cursor-pointer text-gray-700">Overrides</summary>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto">
                            {JSON.stringify(variant.overrides || {}, null, 2)}
                          </pre>
                        </details>
                        {variantResults[variant.id]?.content ? (
                          <div className="border-t pt-2">
                            <div className="text-xs uppercase text-gray-500 mb-1">Latest run preview</div>
                            <RevealBlock text={variantResults[variant.id].content} />
                            <div className="text-[11px] text-gray-400 mt-1">
                              {variantResults[variant.id].updatedAt
                                ? `Captured ${new Date(variantResults[variant.id].updatedAt).toLocaleString()}`
                                : ''}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 border border-dashed border-gray-200 rounded p-4 bg-gray-50">
                    No variants yet. Use the JSON form below or jump to the sandbox tab to build one visually.
                  </div>
                )}
                <form className="border-t pt-4 space-y-3" onSubmit={handleAddVariant}>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">LLM assist (optional)</label>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <textarea
                        className="flex-1 border rounded px-3 py-2 text-sm"
                        rows={2}
                        placeholder="e.g., Increase cashback to $300 but only 1 in 3 win; others get $0."
                        value={variantLLMInput}
                        onChange={(e) => setVariantLLMInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVariantLLMAssist}
                        loading={draftingOverrides}
                      >
                        Build overrides
                      </Button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Variant name</label>
                      <input
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="e.g., 1-in-3 cashback odds"
                        value={variantDraft.name}
                        onChange={(e) => setVariantDraft((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                      <input
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="Quick reminder for future you"
                        value={variantDraft.notes}
                        onChange={(e) => setVariantDraft((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Overrides (JSON)</label>
                    <textarea
                      className="w-full border rounded px-3 py-2 text-sm"
                      rows={5}
                      value={variantDraft.overrides}
                      onChange={(e) => setVariantDraft((prev) => ({ ...prev, overrides: e.target.value }))}
                      placeholder={VARIANT_OVERRIDES_HINT}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" loading={savingVariantsList}>Save variant</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetVariantDraft}
                      disabled={savingVariantsList}
                    >
                      Reset form
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-gray-900">Sandbox builder</div>
                      <p className="text-sm text-gray-600">
                        Build alternate mechanics visually. When it sings, save it straight into the variant list (and optionally run Evaluation).
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleSandboxCopyBaseline}>Pull baseline</Button>
                      <Button variant="outline" onClick={handleSandboxReset}>Clear sandbox</Button>
                    </div>
                  </div>
                  <PromoBuilderCanvas
                    workspace={sandboxWorkspace}
                    onWorkspaceChange={setSandboxWorkspace}
                    showSerialized={false}
                    showEvaluateButton={false}
                    embedded
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Variant name</label>
                      <input
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="e.g., Guinness 1-in-3 cashback"
                        value={sandboxName}
                        onChange={(e) => setSandboxName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                      <textarea
                        className="w-full border rounded px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Use this to remind yourself what changed."
                        value={sandboxNotes}
                        onChange={(e) => setSandboxNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button
                      onClick={() => handleSandboxVariantSave({ runEvaluation: false })}
                      disabled={!sandboxHasCards || savingVariantsList}
                      loading={savingVariantsList}
                    >
                      Save as variant
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSandboxVariantSave({ runEvaluation: true })}
                      disabled={!sandboxHasCards || savingVariantsList}
                      loading={savingVariantsList}
                    >
                      Save & Evaluate
                    </Button>
                    {!sandboxHasCards && (
                      <span className="text-xs text-gray-500">Add at least one card to enable the sandbox actions.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Creative Sparks */}
        <section ref={ideationRef} className="mb-10">
          <SectionHead
            title="Creative Sparks"
            metaRight={lastRun.ideation ? `Last run: ${fmtTime(lastRun.ideation)}` : ''}
          />
          <div className="card space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={doIdeation} loading={loadingIdeation} disabled={runningAll}>Run Creative Sparks</Button>
            </div>
            {ideationError ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                {ideationError}
              </div>
            ) : null}
            {ideationHarness ? <CreativeHarnessView harness={ideationHarness} /> : null}
            {Array.isArray(ideationUnboxed) && ideationUnboxed.length ? (
              <CreativeAgentGrid agents={ideationUnboxed} />
            ) : (
              !loadingIdeation && (
                <div className="text-sm text-gray-600 border border-dashed border-gray-200 rounded p-4 bg-gray-50">
                  No Creative Sparks yet. Run the generator to unlock fresh hooks.
                </div>
              )
            )}
          </div>
        </section>

        {/* Hooks & Routes */}
        <section ref={hooksRef} className="mb-10">
          <SectionHead
            title="Hooks & Routes"
            metaRight={lastRun.create ? `Last run: ${fmtTime(lastRun.create)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => doCreateRoutes('CONSERVATIVE', 5)}
                  loading={loadingCreate==='CONSERVATIVE'}
                  disabled={runningAll}
                >
                  Conservative x5
                </Button>
                <Button
                  onClick={() => doCreateRoutes('DISRUPTIVE', 7)}
                  loading={loadingCreate==='DISRUPTIVE'}
                  disabled={runningAll}
                >
                  Disruptive x7
                </Button>
                <Button
                  variant="outline"
                  onClick={() => doCreateRoutes('OUTRAGEOUS', 10)}
                  loading={loadingCreate==='OUTRAGEOUS'}
                  disabled={runningAll}
                >
                  Outrageous x10
                </Button>
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

          {/* Opinion */}
          <section ref={opinionRef} className="mb-10">
            <SectionHead
              title="Opinion"
              metaRight={lastRun.opinion ? `Last run: ${fmtTime(lastRun.opinion)}` : ''}
            />
            <div className="card">
              <div className="mb-3 flex gap-2">
                <Button onClick={doOpinion} loading={loadingOpinion} disabled={runningAll}>Run Opinion (Ava+Clara)</Button>
              </div>
              {opinion ? (
                <RevealBlock markdown text={opinion} />
              ) : (
                <div className="text-sm text-gray-600">No opinion yet. Click “Run Opinion”.</div>
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
                <Button onClick={doSynthesis} loading={loadingSyn} disabled={runningAll}>Run Synthesis</Button>
              </div>
              {synthesis ? (
                <RevealBlock markdown text={synthesis} />
              ) : (
                <div className="text-sm text-gray-600">No synthesis yet. Click “Run Synthesis”.</div>
              )}
            </div>
          </section>

      {/* Analyst Desk */}
      <section ref={analystRef} className="mb-10">
        <SectionHead
          title="Analyst Desk"
          metaRight={bundleError ? 'Error loading' : (!debugBundle ? 'Loading…' : '')}
        />
        <div className="card space-y-4">
          {bundleError ? (
            <div className="text-sm text-red-600">
              {bundleError}
              <div className="mt-2">
                <Button variant="outline" onClick={() => reload()}>Retry</Button>
              </div>
            </div>
          ) : !debugBundle ? (
            <div className="text-sm text-gray-600">Loading campaign bundle…</div>
          ) : (
            <div className="space-y-4">
              <div className="border rounded p-3 bg-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                  <div>
                    <div className="text-sm font-medium">Research task</div>
                    {researchTaskGeneratedAt ? (
                      <div className="text-xs text-gray-500">Last run: {new Date(researchTaskGeneratedAt).toLocaleString()}</div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleResearchTask} loading={researchTaskLoading} disabled={runningAll}>Run Research Task</Button>
                  </div>
                </div>
                {researchTaskError ? (
                  <div className="text-xs text-red-600 mb-2">{researchTaskError}</div>
                ) : null}
                {researchTaskSummary ? (
                  <div className="text-sm text-gray-700 whitespace-pre-line">{researchTaskSummary}</div>
                ) : (
                  <div className="text-sm text-gray-600">Re-run the research pipeline to refresh the dossier and get a quick summary.</div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded p-3 bg-white">
                  <div className="text-sm font-medium mb-1">Evaluation snapshot</div>
                  <div className="text-sm text-gray-700">
                    Verdict: <span className="font-semibold">{analystVerdict || '—'}</span>
                  </div>
                  {Array.isArray(debugBundle?.rules?.founder?.notes) && debugBundle.rules.founder.notes.length ? (
                    <div className="mt-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Founder guardrails</div>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {debugBundle.rules.founder.notes.slice(0, 4).map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {Array.isArray(debugBundle?.snapshot?.research?.dossier?.shopperTensions) && debugBundle.snapshot.research.dossier.shopperTensions.length ? (
                    <div className="mt-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Shopper tensions</div>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {debugBundle.snapshot.research.dossier.shopperTensions.slice(0, 3).map((entry, idx) => (
                          <li key={idx}>{entry?.text || entry}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="border rounded p-3 bg-white">
                  <div className="text-sm font-medium mb-1">Hook shortlist</div>
                  {analystHooks.length ? (
                    <ul className="text-sm text-gray-700 space-y-1">
                      {analystHooks.map((hook, idx) => (
                        <li key={idx} className="font-semibold">{hook}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-600">No hook shortlist captured yet.</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(debugBundle.snapshot.narratives.evaluation?.meta?.hooksRecommended || analystHooks, null, 2))}
                    >
                      Copy hooks JSON
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(debugBundle.snapshot.narratives.evaluation?.content || '')}
                    >
                      Copy evaluation prose
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border rounded p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Analyst notebook</div>
                  {manualNotes.length ? (
                    <span className="text-xs text-gray-500">{manualNotes.length} saved</span>
                  ) : null}
                </div>
                {manualNotes.length ? (
                  <ul className="space-y-1 mb-3 text-sm text-gray-700">
                    {manualNotes.map((entry, idx) => (
                      <li key={idx} className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                        <span>{entry.note}</span>
                        <span className="text-xs text-gray-500">{entry.at ? entry.at.toLocaleString() : '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-600 mb-3">No analyst notes yet.</div>
                )}
                <div className="space-y-2">
                  <textarea
                    className="w-full border rounded px-2 py-1 text-sm"
                    rows={3}
                    value={analystNote}
                    onChange={(e) => setAnalystNote(e.target.value)}
                    placeholder="Add a note for the team (stored in the brief assets)."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleAddAnalystNote} loading={savingAnalystNote}>Save note</Button>
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(debugBundle, null, 2))}
                    >
                      Copy bundle JSON
                    </Button>
                  </div>
              </div>
            </div>

              <div className="border rounded p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Live Q&A</div>
                  {analystChat.length ? (
                    <Button
                      variant="outline"
                      onClick={handleClearAnalystChat}
                      disabled={analystLoading}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                {analystErrorMsg ? (
                  <div className="text-xs text-red-600 mb-2">{analystErrorMsg}</div>
                ) : null}
                <div className="mb-3 max-h-60 overflow-y-auto border border-dashed rounded bg-gray-50 p-2 space-y-2">
                  {analystChat.length ? (
                    analystChat.map((entry, idx) => (
                      <div key={idx} className="text-sm text-gray-800">
                        <span className="font-semibold mr-2">{entry.role === 'assistant' ? 'Analyst' : 'You'}:</span>
                        <span>{entry.content}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">Ask a question to interrogate this campaign’s artefacts.</div>
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    className="w-full border rounded px-2 py-1 text-sm"
                    rows={2}
                    value={analystQuestion}
                    onChange={(e) => setAnalystQuestion(e.target.value)}
                    placeholder="Ask anything about this campaign (e.g., shopper tension, retailer proof)."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleAskAnalyst}
                      loading={analystLoading}
                      disabled={!analystQuestion.trim() || analystLoading || !debugBundle}
                    >
                      {analystLoading ? 'Asking…' : 'Ask Analyst'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(analystChat, null, 2))}
                      disabled={!analystChat.length}
                    >
                      Copy chat JSON
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Judge */}
      <section ref={judgeRef} className="mb-10">
        <SectionHead
          title="Judge"
          metaRight={lastRun.judge ? `Last run: ${fmtTime(lastRun.judge)}` : ''}
        />
        <div className="card">
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <Button onClick={() => doJudge()} loading={loadingJudge} disabled={runningAll}>
              Run Judge
            </Button>
            <Button
              variant="outline"
              onClick={() => doJudge({ useLLM: true })}
              loading={loadingJudge}
              disabled={runningAll || loadingJudge}
            >
              Run Judge + LLM
            </Button>
          </div>
          {judgeError ? (
            <div className="text-sm text-red-600 mb-3">{judgeError}</div>
          ) : null}
          {judgeVerdict ? (
            <JudgeVerdictView verdict={judgeVerdict} />
          ) : (
            <div className="text-sm text-gray-600">No verdict yet. Run Judge to see QA findings.</div>
          )}
        </div>
      </section>

      {/* Ask for Outputs */}
      <section className="mb-10">
        <SectionHead title="Ask for Outputs" />
        <div className="card">
          <AskOutputs campaignId={id} onSaved={reload} />
        </div>
      </section>

      {/* Saved Outputs */}
      <section className="mb-10">
        <SectionHead title="Saved Outputs" />
        <div className="card">
          <SavedOutputsPanel campaignId={id} />
        </div>
      </section>

      {/* Export */}
      <section ref={exportRef} className="mb-10">
        <SectionHead title="Export" />
        <div className="card">
          {/* Single export surface: handled entirely inside ExportPanel */}
          <ExportPanel artifacts={exports} onExport={doExport} />
        </div>
      </section>

        </div>
      </div>
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

function JudgeVerdictView({ verdict }) {
  if (!verdict) return null
  const issues = Array.isArray(verdict.issues) ? verdict.issues : []
  const recommendations = Array.isArray(verdict.recommendations) ? verdict.recommendations : []
  const flags = Array.isArray(verdict.flags) ? verdict.flags : []
  const regen = Array.isArray(verdict.requiresRegeneration) ? verdict.requiresRegeneration : []

  const severityClass = (severity) => {
    switch (severity) {
      case 'BLOCKER': return 'bg-red-100 text-red-800 border border-red-200'
      case 'WARN': return 'bg-amber-100 text-amber-800 border border-amber-200'
      default: return 'bg-blue-100 text-blue-800 border border-blue-200'
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-sm font-semibold ${verdict.pass ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {verdict.pass ? 'PASS' : 'HOLD'}
          </span>
          <span className="text-sm text-gray-600">Score {Math.round(verdict.score ?? 0)}</span>
        </div>
        {flags.length ? (
          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
            {flags.slice(0, 10).map((flag) => (
              <span key={flag} className="px-2 py-0.5 rounded border border-gray-200 bg-gray-50">{flag}</span>
            ))}
          </div>
        ) : null}
      </div>

      {recommendations.length ? (
        <div>
          <div className="text-sm font-medium mb-1">Recommendations</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
          </ul>
        </div>
      ) : null}

      {issues.length ? (
        <div>
          <div className="text-sm font-medium mb-1">Issues</div>
          <ul className="space-y-2">
            {issues.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="border rounded p-2 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{issue.code}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${severityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-700">{issue.message}</div>
                {issue.evidence ? (
                  <div className="mt-1 text-xs text-gray-500">
                    Evidence: {issue.evidence.length > 240 ? `${issue.evidence.slice(0, 240)}…` : issue.evidence}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-sm text-gray-600">No issues flagged.</div>
      )}

      {regen.length ? (
        <div className="text-xs text-amber-700">
          Requires rerun: {regen.join(', ')}
        </div>
      ) : null}
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

function CreativeHarnessView({ harness }) {
  if (!harness) return null
  const lines = [
    { label: 'Point', value: harness.point },
    { label: 'Move', value: harness.move },
    { label: 'Risk', value: harness.risk },
    { label: 'Odds & cadence', value: harness.oddsCadence },
    { label: 'Retailer line', value: harness.retailerLine },
    harness.legalVariant ? { label: 'Legalised variant', value: harness.legalVariant } : null,
  ].filter(Boolean)
  return (
    <div className="rounded border border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="text-xs uppercase font-semibold text-emerald-700 tracking-wide">Harness pick</div>
          <div className="text-lg font-semibold text-emerald-900">{harness.selectedHook || 'Unnamed hook'}</div>
        </div>
        {harness.sourceIdea ? (
          <div className="text-xs text-emerald-700">
            From {harness.sourceIdea.agent} · {harness.sourceIdea.tier}
          </div>
        ) : null}
      </div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        {lines.map(({ label, value }) => (
          <CreativeDetailLine key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

function CreativeDetailLine({ label, value }) {
  if (!value) return null
  return (
    <div className="bg-white rounded border border-emerald-100/70 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{label}</div>
      <div className="text-sm text-emerald-900 leading-5 mt-1 whitespace-pre-line">{value}</div>
    </div>
  )
}

function CreativeAgentGrid({ agents }) {
  if (!Array.isArray(agents) || !agents.length) return null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map((agent, index) => (
        <div key={`${agent?.agent || 'agent'}-${index}`} className="border rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">{agent?.agent || 'Agent'}</div>
            <div className="text-xs text-gray-500">
              {Array.isArray(agent?.ideas) ? `${agent.ideas.length} ideas` : '0 ideas'}
            </div>
          </div>
          <div className="space-y-3">
            {(agent?.ideas || []).map((idea, idx) => (
              <div key={`${agent?.agent || 'agent'}-${idx}`} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{idea?.hook || 'Untitled hook'}</div>
                  <TierBadge tier={idea?.tier} />
                </div>
                <CreativeIdeaLine label="What" value={idea?.what} />
                <CreativeIdeaLine label="Why it wins" value={idea?.why} />
                <CreativeIdeaLine label="Retail run" value={idea?.retailRun} />
                <CreativeIdeaLine label="X-for-Y" value={idea?.xForY} />
                {Array.isArray(idea?.operatorCards) && idea.operatorCards.length ? (
                  <div className="flex flex-wrap gap-1">
                    {idea.operatorCards.map((card, i) => (
                      <OperatorPill key={`${card}-${i}`} value={card} />
                    ))}
                  </div>
                ) : null}
                {idea?.legalVariant ? (
                  <CreativeIdeaLine label="Legal variant" value={idea.legalVariant} tone="muted" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CreativeIdeaLine({ label, value, tone = 'default' }) {
  if (!value) return null
  const toneClass = tone === 'muted' ? 'text-gray-600' : 'text-gray-800'
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
      <div className={`text-sm leading-5 ${toneClass}`}>{value}</div>
    </div>
  )
}

function TierBadge({ tier }) {
  const t = String(tier || '').toUpperCase()
  const tone = {
    SAFE: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    STEAL: 'bg-sky-100 text-sky-800 border border-sky-200',
    HERESY: 'bg-amber-100 text-amber-800 border border-amber-200',
  }[t] || 'bg-gray-100 text-gray-700 border border-gray-200'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${tone}`}>
      {t || 'TIER'}
    </span>
  )
}

function OperatorPill({ value }) {
  if (!value) return null
  return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
      {value}
    </span>
  )
}

function fmt(x) {
  if (typeof x !== 'number') return '-'
  return x % 1 === 0 ? String(x) : x.toFixed(2)
}

/* ========= Robust “latest content” helper (string or {content} or array) ========= */
function pickOutputContent(obj) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj
  if (typeof obj?.content === 'string') return obj.content
  if (typeof obj?.result?.content === 'string') return obj.result.content
  if (Array.isArray(obj)) return pickOutputContent(obj[0])
  return ''
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

// NEW: compact meta viewer for Framing v2
function MetaGrid({ meta }) {
  // Defensive guards against any odd shapes
  const tensions = (meta?.tensions || []).slice(0, 3)
  const props = (meta?.proposition_candidates || []).slice(0, 3)
  const hooks = (meta?.hooks || []).slice(0, 5)
  const hyps = (meta?.improvement_hypotheses || []).slice(0, 5)
  const mindsets = Array.isArray(meta?.audience?.mindsets) ? meta.audience.mindsets : []
  const prizeItems = Array.isArray(meta?.prize_map?.items) ? meta.prize_map.items : []
  const hasSymbolic = !!meta?.prize_map?.has_symbolic_prize

  return (
    <div className="grid md:grid-cols-2 gap-3 text-sm">
      <div className="border rounded p-2">
        <div className="font-medium mb-1">Tensions</div>
        {tensions.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {tensions.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        ) : <div className="text-gray-500">—</div>}
      </div>

      <div className="border rounded p-2">
        <div className="font-medium mb-1">Proposition candidates</div>
        {props.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {props.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        ) : <div className="text-gray-500">—</div>}
      </div>

      <div className="border rounded p-2">
        <div className="font-medium mb-1">Hooks</div>
        {hooks.length ? (
          <div className="flex flex-wrap gap-2">
            {hooks.map((h, i) => (
              <span key={i} className="inline-block px-2 py-1 border rounded">{h}</span>
            ))}
          </div>
        ) : <div className="text-gray-500">—</div>}
      </div>

      <div className="border rounded p-2">
        <div className="font-medium mb-1">Hypotheses for evaluation</div>
        {hyps.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {hyps.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        ) : <div className="text-gray-500">—</div>}
      </div>

      <div className="border rounded p-2">
        <div className="font-medium mb-1">Audience mindsets</div>
        {mindsets.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {mindsets.map((m, i) => (
              <li key={i}><span className="font-semibold">{m?.name}</span>{m?.job ? ` — ${m.job}` : ''}</li>
            ))}
          </ul>
        ) : <div className="text-gray-500">—</div>}
      </div>

      <div className="border rounded p-2">
        <div className="font-medium mb-1">Prize map</div>
        {prizeItems.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {prizeItems.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{p?.label || p?.type}</span>
                {p?.rationale ? ` — ${p.rationale}` : ''}
              </li>
            ))}
          </ul>
        ) : <div className="text-gray-500">—</div>}
        <div className="mt-1 text-xs text-gray-600">
          Symbolic prize present: <span className="font-medium">{hasSymbolic ? 'Yes' : 'No'}</span>
        </div>
      </div>
    </div>
  )
}

// Small info note block
function InfoNote({ title, children }) {
  return (
    <div className="border rounded p-3 bg-white">
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  )
}

function MultiAgentRoomPanel({ data }) {
  const bruce = data?.bruce || null
  if (!bruce) return null
  const reasons = Array.isArray(bruce.top_reasons) ? bruce.top_reasons.filter(Boolean).slice(0, 3) : []
  const mustFix = Array.isArray(bruce.must_fix_items) ? bruce.must_fix_items.filter(Boolean).slice(0, 3) : []
  const quickWins = Array.isArray(bruce.quick_wins) ? bruce.quick_wins.filter(Boolean).slice(0, 3) : []
  const agentSnapshots = Array.isArray(bruce.agent_snapshots) && bruce.agent_snapshots.length
    ? bruce.agent_snapshots
    : Array.isArray(data?.agents)
      ? data.agents.map((agent) => ({
          agent: agent?.agent || 'Agent',
          verdict: agent?.verdict || '',
          headline: agent?.headline || agent?.notes_for_bruce || '',
        }))
      : []

  return (
    <div className="border rounded p-4 bg-white space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-600">Room verdict</p>
          <p className="text-lg font-semibold text-slate-900">{bruce.verdict || '—'}</p>
          {bruce.notes ? <p className="text-xs text-slate-500 mt-1">{bruce.notes}</p> : null}
        </div>
        <VerdictBadge verdict={bruce.verdict || '—'} />
      </div>

      {reasons.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Top reasons</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {reasons.map((reason, idx) => (
              <li key={`ma-reason-${idx}`}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {mustFix.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Must-fix</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {mustFix.map((item, idx) => (
              <li key={`ma-fix-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {quickWins.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Quick wins</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {quickWins.map((item, idx) => (
              <li key={`ma-win-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {agentSnapshots.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {agentSnapshots.map((snap, idx) => (
            <div key={`ma-agent-${snap.agent || idx}`} className="border rounded p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{snap.agent}</span>
                <VerdictBadge verdict={snap.verdict || '—'} />
              </div>
              <div className="text-sm text-slate-900">{snap.headline || '—'}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MultiAgentUpgradePanel({ data }) {
  if (!data || !data.bruce) return null
  const bruce = data.bruce
  const options = Array.isArray(bruce.upgrade_options) ? bruce.upgrade_options.slice(0, 2) : []
  const recommended = bruce.recommended_option_label || null
  const agentBlocks = Array.isArray(data.agents) ? data.agents : []

  if (!options.length && !agentBlocks.length) return null

  return (
    <div className="border rounded p-4 bg-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-600">Upgrade plan</p>
          <p className="text-lg font-semibold text-slate-900">Room recommendations</p>
          {bruce.notes ? <p className="text-xs text-slate-500 mt-1">{bruce.notes}</p> : null}
        </div>
        {recommended ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-sky-300 bg-sky-50 text-sky-700">
            Preferred: {recommended}
          </span>
        ) : null}
      </div>

      {options.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {options.map((opt) => (
            <div key={opt.label} className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm">{opt.label}</div>
                {recommended === opt.label ? (
                  <span className="text-[11px] uppercase tracking-wide text-sky-700">Recommended</span>
                ) : null}
              </div>
              {opt.summary ? <p className="text-sm text-slate-800">{opt.summary}</p> : null}
              {opt.offer ? (
                <div className="text-xs text-slate-600">
                  {opt.offer.cashback != null ? `Cashback: $${opt.offer.cashback}` : null}
                  {opt.offer.major_prizes != null ? ` • Majors: ${opt.offer.major_prizes}` : null}
                </div>
              ) : null}
              {opt.hooks?.length ? (
                <div className="text-xs">
                  <span className="uppercase tracking-wide text-[10px] text-slate-500">Hooks</span>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    {opt.hooks.slice(0, 3).map((hook, idx) => (
                      <li key={`${opt.label}-hook-${idx}`} className="text-slate-800">{hook}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {opt.trade_incentive ? (
                <div className="text-xs text-slate-700">
                  <span className="uppercase tracking-wide text-[10px] text-slate-500">Trade</span>
                  <p>{opt.trade_incentive}</p>
                </div>
              ) : null}
              {opt.hero_overlay ? (
                <div className="text-xs text-slate-700">
                  <span className="uppercase tracking-wide text-[10px] text-slate-500">Hero overlay</span>
                  <p>{opt.hero_overlay}</p>
                </div>
              ) : null}
              {Array.isArray(opt.runner_up_prizes) && opt.runner_up_prizes.length ? (
                <div className="text-xs text-slate-700">
                  <span className="uppercase tracking-wide text-[10px] text-slate-500">Runner-ups</span>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    {opt.runner_up_prizes.map((rp, rpIdx) => (
                      <li key={`${opt.label}-runner-${rpIdx}`}>
                        {rp.count != null ? `${rp.count} × ` : ''}
                        {rp.value != null ? `$${rp.value}` : ''}
                        {rp.description ? ` ${rp.description}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {opt.mechanic ? (
                <div className="text-xs text-slate-700">
                  <span className="uppercase tracking-wide text-[10px] text-slate-500">Mechanic</span>
                  <p>{opt.mechanic}</p>
                </div>
              ) : null}
              {opt.why_this?.length ? (
                <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1">
                  {opt.why_this.slice(0, 3).map((line, idx) => (
                    <li key={`${opt.label}-why-${idx}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {agentBlocks.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {agentBlocks.map((agent, idx) => (
            <div key={`improve-agent-${agent.agent || idx}`} className="border rounded p-3 bg-slate-50 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {agent.agent || 'Agent'}
              </div>
              {Array.isArray(agent.must_fix) && agent.must_fix.length ? (
                <ul className="list-disc pl-4 text-sm text-slate-800 space-y-1">
                  {agent.must_fix.slice(0, 3).map((item, fixIdx) => (
                    <li key={`${agent.agent}-fix-${fixIdx}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">No must-fix items returned.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// —— New UI bits ——

function VerdictBadge({ verdict }) {
  const v = String(verdict || '').toUpperCase()
  let cls = 'bg-gray-100 text-gray-800 border-gray-200'
  if (v.includes('NO-GO')) cls = 'bg-red-100 text-red-800 border-red-200'
  else if (v.includes('CONDITION')) cls = 'bg-amber-100 text-amber-900 border-amber-200'
  else if (v === 'GO') cls = 'bg-green-100 text-green-800 border-green-200'
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${cls}`}>{verdict}</span>
}

function PosPill({ pos }) {
  const p = String(pos || 'UNKNOWN').toUpperCase()
  const map = {
    ABOVE_TYPICAL: 'bg-green-100 text-green-800 border-green-200',
    AT_TYPICAL: 'bg-amber-100 text-amber-900 border-amber-200',
    BELOW_TYPICAL: 'bg-red-100 text-red-800 border-red-200',
    UNKNOWN: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${map[p] || map.UNKNOWN}`}>{p.replace('_',' ')}</span>
}

function ScoreboardBlock({ items, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <div className="mt-4 border rounded p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Checks (at a glance)</div>
        <button
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide checks' : 'Show checks'}
        </button>
      </div>
      {open && <ScoreboardGrid items={items} />}
    </div>
  )
}

function ScoreboardGrid({ items }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {items.map((it, i) => (
        <div key={i} className="border rounded p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">{it.label || it.key}</div>
            <StatusPill status={it.status} />
          </div>
          {it.why ? <div className="text-sm text-gray-800">{it.why}</div> : null}
          {it.fix ? <div className="text-xs text-gray-600 mt-1">Fix: {it.fix}</div> : null}
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }) {
  const s = String(status || 'NA').toUpperCase()
  const map = {
    GREEN: 'bg-green-100 text-green-800 border-green-200',
    AMBER: 'bg-amber-100 text-amber-900 border-amber-200',
    RED: 'bg-red-100 text-red-800 border-red-200',
    NA: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${map[s] || map.NA}`}>{s}</span>
}

function BuilderDiagnosticsPanel({ atAGlance, dealbreakers, offerIQ, winsense, tradeOpportunity, tradeSummary, hasHighTrade }) {
  const hasDiagnostics =
    (Array.isArray(atAGlance) && atAGlance.length > 0) ||
    (Array.isArray(dealbreakers) && dealbreakers.length > 0) ||
    Boolean(offerIQ) ||
    Boolean(winsense) ||
    Boolean(hasHighTrade) ||
    Boolean(tradeOpportunity?.flag)
  return (
    <div className="space-y-4">
      <div className="border rounded p-3 bg-white">
        <div className="text-sm font-medium mb-2">Live diagnostics</div>
        {Array.isArray(atAGlance) && atAGlance.length ? (
          <div className="space-y-1">
            {atAGlance.slice(0, 4).map((item) => (
              <div key={item.key} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{item.label}</span>
                <StatusPill status={item.status} />
              </div>
            ))}
            {atAGlance.length > 4 ? (
              <div className="text-[11px] text-gray-500">Full scoreboard lives in Evaluation.</div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-gray-500">Run Evaluation to populate the scoreboard cues.</div>
        )}
      </div>
      {Array.isArray(dealbreakers) && dealbreakers.length ? (
        <div className="border rounded p-3 bg-white">
          <div className="text-sm font-medium mb-1">Dealbreakers</div>
          <ul className="list-disc pl-5 space-y-1 text-xs text-red-700">
            {dealbreakers.slice(0, 3).map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {offerIQ ? <OfferIQPanel offerIQ={offerIQ} /> : null}
      {winsense ? <WinSensePanel winsense={winsense} /> : null}
      {hasHighTrade ? (
        <div className="border rounded p-3 bg-white">
          <div className="text-sm font-medium mb-1">Trade plan (HIGH)</div>
          <p className="text-xs text-gray-600 mb-1">Full plan lives in Evaluation; keep an eye on this barrier:</p>
          {Array.isArray(tradeSummary) && tradeSummary.length ? (
            <div className="text-xs text-gray-700">
              <strong>{tradeSummary[0]?.barrier || 'Barrier'}</strong>: {tradeSummary[0]?.incentive || '—'}
            </div>
          ) : (
            <div className="text-xs text-gray-500">No rows provided yet.</div>
          )}
        </div>
      ) : tradeOpportunity?.flag ? (
        <div className="border rounded p-3 bg-white">
          <div className="text-sm font-medium text-amber-800 mb-1">Trade opportunity</div>
          <p className="text-xs text-gray-700">{tradeOpportunity.why}</p>
          {tradeOpportunity.suggestion ? (
            <p className="text-[11px] text-gray-500 mt-1">{tradeOpportunity.suggestion}</p>
          ) : null}
        </div>
      ) : null}
      {!hasDiagnostics && (
        <div className="border rounded p-3 bg-slate-50 text-xs text-gray-500">
          Save & run an Evaluation to see OfferIQ, winnability, and trade cues alongside the builder.
        </div>
      )}
    </div>
  )
}

function OfferIQPanel({ offerIQ }) {
  const verdict = offerIQ?.verdict
  const confidence = typeof offerIQ?.confidence === 'number' ? Math.round(offerIQ.confidence * 100) : null
  const mode = offerIQ?.mode
  const hardFlags = Array.isArray(offerIQ?.hardFlags) ? offerIQ.hardFlags : []
  const asks = Array.isArray(offerIQ?.asks) ? offerIQ.asks : []
  const adequacyWhy = offerIQ?.lenses?.adequacy?.why
  const adequacyFix = offerIQ?.lenses?.adequacy?.fix

  return (
    <div className="mt-4 border rounded p-3 bg-white">
      <div className="text-sm font-medium mb-2">OfferIQ read</div>
      <div className="text-sm flex flex-wrap gap-3 items-center">
        {verdict ? <VerdictBadge verdict={verdict} /> : null}
        {confidence != null ? <span>Confidence: <span className="font-medium">{confidence}%</span></span> : null}
        {mode ? <span>Mode: <span className="font-medium">{mode}</span></span> : null}
        {!!hardFlags.length && (
          <span className="flex flex-wrap gap-1 items-center">
            Flags:
            {hardFlags.map((f, i) => (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded border bg-gray-50">{f}</span>
            ))}
          </span>
        )}
      </div>
      {(adequacyWhy || adequacyFix) && (
        <div className="mt-2 text-sm">
          {adequacyWhy ? <div><span className="font-medium">Adequacy:</span> {adequacyWhy}</div> : null}
          {adequacyFix ? <div className="text-gray-700"><span className="font-medium">Fix:</span> {adequacyFix}</div> : null}
        </div>
      )}
      {!!asks.length && (
        <div className="mt-2 text-xs text-gray-700">
          Asks: {asks.join(' • ')}
        </div>
      )}
    </div>
  )
}

function WinSensePanel({ winsense }) {
  if (!winsense) return null
  const dims = winsense.dimensions || {}
  const entries = [
    { key: 'frequency', label: 'Frequency', data: dims.frequency },
    { key: 'tiering', label: 'Tiering', data: dims.tiering },
    { key: 'cash', label: 'Value', data: dims.cash },
    { key: 'progress', label: 'Progress', data: dims.progress },
    { key: 'cadence', label: 'Cadence', data: dims.cadence },
  ]
  const density = typeof winsense.winnerDensityPerDay === 'number' ? winsense.winnerDensityPerDay : null
  return (
    <div className="border rounded p-3 bg-white">
      <div className="text-sm font-medium mb-1">Felt winnability</div>
      <div className="flex items-center gap-2 text-xs mb-2">
        <span>Overall:</span>
        <WinSenseBadge status={winsense.overallStatus} />
        {density != null ? (
          <span className="text-gray-500">{density.toFixed(1)} winners/day</span>
        ) : null}
      </div>
      <div className="space-y-1">
        {entries.map(({ key, label, data }) => (
          <div key={key} className="flex items-start justify-between gap-2 text-xs">
            <div className="flex-1 text-gray-700">
              <span className="font-medium">{label}</span>
              {data?.summary ? <span className="block text-gray-600">{data.summary}</span> : null}
            </div>
            <WinSenseBadge status={data?.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

function WinSenseBadge({ status }) {
  const code = String(status || 'UNKNOWN').toUpperCase()
  const map = {
    STRONG: 'bg-green-100 text-green-800 border-green-200',
    OK: 'bg-amber-100 text-amber-900 border-amber-200',
    WEAK: 'bg-red-100 text-red-800 border-red-200',
    UNKNOWN: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border ${map[code] || map.UNKNOWN}`}>
      {code}
    </span>
  )
}

function formatTimeAgo(date) {
  if (!date) return '—'
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return '—'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

function BenchmarkSnapshotCard({ framingBench, evalBench, researchMeta, stalePhases = [] }) {
  if (!framingBench && !evalBench && !researchMeta) return null

  const heroFraming = framingBench?.recommendedHeroCount ?? null
  const heroEval = evalBench?.recommendedHeroCount ?? null
  const mismatch = heroFraming != null && heroEval != null && heroFraming !== heroEval
  const prizeObs = evalBench?.prizeCountsObserved || framingBench?.prizeCountsObserved || null

  const cashback = evalBench?.cashback || framingBench?.cashback || null
  const typical = cashback?.typicalAbs ? `$${Math.round(cashback.typicalAbs)}` : (cashback?.typicalPct ? `${cashback.typicalPct}%` : '—')
  const max = cashback?.maxAbs ? `$${Math.round(cashback.maxAbs)}` : (cashback?.maxPct ? `${cashback.maxPct}%` : '—')
  const sample = cashback?.sample ?? '—'

  const cachedAt = researchMeta?.cachedAt ? new Date(researchMeta.cachedAt) : null
  const stale = cachedAt ? (Date.now() - cachedAt.getTime()) > (6 * 60 * 60 * 1000) : false
  const freshness = cachedAt ? `${formatTimeAgo(cachedAt)} • ${cachedAt.toLocaleString()}` : 'Research snapshot not run yet'
  const provider = researchMeta?.searchProvider || '—'
  const level = researchMeta?.level || '—'

  return (
    <div className="mb-3 border rounded p-3 bg-gray-50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <span className="text-sm font-medium">Benchmark snapshot</span>
        <span className={`text-xs ${stale ? 'text-amber-700' : 'text-gray-600'}`}>{freshness}</span>
      </div>
      <div className="grid md:grid-cols-3 gap-3 text-sm mt-3">
        <div className={`border rounded p-2 ${mismatch ? 'border-red-300 bg-red-50' : 'bg-white'}`}>
          <div className="font-medium mb-1">Hero prize guidance</div>
          <div>Framing: <strong>{heroFraming ?? '—'}</strong></div>
          <div>Evaluation: <strong>{heroEval ?? '—'}</strong></div>
          {prizeObs?.common?.length ? (
            <div className="mt-1 text-xs text-gray-600">
              Common hero counts: {prizeObs.common.map((c) => `${c.count} (${Math.round((c.share || 0) * 100)}%)`).join(', ')}
            </div>
          ) : null}
          <div className={`mt-1 text-xs ${mismatch ? 'text-red-700' : 'text-gray-600'}`}>
            {mismatch
              ? 'Mismatch detected — align downstream notes to Framing benchmarks.'
              : (heroFraming != null || heroEval != null)
                ? 'Consistent across phases.'
                : 'Run Framing to lock guidance.'}
          </div>
        </div>
        <div className="border rounded p-2 bg-white">
          <div className="font-medium mb-1">Cashback norms</div>
          <div>Typical headline: <strong>{typical}</strong></div>
          <div>Observed max: <strong>{max}</strong></div>
          <div>Sample size: <strong>{sample}</strong></div>
        </div>
        <div className={`border rounded p-2 ${stale ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
          <div className="font-medium mb-1">Research source</div>
          <div>Level: <strong>{level}</strong></div>
          <div>Provider: <strong>{provider}</strong></div>
          <div>Status: <strong>{stale ? 'Refresh recommended' : 'Fresh'}</strong></div>
          {stalePhases.length ? (
            <div className="mt-1 text-xs text-amber-700">
              Rerun {stalePhases.join(', ')} to sync with this snapshot.
            </div>
          ) : (
            <div className="mt-1 text-xs text-gray-600">Downstream outputs match this snapshot.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResearchPanel({ pack, overrides }) {
  if (!pack) return <div className="text-sm text-gray-600">Run Framing to capture a fresh research snapshot.</div>
  const meta = pack?.meta || {}
  const dossier = pack?.dossier || {}
  const sections = [
    ['Brand truths', dossier.brandTruths, 'brandTruths'],
    ['Shopper tensions', dossier.shopperTensions, 'shopperTensions'],
    ['Retailer reality', dossier.retailerReality, 'retailerReality'],
    ['Competitor moves', dossier.competitorMoves, 'competitorMoves'],
    ['Category signals', dossier.categorySignals, 'categorySignals'],
    ['Benchmarks', dossier.benchmarks, 'benchmarks'],
  ]
  const hasInsights = sections.some(([, entries]) => Array.isArray(entries) && entries.length)
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">
        Level: {meta.level || 'n/a'}
        {meta.cachedAt ? ` • Cached ${new Date(meta.cachedAt).toLocaleString()}` : ''}
        {meta.searchProvider ? ` • Provider: ${meta.searchProvider}` : ''}
      </div>
      {hasInsights ? (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map(([title, entries, key]) => {
            if (!Array.isArray(entries) || !entries.length) return null
            return (
              <div key={title} className={`border rounded p-3 bg-white space-y-2 ${overrides?.[key]?.length ? 'border-indigo-300 shadow-sm' : ''}`}>
                <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center justify-between">
                  <span>{title}</span>
                  {overrides?.[key]?.length ? <span className="text-[10px] text-indigo-600">Manual</span> : null}
                </div>
                <ul className="space-y-1 text-sm">
                  {entries.map((entry, idx) => (
                    <li key={`${title}-${idx}`}>
                      <span>{entry?.text || ''}</span>
                      {entry?.source ? (
                        <span className="block text-xs text-gray-500">{entry.source}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No curated insights yet. Re-run Framing to populate this dossier.</div>
      )}
    </div>
  )
}

function ResearchOverridesEditor({ dossier, draft, overrides, onSectionChange, onImportAuto, onClearSection, dirty, saving, onSave }) {
  const lastEdited = overrides?.updatedAt ? new Date(overrides.updatedAt) : null
  return (
    <div className="border rounded p-4 bg-white space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Curate research tiles</div>
          <div className="text-xs text-gray-600">Rewrite or replace any tile so the dossier stays world class.</div>
          {lastEdited ? (
            <div className="text-xs text-gray-500">Last edited {lastEdited.toLocaleString()}</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className={`px-3 py-1 text-sm rounded border ${dirty ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-100 text-gray-500 border-gray-200'} ${saving ? 'opacity-70' : ''}`}
          >
            {saving ? 'Saving…' : 'Save overrides'}
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {RESEARCH_SECTIONS.map(({ key, label }) => {
          const rows = Array.isArray(draft?.[key]) ? draft[key] : []
          const auto = Array.isArray(dossier?.[key]) ? dossier[key] : []
          const manual = rows.length > 0
          return (
            <div key={key} className="border rounded p-3 bg-white/70 space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                <span>{label}</span>
                {manual ? <span className="text-[10px] text-indigo-600">Manual</span> : null}
              </div>
              <div className="space-y-2">
                {rows.length ? rows.map((entry, idx) => (
                  <div key={`${key}-${idx}`} className="space-y-1">
                    <textarea
                      className="w-full border rounded px-2 py-1 text-sm"
                      rows={2}
                      placeholder="Write the definitive insight"
                      value={entry?.text || ''}
                      onChange={(e) => {
                        const next = rows.slice(0)
                        next[idx] = { ...next[idx], text: e.target.value }
                        onSectionChange(key, next)
                      }}
                    />
                    <input
                      className="w-full border rounded px-2 py-1 text-xs text-gray-700"
                      placeholder="Source (optional)"
                      value={entry?.source || ''}
                      onChange={(e) => {
                        const next = rows.slice(0)
                        next[idx] = { ...next[idx], source: e.target.value }
                        onSectionChange(key, next)
                      }}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] text-gray-500 hover:text-gray-800"
                        onClick={() => {
                          const next = rows.filter((_, i) => i !== idx)
                          onSectionChange(key, next)
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="text-xs text-gray-500">Using auto dossier.</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="px-2 py-1 border rounded"
                  disabled={rows.length >= MAX_OVERRIDE_ENTRIES}
                  onClick={() => {
                    if (rows.length >= MAX_OVERRIDE_ENTRIES) return
                    onSectionChange(key, [...rows, blankOverrideEntry()])
                  }}
                >
                  Add tile
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 border rounded ${auto.length ? '' : 'opacity-40 cursor-not-allowed'}`}
                  disabled={!auto.length}
                  onClick={() => onImportAuto(key)}
                >
                  Use auto tiles
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 border rounded ${rows.length ? '' : 'opacity-40 cursor-not-allowed'}`}
                  disabled={!rows.length}
                  onClick={() => onClearSection(key)}
                >
                  Clear
                </button>
              </div>
              {auto.length ? (
                <div className="text-[11px] text-gray-500 space-y-1">
                  <div className="font-semibold uppercase tracking-wide">Auto suggestions</div>
                  <ul className="space-y-1">
                    {auto.map((entry, idx) => (
                      <li key={`auto-${key}-${idx}`}>
                        <span>{entry?.text || ''}</span>
                        {entry?.source ? <span className="text-gray-400"> — {entry.source}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrefToggle({ label, description, value, onChange, saving, trueLabel = 'Enable', falseLabel = 'Disable' }) {
  return (
    <div className="border rounded p-3 bg-white flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-600">{description}</div>
      </div>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange(true)}
          className={`px-3 py-1 text-sm rounded border ${value === true ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-700 border-gray-300'}`}
        >
          {trueLabel}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange(false)}
          className={`px-3 py-1 text-sm rounded border ${value === false ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-700 border-gray-300'}`}
        >
          {falseLabel}
        </button>
      </div>
    </div>
  )
}

function BenchmarksPanel({ bm }) {
  const cb = bm?.cashback || {}
  const prizes = bm?.prizeCountsObserved || {}
  const rec = bm?.recommendedHeroCount
  const pos = String(bm?.positionVsMarket || 'UNKNOWN')
  const sources = Array.isArray(cb?.sources) ? cb.sources : []

  return (
    <div className="mt-4 border rounded p-3 bg-white">
      <div className="text-sm font-medium mb-2">Competitive benchmarks</div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div className="border rounded p-2">
          <div className="font-medium mb-1">Cashback (market)</div>
          <ul className="space-y-0.5">
            <li>Sample: <strong>{cb.sample ?? '—'}</strong></li>
            <li>Typical: <strong>{cb.typicalAbs ? `$${Math.round(cb.typicalAbs)}` : (cb.typicalPct ? `${cb.typicalPct}%` : '—')}</strong></li>
            <li>Max: <strong>{cb.maxAbs ? `$${Math.round(cb.maxAbs)}` : (cb.maxPct ? `${cb.maxPct}%` : '—')}</strong></li>
            {cb.p25 != null || cb.p75 != null ? (
              <li>IQR: <strong>{cb.p25 != null ? `$${Math.round(cb.p25)}` : '—'} — {cb.p75 != null ? `$${Math.round(cb.p75)}` : '—'}</strong></li>
            ) : null}
            <li>Position: <PosPill pos={pos} /></li>
          </ul>
          {sources.length ? (
            <div className="mt-2 text-xs text-gray-600">
              Sources (sample):<br />
              <ul className="list-disc pl-5 space-y-0.5">
                {sources.slice(0,6).map((s, i) => <li key={i} className="break-words">{s}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="border rounded p-2">
          <div className="font-medium mb-1">Prizes (observed)</div>
          <ul className="space-y-0.5">
            <li>Total sampled: <strong>{prizes.total ?? '—'}</strong></li>
            <li>Common hero counts: <strong>{Array.isArray(prizes.common) && prizes.common.length ? prizes.common.map(c => `${c.count} (${Math.round((c.share||0)*100)}%)`).join(', ') : '—'}</strong></li>
            <li>Recommended hero count: <strong>{rec ?? '—'}</strong></li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// Trade table
function TradeTable({ rows }) {
  if (!Array.isArray(rows) || !rows.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border rounded">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left p-2 border-b">Barrier</th>
            <th className="text-left p-2 border-b">Incentive</th>
            <th className="text-left p-2 border-b">How to run</th>
            <th className="text-left p-2 border-b">Guardrail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50 align-top">
              <td className="p-2 border-b whitespace-pre-wrap">{r?.barrier || ''}</td>
              <td className="p-2 border-b whitespace-pre-wrap">{r?.incentive || ''}</td>
              <td className="p-2 border-b whitespace-pre-wrap">{r?.how_to_run || ''}</td>
              <td className="p-2 border-b whitespace-pre-wrap">{r?.guardrail || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
  const makeId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `builder-${Date.now()}-${Math.random().toString(16).slice(2)}`
