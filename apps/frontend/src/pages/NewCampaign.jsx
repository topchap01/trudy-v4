import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createCampaign, getCampaign, putBrief, updateCampaign } from '../lib/campaigns.js'
import Button from '../components/Button.jsx'

/*
  NewCampaign — streamlined layout with proper assured/cashback handling
  (CTO surgical enhancements, no drift)
  - Adds "Start with Framing" (brand-only) path -> mode='CREATE', nav ?phase=framing&autorun=1
  - Fixes mode inference so default INSTANT_WIN doesn't force Evaluate until user touches the control
  - Keeps briefVersion: 3 and all existing payload fields/shape unchanged
*/

const PROMO_TYPES = [
  'INSTANT_WIN',
  'WEEKLY_DRAW',
  'GRAND_PRIZE_DRAW',
  'GWP',
  'CASHBACK',
  'MONEY_BACK_GUARANTEE',
  'PRICE_OFF',
  'MULTI_BUY',
  'LOYALTY_TIER',
  'SKILL_CONTEST',
  'REFERRAL',
  'SAMPLING',
  'TRADE_INCENTIVE',
]

const MEDIA_OPTIONS = [
  'In-store',
  'Digital',
  'Social',
  'Influencer',
  'OOH',
  'TV',
  'Radio',
  'PR',
  'Search',
  'Retail Media',
]

const ACTIVATION_CHANNEL_OPTIONS = [
  { value: 'ON_PREMISE', label: 'On-premise pubs & venues (bars, hotels, taverns)' },
  { value: 'LIQUOR_RETAIL', label: 'Liquor retail (Dan Murphy’s, BWS, independents)' },
  { value: 'GROCERY', label: 'Grocery multiples (Coles, Woolworths, ALDI, IGA)' },
  { value: 'CONVENIENCE', label: 'Convenience & petrol (7-Eleven, BP, Ampol, NightOwl)' },
  { value: 'ECOMMERCE', label: 'Ecommerce & delivery apps (Uber Eats, DoorDash, etc.)' },
  { value: 'EVENT', label: 'Experiential / events / festivals' },
  { value: 'DIGITAL', label: 'Digital-only activation (app, CRM, owned digital)' },
]

const RETAILER_TAG_OPTIONS = [
  { value: 'ON_PREMISE_PUBS', label: 'Pubs & hotels', group: 'On-premise venues' },
  { value: 'ON_PREMISE_IRISH', label: 'Irish pubs & themed venues', group: 'On-premise venues' },
  { value: 'ON_PREMISE_BARS', label: 'Bars & cocktail lounges', group: 'On-premise venues' },
  { value: 'LIQUOR_DAN_MURPHYS', label: "Dan Murphy’s", group: 'Liquor retail' },
  { value: 'LIQUOR_BWS', label: 'BWS', group: 'Liquor retail' },
  { value: 'LIQUOR_FIRST_CHOICE', label: 'First Choice / Vintage Cellars', group: 'Liquor retail' },
  { value: 'LIQUOR_INDEPENDENT', label: 'Independent bottle shops', group: 'Liquor retail' },
  { value: 'GROCERY_COLES', label: 'Coles', group: 'Grocery multiples' },
  { value: 'GROCERY_WOOLWORTHS', label: 'Woolworths', group: 'Grocery multiples' },
  { value: 'GROCERY_ALDI', label: 'ALDI', group: 'Grocery multiples' },
  { value: 'GROCERY_IGA', label: 'IGA / Metcash', group: 'Grocery multiples' },
  { value: 'CONVENIENCE_SERVO', label: 'Servo / petrol (BP, Ampol, 7-Eleven)', group: 'Convenience & petrol' },
  { value: 'CONVENIENCE_CHAIN', label: 'Convenience chains (7-Eleven, NightOwl)', group: 'Convenience & petrol' },
  { value: 'ECOMMERCE_DELIVERY', label: 'Delivery apps (Uber Eats, DoorDash)', group: 'Ecommerce & delivery' },
  { value: 'ECOMMERCE_RETAILER', label: 'Retailer online (Coles & Woolworths online)', group: 'Ecommerce & delivery' },
  { value: 'EVENT_FESTIVAL', label: 'Festival / pop-up activations', group: 'Experiential & events' },
  { value: 'SPECIALTY_BOUTIQUE', label: 'Specialty / boutique retailers', group: 'Specialty retail' },
]

const RETAILER_TAG_GROUPS = RETAILER_TAG_OPTIONS.reduce((acc, opt) => {
  acc[opt.group] = acc[opt.group] || []
  acc[opt.group].push(opt)
  return acc
}, {})

const REWARD_POSTURES = [
  { value: 'ASSURED', label: 'Assured — everyone receives the reward' },
  { value: 'HYBRID', label: 'Hybrid — guaranteed base plus hero overlay' },
  { value: 'CHANCE', label: 'Chance to win — classic prize structure' },
]

const MECHANIC_TYPE_OPTIONS = [
  { value: 'PURCHASE', label: 'Purchase required' },
  { value: 'UPLOAD_RECEIPT', label: 'Upload receipt' },
  { value: 'SCAN_QR', label: 'Scan QR code' },
  { value: 'LOYALTY_ID', label: 'Enter loyalty/member ID' },
  { value: 'CASHBACK', label: 'Cashback claim' },
  { value: 'PRIZE_DRAW', label: 'Chance-based draw' },
  { value: 'INSTANT_WIN', label: 'Instant win' },
  { value: 'APP_ENTRY', label: 'App / digital form' },
]

const AGE_BAND_OPTIONS = ['', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']

const LIFE_STAGE_OPTIONS = [
  '',
  'Students & early career',
  'Young professionals',
  'Young families',
  'Family builders',
  'Established households',
  'Empty nesters',
  'Retirees',
  'Hospitality staff',
  'Tradies & shift workers',
]

// --- NEW enums for clarity (brief JSON stays simple) ---
const PROOF_TYPES = ['NONE', 'LITE_RECEIPT', 'FULL_RECEIPT', 'SERIAL_NUMBER', 'WARRANTY']
const PROCESSING_TIMES = ['INSTANT', 'WITHIN_7_DAYS', 'WITHIN_28_DAYS']
const STAFF_BURDEN = ['ZERO', 'LOW', 'MEDIUM']
const CASHBACK_MODES = ['FLAT', 'PCT', 'BANDED'] // NEW
const IP_TYPES = [
  'FILM',
  'TV_SERIES',
  'SPORTING_EVENT',
  'MUSIC_EVENT',
  'GAMING',
  'CULTURE',
  'BRAND_COLLAB',
  'OTHER',
]

// --- Helpers ---
function csv(s) {
  return String(s || '')
    .split(/[,\\n]+/)
    .map(x => x.trim())
    .filter(Boolean)
}

function toCSV(value) {
  if (!value && value !== 0) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item == null) return ''
      return String(item).trim()
    }).filter(Boolean).join(', ')
  }
  return ''
}
function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function isTruthyText(s) { return typeof s === 'string' && s.trim().length > 0 }

function normaliseRewardPosture(raw, assuredFlag = false) {
  if (!raw && raw !== 0) return assuredFlag ? 'ASSURED' : 'CHANCE'
  const token = String(raw).trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (!token) return assuredFlag ? 'ASSURED' : 'CHANCE'
  if (token === 'ASSURED' || token === 'ASSUREDVALUE' || token === 'GUARANTEED' || token === 'CERTAIN') return 'ASSURED'
  if (token === 'HYBRID' || token === 'DUAL' || token === 'MIXED' || token === 'ASSUREDPLUSCHANCE') return 'HYBRID'
  if (token === 'CHANCE' || token === 'PRIZE' || token === 'DRAW') return 'CHANCE'
  return assuredFlag ? 'ASSURED' : 'CHANCE'
}

