import { prisma } from '../db/prisma.js'
import type { PlaybookSnippet } from '@prisma/client'
import { normaliseMarketCode } from './campaign-rules.js'
import type { BrandKnowledgeDossier } from './brand-knowledge.js'
import { ensureBrandKnowledge } from './brand-knowledge.js'

export type BenchmarkSlice = {
  breadthTypical?: number | null
  breadthStrong?: number | null
  cashbackTypicalPct?: number | null
  cashbackHighPct?: number | null
  cashbackMaxPct?: number | null
  heroCountTypical?: number | null
  heroCountStrong?: number | null
  cadenceHint?: string | null
  frictionHint?: string | null
  winnersPerDayTypical?: number | null
  winnersPerDayStrong?: number | null
  frequencyFrame?: string | null
  topPrizeSweetSpot?: number | null
  prizeTierGuidance?: Record<string, unknown> | null
  progressCueScore?: number | null
  source?: string | null
  confidence?: number | null
  metadata?: Record<string, unknown> | null
}

export type BenchmarkQuery = {
  market?: string | null
  category?: string | null
  promoType?: string | null
}

export type PlaybookQuery = {
  promoType: string
  useCase: string
  tone?: string
}

export type LlmInsightInput = {
  campaignId?: string | null
  market?: string | null
  category?: string | null
  promoType?: string | null
  intent: string
  payload: any
  prompt: string
  model: string
  confidence?: number | null
}

const benchmarkCache = new Map<string, BenchmarkSlice | null>()
const snippetCache = new Map<string, PlaybookSnippet[]>()
const founderCache = new Map<string, string[]>()

function benchmarkKey(query: BenchmarkQuery) {
  const market = normaliseMarketCode(query.market || '')
  const category = String(query.category || 'GENERIC').toUpperCase()
  const promo = String(query.promoType || 'ANY').toUpperCase()
  return `${market}::${category}::${promo}`
}

export async function getBenchmarkSlice(query: BenchmarkQuery): Promise<BenchmarkSlice | null> {
  const key = benchmarkKey(query)
  if (benchmarkCache.has(key)) {
    return benchmarkCache.get(key) ?? null
  }

  const marketCode = normaliseMarketCode(query.market || '')
  const categoryCode = String(query.category || 'GENERIC').toUpperCase()
  const promoType = String(query.promoType || 'ANY').toUpperCase()

  const rows = await prisma.$queryRaw<
    Array<{
      breadthTypical: number | null
      breadthStrong: number | null
      cashbackTypicalPct: number | null
      cashbackHighPct: number | null
      cashbackMaxPct: number | null
      heroCountTypical: number | null
      heroCountStrong: number | null
      cadenceHint: string | null
      frictionHint: string | null
      winnersPerDayTypical: number | null
      winnersPerDayStrong: number | null
      frequencyFrame: string | null
      topPrizeSweetSpot: number | null
      prizeTierGuidance: string | null
      progressCueScore: number | null
      source: string | null
      confidence: number | null
      metadata: string | null
    }>
  >`
    SELECT
      "breadthTypical",
      "breadthStrong",
      "cashbackTypicalPct",
      "cashbackHighPct",
      "cashbackMaxPct",
      "heroCountTypical",
      "heroCountStrong",
      "cadenceHint",
      "frictionHint",
      "winnersPerDayTypical",
      "winnersPerDayStrong",
      "frequencyFrame",
      "topPrizeSweetSpot",
      CAST("prizeTierGuidance" AS TEXT) AS "prizeTierGuidance",
      "progressCueScore",
      "source",
      "confidence",
      CAST("metadata" AS TEXT) AS "metadata"
    FROM "MarketCategoryBenchmark"
    WHERE "marketCode" = ${marketCode}
      AND "categoryCode" = ${categoryCode}
      AND "promoType" = ${promoType}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `

  const record = rows[0]

  if (!record) {
    benchmarkCache.set(key, null)
    return null
  }

  const slice: BenchmarkSlice = {
    breadthTypical: record.breadthTypical,
    breadthStrong: record.breadthStrong,
    cashbackTypicalPct: record.cashbackTypicalPct,
    cashbackHighPct: record.cashbackHighPct,
    cashbackMaxPct: record.cashbackMaxPct,
    heroCountTypical: record.heroCountTypical,
    heroCountStrong: record.heroCountStrong,
    cadenceHint: record.cadenceHint,
    frictionHint: record.frictionHint,
    winnersPerDayTypical: record.winnersPerDayTypical,
    winnersPerDayStrong: record.winnersPerDayStrong,
    frequencyFrame: record.frequencyFrame,
    topPrizeSweetSpot: record.topPrizeSweetSpot,
    prizeTierGuidance: parseJson(record.prizeTierGuidance),
    progressCueScore: record.progressCueScore,
    source: record.source,
    confidence: record.confidence,
    metadata: parseJson(record.metadata),
  }

  benchmarkCache.set(key, slice)
  return slice
}