function toDateInput(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function normaliseCashbackBandsForForm(bands) {
  if (!Array.isArray(bands) || !bands.length) return [emptyBand('ABS')]
  const mapped = bands.map((band) => {
    const kind = band?.kind
      ? (band.kind === 'PCT' ? 'PCT' : 'ABS')
      : (band?.percent != null && band.percent !== '' ? 'PCT' : 'ABS')
    const rawValue = band?.value != null ? band.value : undefined
    const value = kind === 'PCT'
      ? (band?.percent != null ? String(band.percent) : (rawValue != null ? String(rawValue) : ''))
      : (band?.amount != null ? String(band.amount) : (rawValue != null ? String(rawValue) : ''))
    return {
      kind,
      value,
      minPrice: band?.minPrice != null ? String(band.minPrice) : (band?.min != null ? String(band.min) : ''),
      maxPrice: band?.maxPrice != null ? String(band.maxPrice) : (band?.max != null ? String(band.max) : ''),
      sku: band?.sku ? String(band.sku) : '',
      note: band?.label ? String(band.label) : (band?.note ? String(band.note) : ''),
    }
  }).filter(row => row.value !== '')
  return mapped.length ? mapped : [emptyBand('ABS')]
}

function buildIpPayload(enabled, { franchise, theme, activationType, eventWindow, partner, notes, licensed }) {
  if (!enabled) return null
  const payload = {
    franchise: franchise?.trim() || null,
    theme: theme?.trim() || null,
    activationType: activationType || null,
    eventWindow: eventWindow?.trim() || null,
    partner: partner?.trim() || null,
    notes: notes?.trim() || null,
    licensed: !!licensed,
  }
  const hasSignal = Boolean(
    payload.franchise ||
    payload.theme ||
    payload.activationType ||
    payload.eventWindow ||
    payload.partner ||
    payload.notes ||
    payload.licensed
  )
  return hasSignal ? payload : null
}

// Treat "type" as a real signal only if user deliberately touched the control
function inferMode(spec, { touchedType = false } = {}) {
  const hasHook = isTruthyText(spec.hook)
  const hasMech = isTruthyText(spec.mechanicOneLiner)
  const hasPrize = isTruthyText(spec.heroPrize) || (spec.heroPrizeCount ?? 0) > 0 || (spec.runnerUps?.length || 0) > 0
  const hasType = touchedType && isTruthyText(spec.typeOfPromotion)
  return (hasHook || hasMech || hasPrize || hasType) ? 'EVALUATE' : 'CREATE'
}
function validateDates(startDate, endDate) {
  if (!startDate || !endDate) return null
  try {
    const s = new Date(startDate)
    const e = new Date(endDate)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'Invalid date(s).'
    if (e < s) return 'End date must be after start date.'
    return null
  } catch { return 'Invalid date(s).' }
}

// --- Bands editor row helper ---
function emptyBand(kind = 'ABS') {
  return { kind, value: '', minPrice: '', maxPrice: '', sku: '', note: '' }
}

export default function NewCampaign() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [err, setErr] = useState('')

  // Essentials
  const [clientName, setClientName] = useState('')
  const [brand, setBrand] = useState('')
  const [title, setTitle] = useState('')
  const [market, setMarket] = useState('AU')
  const [category, setCategory] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Core spec
  const [brandPosture, setBrandPosture] = useState('LEADER')
  const [primaryObjective, setPrimaryObjective] = useState('')
  const [retailers, setRetailers] = useState('')
  const [activationChannels, setActivationChannels] = useState([])
  const [retailerTags, setRetailerTags] = useState([])
  const [channelNotes, setChannelNotes] = useState('')
  const [retailerFocusNotes, setRetailerFocusNotes] = useState('')
  const [rewardPosture, setRewardPosture] = useState('CHANCE')
  const [tradeIncentive, setTradeIncentive] = useState('')

// Creative
  const [hook, setHook] = useState('')
  const [mechanicOneLiner, setMechanicOneLiner] = useState('')
  const [mechanicTypes, setMechanicTypes] = useState([])

  // Prizes
const [heroPrize, setHeroPrize] = useState('')
const [heroPrizeCount, setHeroPrizeCount] = useState('')
const [runnerUps, setRunnerUps] = useState('')

// Compliance & calendar
const [regulatedCategory, setRegulatedCategory] = useState(false)
const [ageGate, setAgeGate] = useState(false)
const [themedEvent, setThemedEvent] = useState('')

// Media
const [media, setMedia] = useState([])

// Type
const [typeOfPromotion, setTypeOfPromotion] = useState('INSTANT_WIN')
const [builderMode, setBuilderMode] = useState(false)
const [touchedType, setTouchedType] = useState(false) // NEW

// IP / property tie-in
const [ipEnabled, setIpEnabled] = useState(false)
const [ipFranchise, setIpFranchise] = useState('')
const [ipTheme, setIpTheme] = useState('')
const [ipActivationType, setIpActivationType] = useState(IP_TYPES[0])
const [ipEventWindow, setIpEventWindow] = useState('')
const [ipPartner, setIpPartner] = useState('')
const [ipNotes, setIpNotes] = useState('')
const [ipLicensed, setIpLicensed] = useState(false)

// GWP
const [gwpItem, setGwpItem] = useState('')
const [gwpTriggerQty, setGwpTriggerQty] = useState('')
const [gwpCapUnlimited, setGwpCapUnlimited] = useState(true)
const [gwpCap, setGwpCap] = useState('')

  // Cashback (reworked)
  const [cashbackMode, setCashbackMode] = useState('FLAT') // FLAT | PCT | BANDED
  const [cashbackAmount, setCashbackAmount] = useState('') // for FLAT
  const [cashbackPercent, setCashbackPercent] = useState('') // for PCT
  const [cashbackCurrency, setCashbackCurrency] = useState('AUD')
  const [cashbackCapUnlimited, setCashbackCapUnlimited] = useState(true)
  const [cashbackCap, setCashbackCap] = useState('')
  const [cashbackProofRequired, setCashbackProofRequired] = useState(false)
const [cashbackProcessingDays, setCashbackProcessingDays] = useState('') // NEW
const [cashbackAssured, setCashbackAssured] = useState(true)
const [cashbackOdds, setCashbackOdds] = useState('')
const [cashbackBasePayout, setCashbackBasePayout] = useState('')
const [cashbackTopPayout, setCashbackTopPayout] = useState('')
const [cashbackBands, setCashbackBands] = useState([emptyBand('ABS')]) // for BANDED

  // Other promo types
  const [mbgTimeframeDays, setMbgTimeframeDays] = useState('')
  const [mbgConditions, setMbgConditions] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [discountType, setDiscountType] = useState('%')
  const [multiBuyOffer, setMultiBuyOffer] = useState('')
  const [loyaltySummary, setLoyaltySummary] = useState('')
  const [skillCriteria, setSkillCriteria] = useState('')
  const [referralReward, setReferralReward] = useState('')
  const [referralTwoSided, setReferralTwoSided] = useState(true)
  const [samplingChannel, setSamplingChannel] = useState('')
  const [samplingVolume, setSamplingVolume] = useState('')
  const [tradeAudience, setTradeAudience] = useState('')
  const [tradeReward, setTradeReward] = useState('')

  // Promotion shape & ops
const [assuredValue, setAssuredValue] = useState(false)
const [assuredItems, setAssuredItems] = useState('')
const [majorPrizeOverlay, setMajorPrizeOverlay] = useState('')
const [hasHeroPrizes, setHasHeroPrizes] = useState(() => Boolean((heroPrize && heroPrize.trim()) || (heroPrizeCount && String(heroPrizeCount).trim()) || (runnerUps && runnerUps.trim()) || (majorPrizeOverlay && majorPrizeOverlay.trim())))
const [proofType, setProofType] = useState('NONE')
const [processingTime, setProcessingTime] = useState('INSTANT')
const [entryMechanic, setEntryMechanic] = useState('')
const [staffBurden, setStaffBurden] = useState('ZERO')

  // Brand lens
  const [brandTruths, setBrandTruths] = useState('')
  const [distinctiveAssetsVisual, setDistinctiveAssetsVisual] = useState('')
  const [distinctiveAssetsVerbal, setDistinctiveAssetsVerbal] = useState('')
  const [distinctiveAssetsRitual, setDistinctiveAssetsRitual] = useState('')
  const [toneDo, setToneDo] = useState('')
  const [toneDont, setToneDont] = useState('')
  const [nonNegotiables, setNonNegotiables] = useState('')

  // Category & competitors
  const [buyerTensions, setBuyerTensions] = useState('')
  const [purchaseTriggers, setPurchaseTriggers] = useState('')
  const [competitors, setCompetitors] = useState('')

  // Audience persona
  const [audienceSummary, setAudienceSummary] = useState('')
  const [audienceAgeBand, setAudienceAgeBand] = useState('')
  const [audienceLifeStage, setAudienceLifeStage] = useState('')
  const [audienceMindset, setAudienceMindset] = useState('')
  const [audienceBehaviour, setAudienceBehaviour] = useState('')
  const [audienceSignals, setAudienceSignals] = useState('')

  // KPI & focus
  const [primaryKpi, setPrimaryKpi] = useState('')
  const [budgetBand, setBudgetBand] = useState('')
  const [skuFocus, setSkuFocus] = useState('')

  // Ops / OfferIQ signals (NEW)
const [avgPrice, setAvgPrice] = useState('') // average selling price anchor
const [expectedBuyers, setExpectedBuyers] = useState('')
const [totalWinnersEst, setTotalWinnersEst] = useState('')
const [breadthPrizeCount, setBreadthPrizeCount] = useState('')
const [prizePoolValue, setPrizePoolValue] = useState('')
const [claimFieldsCount, setClaimFieldsCount] = useState('')
const [screens, setScreens] = useState('')
const [appOnly, setAppOnly] = useState(false)

// Notes
const [rawNotes, setRawNotes] = useState('')

const hydrateFromData = useCallback((spec = {}, campaignRow = {}, rawText = '') => {
  setClientName(campaignRow.clientName || spec.client || '')
  setBrand(spec.brand || '')
  setTitle(campaignRow.title || spec.title || '')
  setMarket(campaignRow.market || spec.market || 'AU')
  setCategory(campaignRow.category || spec.category || '')
  setStartDate(toDateInput(campaignRow.startDate || spec.startDate || ''))
  setEndDate(toDateInput(campaignRow.endDate || spec.endDate || ''))

  setBrandPosture(spec.brandPosture || 'LEADER')
  setPrimaryObjective(spec.primaryObjective || spec.objective || '')
  setRetailers(toCSV(spec.retailers))
  setActivationChannels(Array.from(new Set(Array.isArray(spec.activationChannels) ? spec.activationChannels : csv(spec.activationChannels))))
  setRetailerTags(Array.from(new Set(Array.isArray(spec.retailerTags) ? spec.retailerTags : csv(spec.retailerTags))))
  setChannelNotes(spec.channelNotes || '')
  setRetailerFocusNotes(spec.retailerFocusNotes || '')
  const posture = normaliseRewardPosture(spec.rewardPosture, Boolean(spec.assuredValue || spec.cashback || spec.gwp))
  setRewardPosture(posture)
  setTradeIncentive(spec.tradeIncentive || '')

  setHook(spec.hook || '')
  setMechanicOneLiner(spec.mechanicOneLiner || '')
  setMechanicTypes(Array.isArray(spec.mechanicTypes) ? spec.mechanicTypes.filter(Boolean) : [])

  const heroEnabled = Boolean(spec.heroPrizeEnabled || spec.heroPrize || spec.heroPrizeCount)
  setHasHeroPrizes(heroEnabled)
  setHeroPrize(spec.heroPrize || '')
  setHeroPrizeCount(spec.heroPrizeCount != null ? String(spec.heroPrizeCount) : '')
  setRunnerUps(toCSV(spec.runnerUps))
  setPrizePoolValue(spec.prizePoolValue != null ? String(spec.prizePoolValue) : '')

  setRegulatedCategory(Boolean(spec.regulatedCategory))
  setAgeGate(Boolean(spec.ageGate))
  setThemedEvent(spec.calendarTheme || '')

  setMedia(Array.isArray(spec.media) ? spec.media : [])

  const incomingType = typeof spec.typeOfPromotion === 'string' ? spec.typeOfPromotion.trim() : ''
  if (incomingType) {
    setTypeOfPromotion(incomingType)
    setBuilderMode(false)
  } else {
    setTypeOfPromotion('')
    setBuilderMode(true)
  }
  setTouchedType(false)

  const ip =
    spec.ipTieIn ??
    spec.iptiein ??
    spec.ip_tie_in ??
    null
  const ipEnabledFlag = Boolean(
    ip?.franchise || ip?.theme || ip?.activationType || ip?.eventWindow || ip?.partner || ip?.notes || ip?.licensed
  )
  setIpEnabled(ipEnabledFlag)
  setIpFranchise(ip?.franchise || '')
  setIpTheme(ip?.theme || '')
  setIpActivationType(ip?.activationType || IP_TYPES[0])
  setIpEventWindow(ip?.eventWindow || '')
  setIpPartner(ip?.partner || '')
  setIpNotes(ip?.notes || '')
  setIpLicensed(Boolean(ip?.licensed))

  const gwp = spec.gwp || {}
  setGwpItem(gwp?.item || '')
  setGwpTriggerQty(gwp?.triggerQty != null ? String(gwp.triggerQty) : '')
  setGwpCapUnlimited(gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  setGwpCap(gwp && gwp.cap !== 'UNLIMITED' && gwp.cap != null ? String(gwp.cap) : '')

  const cashback = spec.cashback || {}
  const banded = Array.isArray(cashback.bands) && cashback.bands.length > 0
  const inferredMode = cashback.mode || (banded ? 'BANDED' : (cashback.percent != null ? 'PCT' : 'FLAT'))
  setCashbackMode(inferredMode)
  setCashbackAmount(cashback.amount != null ? String(cashback.amount) : '')
  setCashbackPercent(cashback.percent != null ? String(cashback.percent) : '')
  setCashbackCurrency(cashback.currency || 'AUD')
  setCashbackCapUnlimited(cashback.cap === 'UNLIMITED' || cashback.cap == null)
  setCashbackCap(cashback && cashback.cap !== 'UNLIMITED' && cashback.cap != null ? String(cashback.cap) : '')
  setCashbackProofRequired(Boolean(cashback.proofRequired))
  setCashbackProcessingDays(cashback.processingDays != null ? String(cashback.processingDays) : '')
  setCashbackAssured(cashback.assured !== false)
  setCashbackOdds(cashback.odds || '')
  setCashbackBasePayout(cashback.basePayout != null ? String(cashback.basePayout) : '')
  setCashbackTopPayout(cashback.topPayout != null ? String(cashback.topPayout) : '')
  setCashbackBands(normaliseCashbackBandsForForm(cashback.bands))

  setMbgTimeframeDays(spec.moneyBackGuarantee?.timeframeDays != null ? String(spec.moneyBackGuarantee.timeframeDays) : '')
  setMbgConditions(spec.moneyBackGuarantee?.conditions || '')
  setDiscountValue(spec.priceOff?.value != null ? String(spec.priceOff.value) : '')
  setDiscountType(spec.priceOff?.kind || '%')
  setMultiBuyOffer(spec.multiBuy?.offer || '')
  setLoyaltySummary(spec.loyaltyTier?.summary || '')
  setSkillCriteria(spec.skillContest?.criteria || '')
  setReferralReward(spec.referral?.reward || '')
  setReferralTwoSided(spec.referral?.twoSided !== undefined ? Boolean(spec.referral.twoSided) : true)
  setSamplingChannel(spec.sampling?.channel || '')
  setSamplingVolume(spec.sampling?.volume || '')
  setTradeAudience(spec.tradeIncentiveSpec?.audience || '')
  setTradeReward(spec.tradeIncentiveSpec?.reward || '')

  setAssuredValue(posture !== 'CHANCE')
  setAssuredItems(toCSV(spec.assuredItems))
  setMajorPrizeOverlay(typeof spec.majorPrizeOverlay === 'string' ? spec.majorPrizeOverlay : '')

  setProofType(spec.proofType || 'NONE')
  setProcessingTime(spec.processingTime || 'INSTANT')
  setEntryMechanic(spec.entryMechanic || '')
  setStaffBurden(spec.staffBurden || 'ZERO')

  setBrandTruths(toCSV(spec.brandTruths))
  setDistinctiveAssetsVisual(toCSV(spec.distinctiveAssets?.visual))
  setDistinctiveAssetsVerbal(toCSV(spec.distinctiveAssets?.verbal))
  setDistinctiveAssetsRitual(toCSV(spec.distinctiveAssets?.ritual))
  setToneDo(toCSV(spec.toneOfVoice?.do))
  setToneDont(toCSV(spec.toneOfVoice?.dont))
  setNonNegotiables(toCSV(spec.nonNegotiables))

  setBuyerTensions(toCSV(spec.buyerTensions))
  setPurchaseTriggers(toCSV(spec.purchaseTriggers))
  setCompetitors(toCSV(spec.competitors))

  setAudienceSummary(spec.audienceSummary || '')
  setAudienceAgeBand(spec.audienceAgeBand || '')
  setAudienceLifeStage(spec.audienceLifeStage || '')
  setAudienceMindset(spec.audienceMindset || '')
  setAudienceBehaviour(spec.audienceBehaviour || '')
  setAudienceSignals(toCSV(spec.audienceSignals))

  setPrimaryKpi(spec.primaryKpi || '')
  setBudgetBand(spec.budgetBand || '')
  setSkuFocus(toCSV(spec.skuFocus))

  const avg = spec.avgPrice ?? spec.averageSellingPrice
  setAvgPrice(avg != null ? String(avg) : '')
  setExpectedBuyers(spec.expectedBuyers != null ? String(spec.expectedBuyers) : '')
  setTotalWinnersEst(spec.totalWinners != null ? String(spec.totalWinners) : '')
  setBreadthPrizeCount(spec.breadthPrizeCount != null ? String(spec.breadthPrizeCount) : '')
  setClaimFieldsCount(spec.claimFieldsCount != null ? String(spec.claimFieldsCount) : '')
  setScreens(spec.screens != null ? String(spec.screens) : '')
  setAppOnly(Boolean(spec.appOnly))

  setRawNotes(rawText || '')
}, [
  setClientName,
  setBrand,
  setTitle,
  setMarket,
  setCategory,
  setStartDate,
  setEndDate,
  setBrandPosture,
  setPrimaryObjective,
  setRetailers,
  setActivationChannels,
  setRetailerTags,
  setChannelNotes,
  setRetailerFocusNotes,
  setRewardPosture,
  setTradeIncentive,
  setHook,
  setMechanicOneLiner,
  setMechanicTypes,
  setHasHeroPrizes,
  setHeroPrize,
  setHeroPrizeCount,
  setRunnerUps,
  setRegulatedCategory,
  setAgeGate,
  setThemedEvent,
  setMedia,
  setTypeOfPromotion,
  setBuilderMode,
  setTouchedType,
  setIpEnabled,
  setIpFranchise,
  setIpTheme,
  setIpActivationType,
  setIpEventWindow,
  setIpPartner,
  setIpNotes,
  setIpLicensed,
  setGwpItem,
  setGwpTriggerQty,
  setGwpCapUnlimited,
  setGwpCap,
  setCashbackMode,
  setCashbackAmount,
  setCashbackPercent,
  setCashbackCurrency,
  setCashbackCapUnlimited,
  setCashbackCap,
  setCashbackProofRequired,
  setCashbackProcessingDays,
  setCashbackBands,
  setMbgTimeframeDays,
  setMbgConditions,
  setDiscountValue,
  setDiscountType,
  setMultiBuyOffer,
  setLoyaltySummary,
  setSkillCriteria,
  setReferralReward,
  setReferralTwoSided,
  setSamplingChannel,
  setSamplingVolume,
  setTradeAudience,
  setTradeReward,
  setAssuredValue,
  setAssuredItems,
  setMajorPrizeOverlay,
  setProofType,
  setProcessingTime,
  setEntryMechanic,
  setStaffBurden,
  setBrandTruths,
  setDistinctiveAssetsVisual,
  setDistinctiveAssetsVerbal,
  setDistinctiveAssetsRitual,
  setToneDo,
  setToneDont,
  setNonNegotiables,
  setBuyerTensions,
  setPurchaseTriggers,
  setCompetitors,
  setAudienceSummary,
  setAudienceAgeBand,
  setAudienceLifeStage,
  setAudienceMindset,
  setAudienceBehaviour,
  setAudienceSignals,
  setPrimaryKpi,
  setBudgetBand,
  setSkuFocus,
  setAvgPrice,
  setExpectedBuyers,
  setTotalWinnersEst,
  setBreadthPrizeCount,
  setClaimFieldsCount,
  setScreens,
  setAppOnly,
  setRawNotes,
])

useEffect(() => {
  if (!isEditing || !id) {
    return
  }
  let cancelled = false
  async function load() {
    setLoading(true)
    setErr('')
    try {
      const campaignData = await getCampaign(id)
      if (cancelled) return
      const parsed = campaignData?.brief?.parsedJson || {}
      const raw = campaignData?.brief?.rawText || ''
      hydrateFromData(parsed, campaignData, raw)
    } catch (error) {
      if (!cancelled) setErr(error?.message || 'Failed to load campaign')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }
  load()
  return () => { cancelled = true }
}, [id, isEditing, hydrateFromData])

useEffect(() => {
  if (builderMode) {
    setTypeOfPromotion('')
    setTouchedType(false)
  } else if (!typeOfPromotion) {
    setTypeOfPromotion('INSTANT_WIN')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [builderMode])

const heroCountNumber = hasHeroPrizes ? numOrNull(heroPrizeCount) : null
const breadthCountNumber = numOrNull(breadthPrizeCount)
const autoTotalRaw = (heroCountNumber ?? 0) + (breadthCountNumber ?? 0)
const autoTotalDisplay = autoTotalRaw > 0 ? autoTotalRaw : null
  const ipTieInPayload = buildIpPayload(ipEnabled, {
    franchise: ipFranchise,
    theme: ipTheme,
    activationType: ipActivationType,
    eventWindow: ipEventWindow,
    partner: ipPartner,
  notes: ipNotes,
  licensed: ipLicensed,
})

if (isEditing && loading) {
  return <div className="p-6 text-sm text-gray-600">Loading campaign…</div>
}

const heading = isEditing ? 'Edit Campaign' : 'New Campaign'
const submitLabel = isEditing ? 'Save changes' : 'Create'

  function toggleMedia(name) {
    setMedia(m => (m.includes(name) ? m.filter(x => x !== name) : [...m, name]))
  }

  function toggleMechanicType(value) {
    setMechanicTypes(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  }

  function toggleActivationChannelValue(value) {
    setActivationChannels(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  }

  function toggleRetailerTagValue(value) {
    setRetailerTags(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  }

  function handleRewardPostureChange(nextValue) {
    setRewardPosture(nextValue)
    if (nextValue === 'ASSURED' || nextValue === 'HYBRID') {
      setAssuredValue(true)
    } else if (nextValue === 'CHANCE') {
      setAssuredValue(false)
    }
  }

  function buildTypeSpecific() {
    switch (typeOfPromotion) {
      case 'GWP':
        return {
          gwp: {
            item: gwpItem || null,
            triggerQty: gwpTriggerQty ? Number(gwpTriggerQty) : null,
            cap: gwpCapUnlimited ? 'UNLIMITED' : (gwpCap ? Number(gwpCap) : null),
          },
        }
      case 'CASHBACK': {
        const base = {
          currency: cashbackCurrency || 'AUD',
          cap: cashbackCapUnlimited ? 'UNLIMITED' : (cashbackCap ? Number(cashbackCap) : null),
          proofRequired: !!cashbackProofRequired,
          processingDays: cashbackProcessingDays ? Number(cashbackProcessingDays) : null,
          mode: cashbackMode,
          assured: !!cashbackAssured,
          odds: cashbackOdds.trim() ? cashbackOdds.trim() : null,
          basePayout: cashbackBasePayout ? Number(cashbackBasePayout) : null,
          topPayout: cashbackTopPayout ? Number(cashbackTopPayout) : null,
        }
        if (cashbackMode === 'FLAT') {
          return { cashback: { ...base, amount: cashbackAmount ? Number(cashbackAmount) : null } }
        }
        if (cashbackMode === 'PCT') {
          return { cashback: { ...base, percent: cashbackPercent ? Number(cashbackPercent) : null } }
        }
        const bands = (cashbackBands || []).map(r => ({
          minPrice: r.minPrice === '' ? null : Number(r.minPrice),
          maxPrice: r.maxPrice === '' ? null : Number(r.maxPrice),
          amount: r.kind === 'ABS' ? (r.value === '' ? null : Number(r.value)) : null,
          percent: r.kind === 'PCT' ? (r.value === '' ? null : Number(r.value)) : null,
          label: r.note?.trim() || null,
          sku: r.sku?.trim() || null,
        })).filter(b => (b.amount != null && Number.isFinite(b.amount)) || (b.percent != null && Number.isFinite(b.percent)))
        return { cashback: { ...base, bands } }
      }
      case 'MONEY_BACK_GUARANTEE':
        return { moneyBackGuarantee: { timeframeDays: numOrNull(mbgTimeframeDays), conditions: mbgConditions || null } }
      case 'PRICE_OFF':
        return { priceOff: { value: numOrNull(discountValue), kind: discountType } }
      case 'MULTI_BUY':
        return { multiBuy: { offer: multiBuyOffer || null } }
      case 'LOYALTY_TIER':
        return { loyaltyTier: { summary: loyaltySummary || null } }
      case 'SKILL_CONTEST':
        return { skillContest: { criteria: skillCriteria || null } }
      case 'REFERRAL':
        return { referral: { reward: referralReward || null, twoSided: !!referralTwoSided } }
      case 'SAMPLING':
        return { sampling: { channel: samplingChannel || null, volume: samplingVolume || null } }
      case 'TRADE_INCENTIVE':
        return { tradeIncentiveSpec: { audience: tradeAudience || null, reward: tradeReward || null } }
      default:
        return {}
    }
  }

  function buildSpec() {
    const heroPrizeEnabled = !!hasHeroPrizes
    const heroCount = heroPrizeEnabled ? numOrNull(heroPrizeCount) : null
    const breadthCount = numOrNull(breadthPrizeCount)
    const overrideTotal = numOrNull(totalWinnersEst)
    const computedTotal = (heroCount ?? 0) + (breadthCount ?? 0)
    const totalWinnersValue = overrideTotal != null ? overrideTotal : (computedTotal > 0 ? computedTotal : null)
    const prizePoolNumber = numOrNull(prizePoolValue)
    const assuredFlag = rewardPosture === 'ASSURED' || rewardPosture === 'HYBRID'
    const activationList = Array.from(new Set(activationChannels)).filter(Boolean)
    const retailerTagList = Array.from(new Set(retailerTags)).filter(Boolean)

    const mechanicTypesList = mechanicTypes.filter(Boolean)
    const runnerUpsList = csv(runnerUps).filter((entry) => entry && entry !== '0')

    const spec = {
      schema: 'trudy.v4.brief',
      briefVersion: 3,

      client: clientName || null,
      brand: brand || null,
      title,
      market,
      category,

      brandPosture,
      primaryObjective,

      retailers: csv(retailers),
      activationChannels: activationList,
      channelNotes: channelNotes || null,
      retailerTags: retailerTagList,
      retailerFocusNotes: retailerFocusNotes || null,
      rewardPosture,
      tradeIncentive: tradeIncentive || null,

      hook: hook || null,
      mechanicOneLiner: mechanicOneLiner || null,

      heroPrizeEnabled,
      heroPrize: heroPrizeEnabled ? (heroPrize || null) : null,
      heroPrizeCount: heroPrizeEnabled ? heroCount : null,
      runnerUps: runnerUpsList,

      typeOfPromotion: builderMode ? '' : typeOfPromotion,

      regulatedCategory: !!regulatedCategory,
      ageGate: !!ageGate,
      startDate: startDate || null,
      endDate: endDate || null,
      calendarTheme: themedEvent || null,

      media: [...media],

      ...buildTypeSpecific(),

      // Promotion shape & ops
      assuredValue: assuredFlag,
      assuredItems: csv(assuredItems),
      majorPrizeOverlay: heroPrizeEnabled ? (majorPrizeOverlay || null) : null,
      proofType,
      processingTime,
      entryMechanic: entryMechanic || null,
      staffBurden,
      ipTieIn: ipTieInPayload,

      // Brand lens
      brandTruths: csv(brandTruths),
      distinctiveAssets: {
        visual: csv(distinctiveAssetsVisual),
        verbal: csv(distinctiveAssetsVerbal),
        ritual: csv(distinctiveAssetsRitual),
      },
      toneOfVoice: { do: csv(toneDo), dont: csv(toneDont) },
      nonNegotiables: csv(nonNegotiables),

      // Category & competitors
      buyerTensions: csv(buyerTensions),
      purchaseTriggers: csv(purchaseTriggers),
      competitors: csv(competitors),

      // KPI & focus
      primaryKpi: primaryKpi || null,
      budgetBand: budgetBand || null,
      skuFocus: csv(skuFocus),

      // Audience persona
      audienceSummary: audienceSummary || null,
      audienceAgeBand: audienceAgeBand || null,
      audienceLifeStage: audienceLifeStage || null,
      audienceMindset: audienceMindset || null,
      audienceBehaviour: audienceBehaviour || null,
      audienceSignals: csv(audienceSignals),

      // Ops / OfferIQ signals (authoritative for scoring; safe to ignore if not used downstream)
      averageSellingPrice: numOrNull(avgPrice), // alias: avgPrice
      avgPrice: numOrNull(avgPrice),
      expectedBuyers: numOrNull(expectedBuyers),
      breadthPrizeCount: breadthCount,
      totalWinners: totalWinnersValue,
      prizePoolValue: prizePoolNumber,
      claimFieldsCount: numOrNull(claimFieldsCount),
      screens: numOrNull(screens),
      appOnly: !!appOnly,

      mechanicTypes: mechanicTypesList,
      visuals: [],
      observed: {},
    }
    const typeSpecific = buildTypeSpecific()
    const typeFields = [
      'cashback',
      'gwp',
      'moneyBackGuarantee',
      'priceOff',
      'multiBuy',
      'loyaltyTier',
      'skillContest',
      'referral',
      'sampling',
      'tradeIncentiveSpec',
    ]
    for (const key of typeFields) {
      if (!(key in typeSpecific)) {
        typeSpecific[key] = null
      }
    }
    return { ...spec, ...typeSpecific }
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!clientName?.trim() || !brand?.trim() || !title?.trim()) {
      setErr('Client, Brand, and Campaign Title are required.')
      return
    }
    const dateErr = validateDates(startDate, endDate)
    if (dateErr) {
      setErr(dateErr)
      return
    }

    const spec = buildSpec()
    const mode = inferMode(spec, { touchedType })

    try {
      setBusy(true)
      if (isEditing && id) {
        await updateCampaign(id, {
          clientName,
          title,
          market,
          category,
          mode,
          startDate: startDate || null,
          endDate: endDate || null,
        })
        await putBrief(id, { rawText: rawNotes || null, parsedJson: spec })
        nav(`/campaigns/${id}/war-room`)
      } else {
        const campaignPayload = {
          clientName,
          title,
          market,
          category,
          mode,
          startDate: startDate || null,
          endDate: endDate || null,
        }
        const c = await createCampaign(campaignPayload)
        await putBrief(c.id, { rawText: rawNotes || null, parsedJson: spec })
        const phase = mode === 'EVALUATE' ? 'evaluate' : 'framing'
        nav(`/campaigns/${c.id}/war-room?phase=${phase}&autorun=1`)
      }
    } catch (error) {
      setErr(error?.message || (isEditing ? 'Failed to update campaign' : 'Failed to create campaign'))
    } finally {
      setBusy(false)
    }
  }

  // Brand-only quick start for Framing (bypasses HTML "required")
  async function startFraming() {
    if (isEditing) return
    setBusy(true); setErr('')
    try {
      if (!brand?.trim()) throw new Error('Brand is required to start Framing.')
      const spec = buildSpec()
      // Ensure CREATE path by clearing concept signals
      spec.typeOfPromotion = ''
      spec.hook = null
      spec.mechanicOneLiner = null
      spec.heroPrize = null
      spec.heroPrizeCount = null
      spec.heroPrizeEnabled = false
      spec.breadthPrizeCount = null
      spec.totalWinners = null
      spec.runnerUps = []
      spec.ipTieIn = null
      spec.activationChannels = []
      spec.retailerTags = []
      spec.channelNotes = null
      spec.retailerFocusNotes = null
      spec.rewardPosture = 'CHANCE'
      spec.assuredValue = false
      spec.assuredItems = []
      spec.audienceSummary = null
      spec.audienceAgeBand = null
      spec.audienceLifeStage = null
      spec.audienceMindset = null
      spec.audienceBehaviour = null
      spec.audienceSignals = []
      // Safe fallbacks for campaign admin fields if blank
      const fallbackTitle = title?.trim() || `Framing — ${brand}`
      const fallbackClient = clientName?.trim() || brand
      const c = await createCampaign({
        clientName: fallbackClient,
        title: fallbackTitle,
        market,
        category,
        mode: 'CREATE',
        startDate: startDate || null,
        endDate: endDate || null,
      })
      await putBrief(c.id, { rawText: rawNotes || null, parsedJson: spec })
      nav(`/campaigns/${c.id}/war-room?phase=framing&autorun=1`)
    } catch (e) {
      setErr(e?.message || 'Failed to start framing')
    } finally { setBusy(false) }
  }

  // ------------- UI -------------
  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{heading}</h1>
        {!isEditing ? (
          <div className="flex gap-2">
            <Button type="button" loading={busy} onClick={startFraming}>Start with Framing</Button>
          </div>
        ) : null}
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      {/* Essentials */}
      <Panel title="Essentials">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Client (company)"><input className="w-full border rounded p-2" value={clientName} onChange={e=>setClientName(e.target.value)} required placeholder="Electrolux" /></L>
          <L label="Brand"><input className="w-full border rounded p-2" value={brand} onChange={e=>setBrand(e.target.value)} required placeholder="Westinghouse" /></L>
          <L label="Campaign Title"><input className="w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Spring Cash Splash" /></L>
          <L label="Market"><input className="w-full border rounded p-2" value={market} onChange={e=>setMarket(e.target.value)} placeholder="AU" /></L>
          <L label="Category"><input className="w-full border rounded p-2" value={category} onChange={e=>setCategory(e.target.value)} placeholder="Refrigeration" /></L>
          <L label="Start date"><input className="w-full border rounded p-2" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} /></L>
          <L label="End date"><input className="w-full border rounded p-2" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} /></L>
          <L label="Themed event (optional)"><input className="w-full border rounded p-2" value={themedEvent} onChange={e=>setThemedEvent(e.target.value)} placeholder="e.g., Spring, EOFY" /></L>
        </div>
      </Panel>

      {/* Value & Type */}
      <Panel title="Value & Type">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Primary type">
            <div className="space-y-2">
              <select
                className={`w-full border rounded p-2 ${builderMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                value={builderMode ? '' : typeOfPromotion}
                onChange={e => {
                  if (builderMode) return
                  setTypeOfPromotion(e.target.value)
                  setTouchedType(true)
                }}
                disabled={builderMode}
              >
                {PROMO_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {builderMode ? (
                <p className="text-xs text-gray-500">Promo Builder will set the promotion type once you save an idea.</p>
              ) : (
                <p className="text-xs text-gray-500">Pick the closest route now, or toggle “Builder-first” below to decide later.</p>
              )}
            </div>
          </L>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={builderMode}
                onChange={(e) => setBuilderMode(e.target.checked)}
              />
              <span>Builder-first: I’ll define mechanic/type later inside Promo Builder.</span>
            </label>
          </div>
          <div className="md:col-span-2">
            <L label="Reward posture">
              <div className="flex flex-col gap-2 text-sm">
                {REWARD_POSTURES.map(option => (
                  <label key={option.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="reward-posture"
                      value={option.value}
                      checked={rewardPosture === option.value}
                      onChange={() => handleRewardPostureChange(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </L>
          </div>
        </div>

        {assuredValue && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <L label="Assured items (comma)"><input className="w-full border rounded p-2" value={assuredItems} onChange={e=>setAssuredItems(e.target.value)} placeholder="e.g., T-shirt, Bonus filter" /></L>
          </div>
        )}

        {typeOfPromotion === 'CASHBACK' && (
          <div className="mt-3 border-t pt-3 space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <L label="Cashback mode">
                <select className="w-full border rounded p-2" value={cashbackMode} onChange={e=>setCashbackMode(e.target.value)}>
                  {CASHBACK_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </L>
              <L label="Currency"><input className="w-full border rounded p-2" value={cashbackCurrency} onChange={e=>setCashbackCurrency(e.target.value)} placeholder="AUD" /></L>
              <L label="Processing time (days)"><input className="w-full border rounded p-2" type="number" min="0" value={cashbackProcessingDays} onChange={e=>setCashbackProcessingDays(e.target.value)} placeholder="e.g., 7" /></L>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <L label="Guaranteed for every eligible claimant?">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={cashbackAssured} onChange={e=>setCashbackAssured(e.target.checked)} />
                  <span className="text-sm">Untick if this is an odds-based cashback (e.g., 1-in-3 wins).</span>
                </label>
              </L>
              {!cashbackAssured && (
                <L label="Odds / cadence copy">
                  <input className="w-full border rounded p-2" value={cashbackOdds} onChange={e=>setCashbackOdds(e.target.value)} placeholder="e.g., 1-in-3 wins $300; others $0" />
                </L>
              )}
            </div>
            {!cashbackAssured && (
              <div className="grid md:grid-cols-2 gap-3">
                <L label="Top payout ($)">
                  <input className="w-full border rounded p-2" type="number" min="0" value={cashbackTopPayout} onChange={e=>setCashbackTopPayout(e.target.value)} placeholder="e.g., 300" />
                </L>
                <L label="Base payout ($, optional)">
                  <input className="w-full border rounded p-2" type="number" min="0" value={cashbackBasePayout} onChange={e=>setCashbackBasePayout(e.target.value)} placeholder="e.g., 100 or 0" />
                </L>
              </div>
            )}

            {cashbackMode === 'FLAT' && (
              <div className="grid md:grid-cols-3 gap-3">
                <L label="Amount"><input className="w-full border rounded p-2" type="number" min="0" value={cashbackAmount} onChange={e=>setCashbackAmount(e.target.value)} placeholder="e.g., 250" /></L>
                <L label="Cap"><div className="flex items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackCapUnlimited} onChange={e=>setCashbackCapUnlimited(e.target.checked)} /><span>Unlimited</span></label>{!cashbackCapUnlimited && (<input className="flex-1 border rounded p-2" type="number" min="0" value={cashbackCap} onChange={e=>setCashbackCap(e.target.value)} placeholder="e.g., 5000 claims" />)}</div></L>
                <L label="Proof required?"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackProofRequired} onChange={e=>setCashbackProofRequired(e.target.checked)} /><span className="text-sm">Tick only if you truly need it.</span></label></L>
              </div>
            )}

            {cashbackMode === 'PCT' && (
              <div className="grid md:grid-cols-3 gap-3">
                <L label="Percent (%)"><input className="w-full border rounded p-2" type="number" min="0" value={cashbackPercent} onChange={e=>setCashbackPercent(e.target.value)} placeholder="e.g., 20" /></L>
                <L label="Cap"><div className="flex items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackCapUnlimited} onChange={e=>setCashbackCapUnlimited(e.target.checked)} /><span>Unlimited</span></label>{!cashbackCapUnlimited && (<input className="flex-1 border rounded p-2" type="number" min="0" value={cashbackCap} onChange={e=>setCashbackCap(e.target.value)} placeholder="e.g., 5000 claims" />)}</div></L>
                <L label="Proof required?"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackProofRequired} onChange={e=>setCashbackProofRequired(e.target.checked)} /><span className="text-sm">Tick only if you truly need it.</span></label></L>
              </div>
            )}

            {cashbackMode === 'BANDED' && (
              <div className="space-y-2">
                <BandsEditor rows={cashbackBands} setRows={setCashbackBands} />
                <div className="grid md:grid-cols-2 gap-3 mt-2">
                  <L label="Cap"><div className="flex items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackCapUnlimited} onChange={e=>setCashbackCapUnlimited(e.target.checked)} /><span>Unlimited</span></label>{!cashbackCapUnlimited && (<input className="flex-1 border rounded p-2" type="number" min="0" value={cashbackCap} onChange={e=>setCashbackCap(e.target.value)} placeholder="e.g., 5000 claims" />)}</div></L>
                  <L label="Proof required?"><label className="flex items-center gap-2"><input type="checkbox" checked={cashbackProofRequired} onChange={e=>setCashbackProofRequired(e.target.checked)} /><span className="text-sm">Tick only if you truly need it.</span></label></L>
                </div>
              </div>
            )}
          </div>
        )}

        {typeOfPromotion === 'GWP' && (
          <div className="mt-3 border-t pt-3">
            <div className="grid md:grid-cols-2 gap-3">
              <L label="Gift item"><input className="w-full border rounded p-2" value={gwpItem} onChange={e=>setGwpItem(e.target.value)} placeholder="e.g., Branded T-shirt" /></L>
              <L label="Trigger quantity"><input className="w-full border rounded p-2" type="number" min="1" value={gwpTriggerQty} onChange={e=>setGwpTriggerQty(e.target.value)} placeholder="e.g., 1" /></L>
              <L label="Cap"><div className="flex items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={gwpCapUnlimited} onChange={e=>setGwpCapUnlimited(e.target.checked)} /><span>Unlimited</span></label>{!gwpCapUnlimited && (<input className="flex-1 border rounded p-2" type="number" min="0" value={gwpCap} onChange={e=>setGwpCap(e.target.value)} placeholder="e.g., 5000" />)}</div></L>
            </div>
          </div>
        )}

        {typeOfPromotion === 'MONEY_BACK_GUARANTEE' && (
          <div className="mt-3 border-t pt-3 grid md:grid-cols-2 gap-3">
            <L label="Timeframe (days)"><input className="w-full border rounded p-2" type="number" min="0" value={mbgTimeframeDays} onChange={e=>setMbgTimeframeDays(e.target.value)} placeholder="e.g., 30" /></L>
            <L label="Conditions (short)"><input className="w-full border rounded p-2" value={mbgConditions} onChange={e=>setMbgConditions(e.target.value)} placeholder="e.g., Performance not as expected" /></L>
          </div>
        )}

        {typeOfPromotion === 'PRICE_OFF' && (
          <div className="mt-3 border-t pt-3 grid md:grid-cols-2 gap-3">
            <L label="Discount value"><input className="w-full border rounded p-2" type="number" min="0" value={discountValue} onChange={e=>setDiscountValue(e.target.value)} placeholder="e.g., 20" /></L>
            <L label="Type"><select className="w-full border rounded p-2" value={discountType} onChange={e=>setDiscountType(e.target.value)}><option value="%">%</option><option value="$">$</option></select></L>
          </div>
        )}

        <div className="mt-4 border-t pt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={hasHeroPrizes}
              onChange={(e) => setHasHeroPrizes(e.target.checked)}
            />
            <span>Include hero / major prize overlay</span>
          </label>
          <p className="text-xs text-gray-600">
            Use this when a limited hero prize (e.g., 3 chef experiences) sits on top of cashback or breadth prizes. Leave it off for breadth-only promos.
          </p>
          {hasHeroPrizes && (
            <div className="grid md:grid-cols-2 gap-3">
              <L label="Hero prize (description)">
                <input
                  className="w-full border rounded p-2"
                  value={heroPrize}
                  onChange={e=>setHeroPrize(e.target.value)}
                  placeholder="e.g., Chef experience worth $2,500"
                />
              </L>
              <L label="Hero winners (#)">
                <input
                  className="w-full border rounded p-2"
                  type="number"
                  min="0"
                  value={heroPrizeCount}
                  onChange={e=>setHeroPrizeCount(e.target.value)}
                  placeholder="e.g., 3"
                />
              </L>
              <L label="Overlay narrative / theme (optional)">
                <input
                  className="w-full border rounded p-2"
                  value={majorPrizeOverlay}
                  onChange={e=>setMajorPrizeOverlay(e.target.value)}
                  placeholder="e.g., VIP Chef's Table overlay"
                />
              </L>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Winners & Cadence">
        <div className="grid md:grid-cols-4 gap-3">
          <L label="Runner-up / secondary prizes (comma)">
            <input
              className="w-full border rounded p-2"
              value={runnerUps}
              onChange={e=>setRunnerUps(e.target.value)}
              placeholder="e.g., 150 x $50 gift cards"
            />
          </L>
          <L label="Breadth / instant winners (#)">
            <input
              className="w-full border rounded p-2"
              type="number"
              min="0"
              value={breadthPrizeCount}
              onChange={e=>setBreadthPrizeCount(e.target.value)}
              placeholder="e.g., 1,500"
            />
          </L>
          <L label="Total winners (override, optional)">
            <div>
              <input
                className="w-full border rounded p-2"
                type="number"
                min="0"
                value={totalWinnersEst}
                onChange={e=>setTotalWinnersEst(e.target.value)}
                placeholder="Auto = hero + breadth"
              />
              <div className="text-xs text-gray-500 mt-1">
                {autoTotalDisplay ? `Auto total from hero (${heroCountNumber ?? 0}) + breadth (${breadthCountNumber ?? 0}) = ${autoTotalDisplay}` : 'Auto total will populate once hero/breadth counts are set.'}
              </div>
            </div>
          </L>
          <L label="Prize pool value ($ retail)">
            <input
              className="w-full border rounded p-2"
              type="number"
              min="0"
              value={prizePoolValue}
              onChange={e=>setPrizePoolValue(e.target.value)}
              placeholder="e.g., 40000"
            />
            <div className="text-xs text-gray-500 mt-1">Needed for permits & OfferIQ budget checks.</div>
          </L>
        </div>
      </Panel>

      {/* Creative */}
      <Panel title="Creative">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Hook"><input className="w-full border rounded p-2" value={hook} onChange={e=>setHook(e.target.value)} placeholder="2–6 premium words" /></L>
          <L label="Mechanic (one line)"><input className="w-full border rounded p-2" value={mechanicOneLiner} onChange={e=>setMechanicOneLiner(e.target.value)} placeholder="Short, staff-zero line (avoid clichés)" /></L>
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium text-gray-800 mb-2">Mechanic types</div>
          <div className="grid md:grid-cols-2 gap-2">
            {MECHANIC_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mechanicTypes.includes(opt.value)}
                  onChange={() => toggleMechanicType(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Tag the mechanic so downstream agents know if it’s purchase + upload, QR scan, instant win, etc.
          </div>
        </div>
      </Panel>

      <Panel title="IP / Property Tie-in">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={ipEnabled}
            onChange={e => setIpEnabled(e.target.checked)}
          />
          <span>Campaign leverages an external IP / property (film, event, franchise…)</span>
        </label>
        <p className="text-xs text-gray-600">
          Capture the property details so downstream phases can keep tone, hooks, and guardrails aligned with licensing reality.
        </p>
        {ipEnabled && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <L label="Property / franchise name">
              <input
                className="w-full border rounded p-2"
                value={ipFranchise}
                onChange={e => setIpFranchise(e.target.value)}
                placeholder="e.g., Wicked (2024 film)"
              />
            </L>
            <L label="Theme / creative direction">
              <input
                className="w-full border rounded p-2"
                value={ipTheme}
                onChange={e => setIpTheme(e.target.value)}
                placeholder="e.g., Emerald magic, defy gravity, sisterhood"
              />
            </L>
            <L label="Property type">
              <select
                className="w-full border rounded p-2"
                value={ipActivationType}
                onChange={e => setIpActivationType(e.target.value)}
              >
                {IP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </L>
            <L label="Event / release window">
              <input
                className="w-full border rounded p-2"
                value={ipEventWindow}
                onChange={e => setIpEventWindow(e.target.value)}
                placeholder="e.g., Launch week 14–27 Nov"
              />
            </L>
            <L label="Rights partner / studio (optional)">
              <input
                className="w-full border rounded p-2"
                value={ipPartner}
                onChange={e => setIpPartner(e.target.value)}
                placeholder="e.g., Universal Pictures"
              />
            </L>
            <L label="Licence confirmed?">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ipLicensed}
                  onChange={e => setIpLicensed(e.target.checked)}
                />
                <span className="text-sm">Tick once rights are cleared</span>
              </label>
            </L>
            <L label="Usage notes / guardrails (optional)">
              <textarea
                className="w-full border rounded p-2"
                rows={3}
                value={ipNotes}
                onChange={e => setIpNotes(e.target.value)}
                placeholder="Mandatories, character lockups, no villain references, etc."
              />
            </L>
          </div>
        )}
      </Panel>

      {/* Channels & Retail */}
      <Panel title="Channels & Retail Focus">
        <div className="space-y-4">
          <L label="Activation channels">
            <div className="grid md:grid-cols-2 gap-2">
              {ACTIVATION_CHANNEL_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={activationChannels.includes(opt.value)}
                    onChange={() => toggleActivationChannelValue(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </L>

          <div>
            <div className="text-sm text-gray-700 font-medium mb-2">Retail banners to lock</div>
            <div className="grid md:grid-cols-2 gap-3">
              {Object.entries(RETAILER_TAG_GROUPS).map(([group, options]) => (
                <div key={group} className="border rounded-md p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{group}</div>
                  <div className="space-y-2">
                    {options.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={retailerTags.includes(opt.value)}
                          onChange={() => toggleRetailerTagValue(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <L label="Retail focus notes (optional)">
            <textarea
              className="w-full border rounded p-2"
              rows={2}
              value={retailerFocusNotes}
              onChange={e => setRetailerFocusNotes(e.target.value)}
              placeholder="e.g., Prioritise Irish pubs in VIC & NSW; avoid bottle shops with staff adjudication"
            />
          </L>

          <L label="Specific retailers (optional, comma)">
            <input
              className="w-full border rounded p-2"
              value={retailers}
              onChange={e => setRetailers(e.target.value)}
              placeholder="Harvey Norman, JB Hi-Fi, The Good Guys"
            />
          </L>

          <L label="Channel guardrails / ops notes (optional)">
            <textarea
              className="w-full border rounded p-2"
              rows={2}
              value={channelNotes}
              onChange={e => setChannelNotes(e.target.value)}
              placeholder="e.g., Zero staff lift; coasters + QR; merch packed per venue"
            />
          </L>

          <L label="Trade incentive (optional)">
            <input
              className="w-full border rounded p-2"
              value={tradeIncentive}
              onChange={e => setTradeIncentive(e.target.value)}
              placeholder="e.g., Display bonus for top stores"
            />
          </L>
        </div>
      </Panel>

      {/* Brand lens */}
      <Panel title="Brand Lens">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Brand truths (comma)"><input className="w-full border rounded p-2" value={brandTruths} onChange={e=>setBrandTruths(e.target.value)} placeholder="What is uniquely true of the brand" /></L>
          <L label="Distinctive assets — visual (comma)"><input className="w-full border rounded p-2" value={distinctiveAssetsVisual} onChange={e=>setDistinctiveAssetsVisual(e.target.value)} placeholder="Logo lockups, colour, shapes…" /></L>
          <L label="Distinctive assets — verbal (comma)"><input className="w-full border rounded p-2" value={distinctiveAssetsVerbal} onChange={e=>setDistinctiveAssetsVerbal(e.target.value)} placeholder="Taglines, phrases, sonic marks…" /></L>
          <L label="Distinctive assets — ritual (comma)"><input className="w-full border rounded p-2" value={distinctiveAssetsRitual} onChange={e=>setDistinctiveAssetsRitual(e.target.value)} placeholder="Usage rituals worth owning/breaking" /></L>
          <L label="Tone — do (comma)"><input className="w-full border rounded p-2" value={toneDo} onChange={e=>setToneDo(e.target.value)} placeholder="Plain, helpful, confident…" /></L>
          <L label="Tone — don't (comma)"><input className="w-full border rounded p-2" value={toneDont} onChange={e=>setToneDont(e.target.value)} placeholder="No clichés, no hard sell…" /></L>
          <L label="Non-negotiables (comma)"><input className="w-full border rounded p-2" value={nonNegotiables} onChange={e=>setNonNegotiables(e.target.value)} placeholder="Legal, product, brand guardrails" /></L>
        </div>
      </Panel>

      {/* Category & Competitors */}
      <Panel title="Category & Competitors">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Buyer tensions (comma)"><input className="w-full border rounded p-2" value={buyerTensions} onChange={e=>setBuyerTensions(e.target.value)} placeholder="Space vs capacity, energy rating vs price…" /></L>
          <L label="Purchase triggers (comma)"><input className="w-full border rounded p-2" value={purchaseTriggers} onChange={e=>setPurchaseTriggers(e.target.value)} placeholder="Renovation, moving, replacement failure…" /></L>
          <L label="Competitors (comma)"><input className="w-full border rounded p-2" value={competitors} onChange={e=>setCompetitors(e.target.value)} placeholder="Samsung, LG, Hisense…" /></L>
        </div>
      </Panel>

      <Panel title="Target Persona">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <L label="Primary audience summary">
              <textarea
                className="w-full border rounded p-2"
                rows={2}
                value={audienceSummary}
                onChange={e => setAudienceSummary(e.target.value)}
                placeholder="e.g., Australian men 25–44 who treat St Patrick’s Day as their pub Grand Final"
              />
            </L>
          </div>
          <L label="Age band">
            <select
              className="w-full border rounded p-2"
              value={audienceAgeBand}
              onChange={e => setAudienceAgeBand(e.target.value)}
            >
              {AGE_BAND_OPTIONS.map(opt => (
                <option key={opt || 'blank'} value={opt}>{opt ? opt : 'Select age band'}</option>
              ))}
            </select>
          </L>
          <L label="Life stage">
            <select
              className="w-full border rounded p-2"
              value={audienceLifeStage}
              onChange={e => setAudienceLifeStage(e.target.value)}
            >
              {LIFE_STAGE_OPTIONS.map(opt => (
                <option key={opt || 'blank'} value={opt}>{opt ? opt : 'Select life stage'}</option>
              ))}
            </select>
          </L>
          <L label="Mindset (short line)">
            <input
              className="w-full border rounded p-2"
              value={audienceMindset}
              onChange={e => setAudienceMindset(e.target.value)}
              placeholder="e.g., Pub loyalists chasing Irish ritual"
            />
          </L>
          <L label="Behaviour cue">
            <input
              className="w-full border rounded p-2"
              value={audienceBehaviour}
              onChange={e => setAudienceBehaviour(e.target.value)}
              placeholder="e.g., Weekly pint after work; follows live sport"
            />
          </L>
          <div className="md:col-span-2">
            <L label="Audience signals (comma)">
              <input
                className="w-full border rounded p-2"
                value={audienceSignals}
                onChange={e => setAudienceSignals(e.target.value)}
                placeholder="e.g., Men 25–44, Irish expats, Pub staff influencers"
              />
            </L>
          </div>
        </div>
      </Panel>

      {/* Ops (OfferIQ signals) */}
      <Panel title="Ops (for OfferIQ)">
        <div className="grid md:grid-cols-3 gap-3">
          <L label="Average selling price"><input className="w-full border rounded p-2" type="number" min="0" value={avgPrice} onChange={e=>setAvgPrice(e.target.value)} placeholder="e.g., 1200" /></L>
          <L label="Expected buyers / entries (est)"><input className="w-full border rounded p-2" type="number" min="0" value={expectedBuyers} onChange={e=>setExpectedBuyers(e.target.value)} placeholder="optional" /></L>
          <L label="Claim fields (count)"><input className="w-full border rounded p-2" type="number" min="0" value={claimFieldsCount} onChange={e=>setClaimFieldsCount(e.target.value)} placeholder="e.g., 4" /></L>
          <L label="Screens to complete first step"><input className="w-full border rounded p-2" type="number" min="0" value={screens} onChange={e=>setScreens(e.target.value)} placeholder="e.g., 1" /></L>
          <L label="App-only?"><label className="flex items-center gap-2"><input type="checkbox" checked={appOnly} onChange={e=>setAppOnly(e.target.checked)} /><span className="text-sm">Tick if redemption requires an app</span></label></L>
        </div>
      </Panel>

      {/* KPI & Focus */}
      <Panel title="KPI & Focus">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Primary KPI"><input className="w-full border rounded p-2" value={primaryKpi} onChange={e=>setPrimaryKpi(e.target.value)} placeholder="e.g., +8–12% ROS during promo window" /></L>
          <L label="Budget band (optional)"><input className="w-full border rounded p-2" value={budgetBand} onChange={e=>setBudgetBand(e.target.value)} placeholder="e.g., $250–400k" /></L>
          <L label="SKU focus (comma)"><input className="w-full border rounded p-2" value={skuFocus} onChange={e=>setSkuFocus(e.target.value)} placeholder="e.g., WRF520, WHE6000…" /></L>
        </div>
      </Panel>

      {/* Media */}
      <Panel title="Media Mix (optional)">
        <div className="grid md:grid-cols-2 gap-2">
          {MEDIA_OPTIONS.map(m => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={media.includes(m)} onChange={()=>toggleMedia(m)} />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </Panel>

      {/* Compliance */}
      <Panel title="Compliance">
        <div className="grid md:grid-cols-2 gap-3">
          <L label="Regulated category?"><label className="flex items-center gap-2"><input type="checkbox" checked={regulatedCategory} onChange={e=>setRegulatedCategory(e.target.checked)} /><span className="text-sm">Alcohol/gaming, etc.</span></label></L>
          <L label="Age gate needed?"><input type="checkbox" checked={ageGate} onChange={e=>setAgeGate(e.target.checked)} /></L>
          <L label="Proof type"><select className="w-full border rounded p-2" value={proofType} onChange={e=>setProofType(e.target.value)}>{PROOF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></L>
          <L label="Processing time"><select className="w-full border rounded p-2" value={processingTime} onChange={e=>setProcessingTime(e.target.value)}>{PROCESSING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></L>
          <L label="Entry mechanic (one sentence)"><input className="w-full border rounded p-2" value={entryMechanic} onChange={e=>setEntryMechanic(e.target.value)} placeholder="Describe plainly; avoid buzzwords" /></L>
          <L label="Staff burden (expected)"><select className="w-full border rounded p-2" value={staffBurden} onChange={e=>setStaffBurden(e.target.value)}>{STAFF_BURDEN.map(t => <option key={t} value={t}>{t}</option>)}</select></L>
        </div>
      </Panel>

      {/* Notes */}
      <L label="Notes to team (optional)"><textarea className="w-full border rounded p-2" rows={4} value={rawNotes} onChange={e=>setRawNotes(e.target.value)} placeholder="Anything else we should know…" /></L>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
        {!isEditing ? (
          <Button type="button" loading={busy} onClick={startFraming}>Start with Framing</Button>
        ) : null}
      </div>
    </form>
  )
}

function Panel({ title, children }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="font-medium">{title}</div>
      {children}
    </div>
  )
}

function L({ label, children }) {
  return (
    <label className="block text-sm">
      <div className="text-gray-700 mb-1">{label}</div>
      {children}
    </label>
  )
}

// --- Bands Editor (inline to keep single-file) ---
function BandsEditor({ rows, setRows }) {
  function update(i, patch) {
    setRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function add(kind = 'ABS') { setRows(rows => [...rows, emptyBand(kind)]) }
  function remove(i) { setRows(rows => rows.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium">Cashback bands</div>
        <div className="flex gap-2">
          <button type="button" className="px-2 py-1 border rounded" onClick={()=>add('ABS')}>+ ABS band</button>
          <button type="button" className="px-2 py-1 border rounded" onClick={()=>add('PCT')}>+ PCT band</button>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid md:grid-cols-6 gap-2 items-end">
            <div>
              <div className="text-xs text-gray-600 mb-1">Kind</div>
              <select className="w-full border rounded p-2" value={r.kind} onChange={e=>update(i,{kind:e.target.value})}>
                <option value="ABS">ABS ($)</option>
                <option value="PCT">PCT (%)</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Value</div>
              <input className="w-full border rounded p-2" type="number" min="0" value={r.value} onChange={e=>update(i,{value:e.target.value})} placeholder={r.kind==='PCT'?'% back':'$ back'} />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Min price (opt)</div>
              <input className="w-full border rounded p-2" type="number" min="0" value={r.minPrice} onChange={e=>update(i,{minPrice:e.target.value})} placeholder="e.g., 500" />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Max price (opt)</div>
              <input className="w-full border rounded p-2" type="number" min="0" value={r.maxPrice} onChange={e=>update(i,{maxPrice:e.target.value})} placeholder="e.g., 999" />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">SKU(s) (opt)</div>
              <input className="w-full border rounded p-2" value={r.sku} onChange={e=>update(i,{sku:e.target.value})} placeholder="e.g., WRF520" />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-2 py-1 border rounded" onClick={()=>remove(i)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