function parseJson(value: string | Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function snippetKey(query: PlaybookQuery) {
  return `${query.promoType.toUpperCase()}::${query.useCase.toUpperCase()}::${(query.tone || 'ANY').toUpperCase()}`
}

export async function getPlaybookSnippets(query: PlaybookQuery): Promise<PlaybookSnippet[]> {
  const key = snippetKey(query)
  if (snippetCache.has(key)) {
    return snippetCache.get(key) ?? []
  }

  const promoType = query.promoType.toUpperCase()
  const useCase = query.useCase.toUpperCase()
  const tone = query.tone?.toUpperCase()

  const snippets = await prisma.playbookSnippet.findMany({
    where: {
      promoType,
      useCase,
      ...(tone ? { tone } : {}),
    },
    orderBy: [
      { confidence: 'desc' },
      { updatedAt: 'desc' },
    ],
  })

  snippetCache.set(key, snippets)
  return snippets
}

export function clearKnowledgeCache() {
  benchmarkCache.clear()
  snippetCache.clear()
  founderCache.clear()
}

function founderKey(scopeType: string, scopeId: string) {
  return `${scopeType.toUpperCase()}::${scopeId.toUpperCase()}`
}

export async function getFounderNotes(scope: { campaignId?: string | null; market?: string | null; category?: string | null; promoType?: string | null }): Promise<string[]> {
  const notes: string[] = []
  if (scope.campaignId) {
    const key = founderKey('CAMPAIGN', scope.campaignId)
    if (founderCache.has(key)) {
      notes.push(...(founderCache.get(key) || []))
    } else {
      const rows = await prisma.founderNote.findMany({
        where: { scopeType: 'CAMPAIGN', scopeId: scope.campaignId },
        orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
      })
      const values = rows.map((row) => row.guidance)
      founderCache.set(key, values)
      notes.push(...values)
    }
  }

  const marketCode = normaliseMarketCode(scope.market || '')
  const categoryCode = String(scope.category || 'GENERIC').toUpperCase()
  const promoType = String(scope.promoType || 'ANY').toUpperCase()
  const segmentId = `${marketCode}:${categoryCode}:${promoType}`
  const segmentKey = founderKey('SEGMENT', segmentId)
  if (founderCache.has(segmentKey)) {
    notes.push(...(founderCache.get(segmentKey) || []))
  } else {
    const rows = await prisma.founderNote.findMany({
      where: { scopeType: 'SEGMENT', scopeId: segmentId },
      orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
    })
    const values = rows.map((row) => row.guidance)
    founderCache.set(segmentKey, values)
    notes.push(...values)
  }

  return notes
}

type InsightEntry = { text: string; source?: string }
type BrandKnowledgeEntry = {
  brand: string
  aliases?: string[]
  markets?: string[]
  dossier: {
    brandTruths?: InsightEntry[]
    shopperTensions?: InsightEntry[]
    retailerReality?: InsightEntry[]
    competitorMoves?: InsightEntry[]
    categorySignals?: InsightEntry[]
    benchmarks?: InsightEntry[]
  }
}

const BRAND_KNOWLEDGE: BrandKnowledgeEntry[] = [
  {
    brand: 'Guinness',
    aliases: ['guinness', 'guinness au'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'Iconic but niche: globally powerful brand that behaves like a boutique import in Australia—penetration is low, loyalty is fierce, so even a small mobilisation of the passionate base moves share.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Occasion-led: draught Guinness is tied to St Patrick’s week, winter occasions, rugby nights, and Irish pub nostalgia rather than everyday beer repertoire.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Quality halo outruns volume: even non-drinkers describe Guinness as premium, artisan, and “a proper beer”, meaning fame and ritual carry more weight than current tap counts.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Pour ritual is magic and friction: the two-part pour and settle-to-creamy head are admired theatre, but impatient Aussies still see it as “faff” that needs justification.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Myth versus reality: most rejectors have never tried the current 4.2% ABV draught; they still believe it is heavy or too strong, so education plus first-sip moments unlock trial.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: '“It’s too heavy” is the default objection despite being lighter than many ales—misconception blocks the first pint more than flavour.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Australians hate waiting at the bar; without a visible cadence or entertainment, the slow pour becomes a reason to choose lager.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Trial access is lumpy: the fans live in Irish/CBD pubs but suburban drinkers rarely see a fresh pour, so curiosity never converts to habit.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Tap footprint is concentrated in Irish pubs and select CBD venues; suburban pubs and craft-centric venues often run Kilkenny, Murphy’s, or local stouts instead.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Off-premise shelves treat Guinness as a novelty import—low facings, wrong shelf, and little storytelling—so the brand’s premium halo never appears at shelf-edge.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Fanbases (Irish expats, rugby supporters, craft trialists, food people) exist in retailer CRM data but aren’t activated, so pubs rely on organic foot traffic around St Pat’s.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Local craft stouts and Kilkenny/Murphy’s step into Guinness handles when distribution slips, offering faster pours and lighter narratives.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'St Patrick’s Day is the Super Bowl: the week delivers the highest pint velocity of the year and sets the tone for winter trade.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Trial is everything: when someone experiences a perfect pour, conversion is high; awareness-heavy campaigns without sampling underperform.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Distribution, not demand, caps growth—most missed sales come from taps or fridges that never stocked the brand, not from consumers rejecting it.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'Huge brand equity, tiny volume base: a clear KPI (+8–12% ROS or pint velocity) tied to ritual storytelling outperforms generic “win merch” promotions.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
        {
          text: 'Protect the guarantee: promised merch or assured value must be visible and instant, otherwise consumers default to lager bundles.',
          source: 'Knowledge Grid • Guinness AU 2025',
        },
      ],
    },
  },
  {
    brand: 'Beko',
    aliases: ['beko', 'beko au', 'beko anz'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'European credibility at a value price: Beko sells “European-built quality” appliances at accessible price points, behaving like a smart-choice European challenger rather than a prestige badge.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Live like a Pro platform: the global purpose (evolved from Eat Like a Pro) promises pro-level features that enable healthier everyday living for normal households, but it rarely appears in AU retail storytelling.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Feature-rich, spec-driven catalogue: AutoDose washers, SteamCure, hybrid heat-pump dryers, and fast-wash cycles deliver “big tech for the money”, making Beko feel premium without the premium tag.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Health & sustainability halo under-leveraged: globally Beko is loud on healthy living and healthy planet credentials (Barça partnership, energy efficiency, recycled materials) but AU retail barely shows it.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: '#1 in Europe proof: Beko holds top share in UK/Ireland large appliances and carries “Best Value” badges overseas—powerful reassurance when Australian shoppers hesitate over a less familiar brand.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: 'Most shoppers arrive rational-first: they compare capacity, energy stars, noise, dimensions, warranty, and price, so Beko must win the spec sheet before layering in lifestyle emotion.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Awareness gap versus Bosch/LG/F&P means discovery happens in-store or on retailer sites; without floor-staff advocacy the brand gets lost among mid-tier rivals.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Shoppers want confidence that a “value” European brand will look after them—warranty, guarantees, and local support close the sale when the badge is less famous.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Retailer-led brand: The Good Guys, JB Hi-Fi, Betta/Powerland and NARTA groups are Beko’s primary channel; floor staff scripts and EDMs do more heavy lifting than ATL.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Australian HQ is in Ormeau, QLD, signalling a serious local operation rather than a grey import—use it to reassure partners about supply, service, and compliance.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Mid-market congestion: Beko sits shelf-to-shelf with Haier, Hisense, Westinghouse, Electrolux, LG, Samsung—planograms often reduce the story to specs and ticket price.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Haier/Hisense lean on aggressive price, while Bosch/F&P defend with heritage—Beko must force feature-to-price comparisons to justify switching from those incumbents.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'Australian appliance demand is mid-market heavy: shoppers balance value with a desire for European reliability, so “European giant, Aussie challenger” is a credible positioning.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Retailers expect promos that link to tangible benefits (energy savings, healthier cooking, sustainability credentials) rather than endless price-offs.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'European creds + 5-year warranty + money-back offers are proven closer bundles; combine them with feature education rather than raw discounting.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
        {
          text: 'Tie promotions to Live like a Pro/healthy planet proof (energy savings, reduced waste) to avoid being type-cast as “always on deal”.',
          source: 'Knowledge Grid • Beko AU 2025',
        },
      ],
    },
  },
  {
    brand: 'Vodafone',
    aliases: ['vodafone', 'vodafone au', 'vodafone australia'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'Perennial challenger: Vodafone is the #3 mobile network under TPG Telecom, positioned as the smart alternative rather than the automatic choice.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Competes on value: sharper pricing, big data inclusions, handset deals, and bundle offers define its market posture versus Telstra and Optus.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Coverage perception lags reality: “Vodafail” baggage persists even as TPG/Vodafone expand 4G/5G coverage and sign network-sharing deals that lift reach toward 98% of population.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Urban, younger skew: strongest in metro/inner-suburban postcodes with price-sensitive, deal-savvy customers who willingly switch providers.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Part of a multi-brand stable (TPG, iiNet, Lebara, Felix), so Vodafone must articulate a clear “why us” within its own family ladder.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: 'Coverage reassurance remains a hurdle—shoppers need proof (maps, guarantees, trials) that the network will work where they live and travel.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Deal-savvy base expect offers; if you over-train them to chase promos they will churn just as fast, so tenure rewards must balance acquisition hooks.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Lack of emotional platform: shoppers default to functional comparisons (price, data, handset) because Vodafone rarely tells a bigger story.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Omnichannel distribution with digital-first bias: Vodafone stores/kiosks, CE retailers, grocery/convenience for prepaid, plus comparison engines and SIM delivery online.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Portfolio tension inside TPG means channel and offer design must ladder clearly against TPG, iiNet, Lebara, Felix to avoid cannibalisation.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'SME segment sees Vodafone as the cheaper alternative to Telstra; credible satisfaction scores but still needs proof to displace the incumbent.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Telstra owns reliability; Optus oscillates between network promises and entertainment IP. Vodafone must counter with fairness/value proof plus coverage reassurance.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'Regulatory backdrop (TPG merger, Vocus fibre deal, Optus sharing) reinforces Vodafone as a lean challenger focused on consumer mobile + broadband.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Consumers increasingly use comparison sites/esim players—promos must be digitally fluent with clear value framing and instant fulfilment.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'Challenger mandate: acquisition offers can be bolder (bonus data, bill credits, handset trade-ins) because Vodafone must out-value Telstra/Optus to win consideration.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Coverage confidence boosters (maps, guarantees, try-and-switch windows) increase promo effectiveness by tackling the residual Vodafail stigma.',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
        {
          text: 'Define Vodafone’s ladder slot within TPG’s multi-brand family—mechanics and tone should signal “smart switcher value” versus ultra-budget (Lebara/Felix) or broadband-first (TPG).',
          source: 'Knowledge Grid • Vodafone AU 2025',
        },
      ],
    },
  },
  {
    brand: 'Wicked Sister',
    aliases: ['wicked sister', 'wickedsister'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'Chilled-dessert specialist: lives in the dairy fridge with rice puddings, crème caramel, panna cotta, mousse, tiramisu—competing more with custards and yoghurts than frozen treats.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Promise = everyday indulgence: “a little indulgence every day” for TV nights and post-work treats, not special-occasion luxury.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Local, founder-led heritage: born from a homemade rice pudding recipe in Bankstown—can credibly talk Aussie-made and real recipes even at supermarket scale.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Rice pudding remains the spiritual anchor—Madagascan vanilla bean, nostalgic creamy rice cues still define brand memory even as the range expands.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Duality of indulgent vs permissibly proteiny: dessert pots deliver “go on, be wicked” while high-protein/no-added-sugar SKUs keep the halo intact.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: 'Crowded chilled fixture: shoppers often default to yoghurt/private label unless there is shelf disruption or a flavour hook.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Need permission cues—single-serve pots and portion control make it easy to justify, so comms should reinforce “just one little treat”.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Consumers crave novelty: limited flavours and entertainment tie-ins drive trial; without news the brand can feel static next to yoghurt innovation.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Mass retailer brand (Coles, Aldi, NZ grocers) but easily overlooked; secondary displays, SRPs, and fins make a disproportionate difference.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Portion-controlled packs lend themselves to under-lid codes, QR scans, collectable lids—structure fits instant win mechanics perfectly.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Competes with yoghurt players pushing health cues and private label custards; needs indulgent flavour stories plus better shelf theatre to win the pick-up.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'Chilled desserts are a “treat in the trolley” buy—fast, permissible upgrades to weeknight meals rather than big entertainment desserts.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Limited-edition flavours and IP (e.g., Wicked film tie-in) are proven growth levers for chilled desserts; shoppers want collectability and novelty.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'Promos should lean into flavour exploration (“try all 3”, votes, hunts) instead of blunt price cuts; flavour news drives incrementality.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Shelf disruption + on-pack code = best response: one pot equals one entry, so instant win or scan-and-score mechanics map naturally.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
        {
          text: 'Tone can be playful, “naughty-nice”, and local all at once—use cheeky creative without losing the Aussie-made authenticity.',
          source: 'Knowledge Grid • Wicked Sister AU 2025',
        },
      ],
    },
  },
  {
    brand: 'Westinghouse',
    aliases: ['westinghouse', 'westinghouse appliances'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'Household name: generations of Australians grew up with Westinghouse ovens and fridges—trusted, dependable, familiar.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Mass mid-market comfort brand: positioned between bargain imports and designer luxury—“safe, sensible, it’ll do the job.”',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Brand promise “Happy to Help”: appliances are the quiet backup that rescue real-life family moments when things go sideways.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Australian designed/built: ovens crafted in Mascot, production in Adelaide—legit local proof in a sea of imports.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Backed by Electrolux engineering/service, giving trade partners confidence in after-sales support.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: 'Shoppers want no-risk choices—complex or flashy promos can feel off-brand compared with “reliable help”.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Function beats fancy: audiences value capacity, ease, safety over experimental tech; messaging should mirror that.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Distributed across Harvey Norman, The Good Guys, Appliances Online, independents—bundles and builder packages are core to sell-through.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Strong national service network shared with Electrolux makes warranties and installation services credible value-adds.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Premium players (Miele, AEG, Smeg) push designer kitchens; Beko/Hisense chase value. Westinghouse wins by owning dependable, Aussie-designed function.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'Project builders and renovators lean on “Australian-made” specs for compliance and consumer reassurance.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Family-life storytelling resonates: relatable chaos and quick recovery moments feel authentic for whitegoods.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'Promotions should underline reliability: installation + removal, extended service, “we’ll replace it if it fails” offers outperform gimmicks.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Retail-ready bundles (complete kitchen/laundry packages) and builder incentives align with channel reality.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
        {
          text: 'Local design/build claims justify modest price premiums—bake them into POS, warranty messaging, and value stacks.',
          source: 'Knowledge Grid • Westinghouse AU 2025',
        },
      ],
    },
  },
  {
    brand: 'ASUS',
    aliases: ['asus', 'rog', 'republic of gamers'],
    markets: ['AU'],
    dossier: {
      brandTruths: [
        {
          text: 'Perennial enthusiast badge: ASUS over-indexes with spec-obsessed shoppers and under-indexes with default buyers who opt for Apple, HP, Lenovo or Dell unless guided.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'ROG behaves like its own hero brand: Republic of Gamers carries swagger, esports credibility and cooling pedigree that often outshines the ASUS masterbrand in gaming corridors.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Innovation halo without mainstream glamour: dual-screen rigs, OLED panels and AI-ready laptops prove ASUS is inventive, yet casual shoppers still rank Apple as the emotional badge.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Value-for-spec advantage: spec-for-dollar comparisons routinely show ASUS delivering stronger GPUs/CPUs or displays at similar price points, rewarding “smart choice” buyers.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Quality perception is solid but not bulletproof: motherboard/GPU heritage builds trust, yet laptop forums still mix praise with reliability gripes, so reassurance matters.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
      shopperTensions: [
        {
          text: 'Range overload: Zenbook, Vivobook, TUF, ROG, ExpertBook and ProArt naming confuses casual shoppers who just want “a study laptop” or “a creator rig”.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Badge anxiety: mainstream buyers question whether ASUS is as premium as Apple/Dell, so they need warranties, testimonials or spec comparisons to feel confident.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'ROG swagger can intimidate hybrid work/study buyers who fear the machines are “too gamer” or overkill.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
      retailerReality: [
        {
          text: 'Retailer-led selling: JB Hi-Fi, Harvey Norman, The Good Guys and CE specialists move ASUS through hero bays, catalogues, bundles and finance offers more than ATL bursts.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Attach focus: monitors, mice, headsets and warranty add-ons are how floor staff lift basket size on ASUS systems.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Despite serious Taiwanese scale and local channel investment, ASUS can still be lumped with “other value brands” if the store story is weak.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
      competitorMoves: [
        {
          text: 'Apple owns aspirational “it just works”, Dell/Lenovo hold corporate trust—ASUS must lean on specs, innovation and gamer cred to win switches.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'HP, Acer and MSI also chase spec/value seekers, so ASUS needs clear buyer ladders (Study / Create / Game) to avoid price-only battles.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
      categorySignals: [
        {
          text: 'AI PC narrative is surging: ASUS pushes Copilot+/AI-capable Vivobook and Zenbook ranges, so promotions can anchor on “future-ready performance”.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Gaming drives premium traffic: ROG launches with bold design and esports positioning keep retailers hungry for activations.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Hybrid work/study buyers expect lighter builds, better battery and creator-friendly screens—ASUS has the hardware but must turn specs into human payoffs.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
      benchmarks: [
        {
          text: 'Decode the range into buyer jobs (Study, Create, Game, Work) at POS to lift conversion versus the wall of sameness.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Hero overlays tied to ROG challenges, creator residencies or AI productivity bootcamps outperform generic gift cards for this audience.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
        {
          text: 'Pair spec superiority with reassurance: extended warranties, local service promises and finance deals close the gap with established badges.',
          source: 'Knowledge Grid • ASUS AU 2025',
        },
      ],
    },
  },
]

function cloneInsightList(list?: InsightEntry[]): InsightEntry[] | undefined {
  if (!Array.isArray(list) || !list.length) return undefined
  return list.map((entry) => ({ text: entry.text, source: entry.source }))
}

type BrandDossierKey = keyof BrandKnowledgeEntry['dossier']
const BRAND_DOSSIER_KEYS: BrandDossierKey[] = [
  'brandTruths',
  'shopperTensions',
  'retailerReality',
  'competitorMoves',
  'categorySignals',
  'benchmarks',
]
const GPT_BRAND_SOURCE = 'Brand Knowledge • GPT ingest'

function convertAutoList(list?: string[] | null): InsightEntry[] | undefined {
  if (!Array.isArray(list) || !list.length) return undefined
  const entries = list
    .map((text) => (typeof text === 'string' ? text.trim() : ''))
    .filter(Boolean)
    .map((text) => ({ text, source: GPT_BRAND_SOURCE }))
  return entries.length ? entries : undefined
}

function convertAutoDossier(dossier?: BrandKnowledgeDossier | null) {
  if (!dossier) return {}
  return {
    brandTruths: convertAutoList(dossier.brandTruths),
    shopperTensions: convertAutoList(dossier.shopperTensions),
    retailerReality: convertAutoList(dossier.retailerReality),
    competitorMoves: convertAutoList(dossier.competitorMoves),
    categorySignals: convertAutoList(dossier.categorySignals),
    benchmarks: convertAutoList(dossier.benchmarks),
  } as Partial<Record<BrandDossierKey, InsightEntry[]>>
}

function dedupeInsightLists(lists: Array<InsightEntry[] | undefined>): InsightEntry[] | undefined {
  const merged: InsightEntry[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    if (!list?.length) continue
    for (const entry of list) {
      const text = entry?.text?.trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({
        text,
        source: entry.source,
      })
    }
  }
  return merged.length ? merged : undefined
}

function findStaticBrandEntry(brandKey: string, marketCode: string) {
  return BRAND_KNOWLEDGE.find((candidate) => {
    const aliasMatch =
      candidate.brand.toLowerCase() === brandKey ||
      (candidate.aliases || []).some((alias) => alias.toLowerCase() === brandKey)
    if (!aliasMatch) return false
    if (!candidate.markets || !candidate.markets.length) return true
    return candidate.markets.map((m) => normaliseMarketCode(m)).includes(marketCode)
  })
}

export async function getBrandDossierHints(brand?: string | null, market?: string | null) {
  if (!brand) return null
  const brandKey = brand.trim().toLowerCase()
  if (!brandKey) return null
  const marketCode = normaliseMarketCode(market || '')

  const autoDossier = await ensureBrandKnowledge(brand, marketCode)
  const staticEntry = findStaticBrandEntry(brandKey, marketCode)
  const autoHints = convertAutoDossier(autoDossier)

  const dossier: Partial<Record<BrandDossierKey, InsightEntry[]>> = {}
  for (const key of BRAND_DOSSIER_KEYS) {
    const lists: Array<InsightEntry[] | undefined> = []
    if (autoHints[key]) {
      lists.push(autoHints[key])
    }
    if (staticEntry?.dossier[key]) {
      lists.push(cloneInsightList(staticEntry.dossier[key]))
    }
    const merged = dedupeInsightLists(lists)
    if (merged) {
      dossier[key] = merged
    }
  }

  return Object.keys(dossier).length ? (dossier as Record<string, InsightEntry[]>) : null
}

export async function logLlmInsight(input: LlmInsightInput) {
  const marketCode = normaliseMarketCode(input.market || '')
  const categoryCode = String(input.category || 'GENERIC').toUpperCase()
  const promoType = String(input.promoType || 'ANY').toUpperCase()
  try {
    await prisma.llmInsightLog.create({
      data: {
        campaignId: input.campaignId || null,
        marketCode,
        categoryCode,
        promoType,
        intent: input.intent,
        payload: input.payload,
        prompt: input.prompt,
        model: input.model,
        confidence: input.confidence ?? 0.5,
      },
    })
  } catch (err) {
    console.warn('[knowledge-grid] failed to log LLM insight', err)
  }
}
