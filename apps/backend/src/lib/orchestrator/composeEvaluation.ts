// apps/backend/src/lib/orchestrator/composeEvaluation.ts
// Trudy v4 — Evaluation composer with Ferrier × Droga, PromoTrack lanes, and Heuristics
// Marketer-first voice. Prospective vs retrospective tone. No traffic lights.

import type { ActivationProfile, AudienceProfile } from '../context.js'

export type RuleFlex = 'KEEP' | 'BEND' | 'BREAK'
export type EvalMode = 'prospective' | 'retrospective'

type CampaignLite = {
  id: string
  title: string
  status: string
  market?: string | null
  category?: string | null
  clientName?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

type ComposeOptions = {
  ruleFlex?: RuleFlex
  evaluationMode?: EvalMode
  priorFraming?: string
  promotrackGuide?: string        // NEW: full guide text; we’ll distil to 3–5 lines
  heuristicsNote?: string | string[] // NEW: OPV/PR/IW/FREQ/Hassle/Prize/RAS/HCI summary
  ferrierDroga?: string[]         // NEW: optional override bullets for F×D take
  hooks?: string[]                // optional: candidate hooks to surface in section
  activationProfile?: ActivationProfile
  audienceProfile?: AudienceProfile
  rewardPosture?: 'ASSURED' | 'CHANCE' | 'HYBRID'
}

function coerceRewardPosture(raw?: string | null): 'ASSURED' | 'CHANCE' | 'HYBRID' | null {
  if (!raw) return null
  const token = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (!token) return null
  if (token === 'ASSURED' || token === 'ASSUREDVALUE' || token === 'GUARANTEED' || token === 'CERTAIN') return 'ASSURED'
  if (token === 'HYBRID' || token === 'DUAL' || token === 'MIXED' || token === 'ASSUREDPLUSCHANCE') return 'HYBRID'
  if (token === 'CHANCE' || token === 'PRIZE' || token === 'DRAW') return 'CHANCE'
  return null
}

function toISO(d?: Date | string | null) {
  if (!d) return null
  try { return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10) } catch { return null }
}

function inferMode(c: CampaignLite, override?: EvalMode): EvalMode {
  if (override) return override
  const today = new Date()
  const end = c.endDate ? new Date(c.endDate) : null
  if (end && end.getTime() < today.getTime()) return 'retrospective'
  return 'prospective'
}

function clean(text: string) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateLine(s: string, max = 180) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}

function stripSources(s: string) {
  return s
    .replace(/\(Source:[^)]+\)/gi, '')
    .replace(/\[Source:[^\]]+\]/gi, '')
    .replace(/Source:\s*[^\n]+/gi, '')
}

function bulletise(src?: string, maxItems = 5) {
  if (!src) return []
  let s = stripSources(src)

  // Turn "1) foo" / "1. foo" into lines.
  s = s.replace(/(?:^|\n)\s*\d+\s*[\)\.]\s*/g, '\n- ')
  // Ensure bullets start with "- "
  if (!/^- /m.test(s)) {
    const sentences = s.split(/(?<=\.)\s+/).map(x => x.trim()).filter(Boolean)
    s = sentences.map(x => `- ${x}`).join('\n')
  }

  const lines = s.split('\n').map(x => x.trim()).filter(Boolean)

  const bullets = lines
    .filter(x => x.startsWith('- '))
    .map(x => x.replace(/^-+\s*/, '- ').replace(/\s{2,}/g, ' '))
    .map(x => truncateLine(x.replace(/^\-\s*/, '')))
    .filter(Boolean)

  // De-dup loosely
  const seen = new Set<string>()
  const unique: string[] = []
  for (const b of bullets) {
    const k = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80)
    if (!seen.has(k)) { seen.add(k); unique.push(b) }
  }
  return unique.slice(0, maxItems)
}

function oxford(items: string[]) {
  if (!items || !items.length) return ''
  if (items.length === 1) return items[0]
  const head = items.slice(0, -1).join(', ')
  return `${head} and ${items[items.length - 1]}`
}

// --- PromoTrack distiller: pull 3–5 actionable lines
function distilPromoTrack(s?: string, max = 5): string[] {
  const b = bulletise(s || '', max + 2)
  // Keep items that smell like rules/patterns
  const keep = b.filter(x => /wins|outperforms|avoid|do not|weekly|instant|visible|receipt|one screen|odds|cash|cars|holidays/i.test(x))
  return (keep.length ? keep : b).slice(0, max)
}

// --- Heuristics normaliser: accept array or a single line; produce tidy bullets
function normaliseHeuristics(h?: string | string[]): string[] {
  if (!h) return []
  if (Array.isArray(h)) return h.map(x => truncateLine(x)).slice(0, 6)
  const m = h.match(/OPV\s*=\s*([0-9.]+)/i)
  const pr = h.match(/PR\s*=\s*([0-9.]+)/i)
  const iw = h.match(/IW\s*=\s*([0-9.]+)/i)
  const fq = h.match(/FREQ\s*=\s*([a-z0-9]+)/i)
  const fr = h.match(/Hassle\s*=\s*([a-z]+)/i)
  const pz = h.match(/Prize\s*=\s*([a-z]+)/i)
  const rs = h.match(/RAS\s*=\s*([0-9.]+)/i)
  const hc = h.match(/HCI\s*=\s*([0-9.]+)/i)
  const out: string[] = []
  if (m) out.push(`OPV (odds-per-visit) looks ~${m[1]} — make total winners visible.`)
  if (iw) out.push(`Instant-win index ~${iw[1]} — keep the dopamine loop.`)
  if (pr) out.push(`Perceived relevance ~${pr[1]} — ensure the reward feels “gettable”.`)
  if (fq) out.push(`Frequency cue ${fq[1]} — add a weekly moment.`)
  if (fr) out.push(`Hassle: ${fr[1]} — one screen, no receipt uploads.`)
  if (pz) out.push(`Prize shape: ${pz[1]} — mix instant + weekly + hero.`)
  if (rs) out.push(`Retailer ask score ~${rs[1]} — zero staff involvement.`)
  if (hc) out.push(`Hook clarity index ~${hc[1]} — keep it sharp, brand-locked, and fixture-ready.`)
  return out.slice(0, 6)
}

export function composeEvaluation(
  campaign: CampaignLite,
  opts: ComposeOptions = {}
): { content: string; meta: Record<string, any> } {
  const mode = inferMode(campaign, opts.evaluationMode)
  const market = (campaign.market || 'AU').toUpperCase()
  const category = (campaign.category || '').trim()
  const brand = (campaign.clientName || '').trim() || campaign.title.split('—')[0]?.trim() || 'Client'
  const title = campaign.title
  const startISO = toISO(campaign.startDate)
  const endISO = toISO(campaign.endDate)

  const activation = opts.activationProfile
  const audience = opts.audienceProfile
  const campaignPosture = coerceRewardPosture((campaign as any).rewardPosture)
  const rewardPosture = opts.rewardPosture
    ?? activation?.rewardPosture
    ?? campaignPosture
    ?? ((campaign as any).assuredValue ? 'ASSURED' : 'CHANCE')
  const isAssured = rewardPosture === 'ASSURED'
  const isHybrid = rewardPosture === 'HYBRID'
  const onPremise = Boolean(activation?.onPremise)

  const fallbackRetailers = market === 'AU'
    ? ['BP', '7-Eleven', 'Coles Express', 'Woolworths Metro', 'Independents']
    : ['Key convenience and grocery banners']
  const retailerGroups = activation?.retailerGroups?.length ? activation.retailerGroups : []
  const retailerBanners = activation?.retailerBanners?.length ? activation.retailerBanners : fallbackRetailers
  const retailerSummary = retailerGroups.length
    ? retailerGroups.join(', ')
    : oxford(retailerBanners)

  const baselineHeuristics = (() => {
    if (isAssured) {
      return [
        'Guaranteed value only works when confirmation is instant, visible, and undeniably premium.',
        'Publish nightly fulfilment and remaining inventory so the certainty stays credible.',
        'One scan, one screen, zero staff admin — bar teams should only pour.',
        'Seed social proof (photos, ticker, brag moments) so the guarantee travels beyond the venue.',
        'Central fulfilment with tracked dispatch keeps venues and compliance rock solid.',
      ]
    }
    if (isHybrid) {
      return [
        'Hero overlay must amplify the assured value, not overshadow it — make the core guarantee loud.',
        'Surface total winners and cadence for both the breadth and the hero moment.',
        'Keep friction ultra-low; instant feedback plus weekly theatre earns repeat.',
        'Zero staff involvement; adjudication and fulfilment stay in the war room.',
        'Publish proof-of-life for both tracks so buyers trust the fairness.',
      ]
    }
    return [
      'Instant wins and visible odds beat distant grand prizes in impulse.',
      'Cash/cars/holidays draw eyes, but category-credible rewards convert at shelf.',
      'One screen beats three; receipt uploads kill completion unless the rebate is real.',
      'Rhythm matters: give people something to do or win weekly.',
      'Zero staff involvement; validate and fulfil centrally.',
    ]
  })()

  // — Executive read —
  const execBullets = (() => {
    if (mode === 'retrospective') {
      if (isAssured) {
        return [
          'Certainty landed, but give the confirmation moment more theatre so regulars broadcast it.',
          'Venues that merchandised the guaranteed kit won; laggards need on-bar proof and prompts.',
          'Publish nightly “kits remaining” so scarcity feels controlled, not empty promises.',
          'Zero staff lift held — keep the QR + instant confirmation untouched.',
          'War-room fulfilment must stay same-night; anything slower erodes trust.',
        ]
      }
      return [
        'People got it in one glance; instant feedback likely built habit.',
        'Odds/total winners probably weren’t visible enough at shelf.',
        'Weekly micro-wins would have lifted repeat beyond week one.',
        'Patchy POS compliance hurt awareness in some banners.',
        'Fulfilment must land pre-Christmas; value halves after.',
      ]
    }
    if (isAssured) {
      return [
        'Lead with the guaranteed reward — show the pint-to-prize confirmation at the bar.',
        'Map nightly inventory so venues can promise certainty without fear of running dry.',
        'Use Irish ritual and social proof (merch in hand, Sir Guinness share) to fuel FOMO.',
        'Keep QR → confirmation to one screen; staff should pour, not adjudicate.',
        'Fulfil centrally and instantly; same-night comms keep the certainty believable.',
      ]
    }
    if (isHybrid) {
      return [
        'Make the assured tier the hero; use the overlay as theatre, not the headline.',
        'Spell out total winners across both tiers so odds feel fair.',
        'Keep weekly rhythm and instant reveals side-by-side to sustain momentum.',
        'Pre-packed kits + zero staff handling buys you range.',
        'Publish fulfilment SLAs so neither tier feels vaporware.',
      ]
    }
    return [
      'Keep “buy → scan → instant result” to one screen—no receipt upload.',
      'Lead with total winners so odds feel fair, not lottery-thin.',
      'Add daily/weekly wins beside the hero to build repeat.',
      'Pre-packed POS + zero staff handling buys you range.',
      'Publish and hit fulfilment SLAs—seasonal timing is unforgiving.',
    ]
  })()

  const opening = clean([
    `# Evaluation — ${title}`,
    `${brand} • ${market}${category ? ` • ${category}` : ''}${startISO || endISO ? ` • ${[startISO, endISO].filter(Boolean).join(' → ')}` : ''}`,
    '',
    '## Executive read (60 seconds)',
    ...execBullets.map(b => `- ${b}`),
  ].join('\n'))

  // — Framing —
  const framingBullets = bulletise(opts.priorFraming, 5)
  const framingBlock = framingBullets.length
    ? clean(['', '## Framing we honour', ...framingBullets.map(b => `- ${b}`)].join('\n'))
    : ''

  // — Ferrier × Droga take —
  const fdDefault =
    mode === 'retrospective'
      ? [
          'Behavioural truth: people chase “fair odds” more than “biggest prize.” Show the count, not the dream.',
          'Code to break: Christmas perfection. Reward the mess; it travels further in social.',
          'One brave bet: make the vest the story. Hero it. Name it. Ship it fast.',
        ]
      : [
          'Behavioural truth: speed and certainty beat fantasy in servo aisles.',
          'Code to break: polite Christmas. Push cheek, not cheer.',
          'One brave bet: public winners ticker—social proof at the fixture.',
        ]
  const ferrierDroga = (opts.ferrierDroga && opts.ferrierDroga.length ? opts.ferrierDroga : fdDefault)
  const fdBlock = clean(['', '## Ferrier × Droga take', ...ferrierDroga.map(b => `- ${b}`)].join('\n'))

  // — Where this sits —
  const audienceDescriptor =
    audience?.summary
      ?? (audience?.signals && audience.signals.length ? audience.signals.slice(0, 2).join(', ') : null)
  const whereThisSits = clean([
    '',
    '## Where this sits in the world',
    onPremise
      ? `In ${market}, pub teams pour pints, not paperwork — the activation has to resolve on the bar in under five seconds.`
      : `In ${market}, ${category || 'this category'} is noisy and fast. People are in a hurry, staff are under-slept, and the shelf does the selling.`,
    isAssured
      ? 'Certainty is the superpower: put the guaranteed reward in their hands, publish how many land each night, and turn fulfilment into theatre.'
      : 'The work has to stop them at the fixture, explain itself in five seconds, and feel like a fair shot at something they actually want.',
    audienceDescriptor
      ? `The core buyer: ${audienceDescriptor}. Speak in their code and prove the reward matches their night out.`
      : '',
    onPremise
      ? 'Competitors will keep pushing cashback or grocery overlays; the gap is a pub-native story with proof-in-hand and zero staff lift.'
      : 'Competitors default to tech/cash and influencer noise; the gap is simple odds, visible winners, and a voice that sounds like your brand—not a compliance department.',
  ].filter(Boolean).join('\n'))

  // — What worked / may stumble —
  const whatWorkedProspective = clean([
    '',
    '## What will likely work',
    ...(isAssured
      ? [
          '- The guaranteed Guinness reward makes every pint a story — perfect for pub regulars chasing St Patrick’s bragging rights.',
          '- One-scan confirmation at the bar delivers instant proof; merch in hand fuels the next round.',
          `- ${brand} can lean into Irish lore without cliché; a 5–7 word line only the brand could utter keeps it premium.`,
          '- Nightly inventory comms let venues promise certainty with confidence.',
          '- Central fulfilment keeps staff pouring while the war room handles validation.',
        ]
      : isHybrid
        ? [
            '- The assured tier keeps the promise credible; the hero overlay adds theatre without stealing the headline.',
            '- Instant feedback plus a scheduled moment give people two reasons to come back.',
            `- ${brand} can hold cheek and swagger; use hooks that make both tiers feel undeniably Guinness.`,
            '- Zero staff handling and pre-packed kits keep retailers aligned.',
            '- Publish cadence and total winners so the breadth feels gettable.',
          ]
        : [
            '- The entry is quick and phone-first; that alone wins in convenience.',
            '- The prize feels “gettable”, not mythical—good perceived odds lift participation.',
            '- “Scan → instant result” gives a dopamine loop; a weekly moment earns repeat.',
            `- ${brand} can carry cheek and mischief; use a 5–7 word line only you could say.`,
            '- Centralised fulfilment and zero staff handling keep retailers on side.',
          ]),
  ].join('\n'))

  const whatWorkedRetro = clean([
    '',
    '## What likely worked',
    ...(isAssured
      ? [
          '- The guarantee removed hesitation; once people saw merch in hand, word-of-mouth took over.',
          '- Venues that kept the reward on display and updated “kits remaining” drove repeat rounds.',
          '- Zero staff adjudication meant managers never blocked the activation.',
          '- Irish tone read premium, not novelty — the voice stayed recognisably Guinness.',
          '- Same-night fulfilment protected trust in the share reward.',
        ]
      : isHybrid
        ? [
            '- Assured and hero tiers played together; breadth made odds feel fair while the overlay drove chatter.',
            '- Instant reveals pushed routine participation; the bigger moment gave PR a spike.',
            '- Staff loved the set-and-forget kit; compliance never screamed.',
            '- The tone stayed on-brand, so the stretch read like Guinness, not a trade promo.',
            '- Publised totals and cadence sustained belief across the flight.',
          ]
        : [
            '- People understood it fast at shelf; the phone moment was short and satisfying.',
            '- The prize felt win-able; perceived odds drove entries in impulse banners.',
            '- Instant feedback built a habit loop across the core weeks.',
            '- The tone sounded like the brand, not a checklist—shareability followed.',
            '- Stores didn’t adjudicate anything; compliance stayed friendly.',
          ]),
  ].join('\n'))

  const whatHeldProspective = clean([
    '',
    '## Where it may stumble',
    ...(isAssured
      ? [
          '- If the guarantee feels abstract (no on-bar proof or inventory count), regulars will assume stock is gone.',
          '- Slow fulfilment or delayed share certificates kills trust — keep war-room dispatch same-night.',
          '- Any staff admin beyond handing over merch risks venues quietly opting out.',
          '- Without a winners ticker or photo proof, the certainty never travels beyond the first few pints.',
          '- Lean too hard into cliché Irish tropes and the voice stops sounding premium.',
        ]
      : isHybrid
        ? [
            '- If the overlay steals the headline, the assured tier will feel like a consolation prize.',
            '- Forgetting to publish totals across both tiers will make odds feel thin.',
            '- Extra steps for the hero moment (forms, uploads) will bleed repeat.',
            '- If fulfilment favours one tier over the other, trust collapses.',
            '- Mixing tonal registers (promo vs brand) will confuse retailers and punters alike.',
          ]
        : [
            '- If odds aren’t shown, people assume the worst—put total winners in sight.',
            '- A single grand prize reads like a lottery; mix in daily/weekly wins.',
            '- Anything beyond one screen will lose servo traffic; cut fields, pre-fill where possible.',
            '- If fulfilment misses the seasonal moment, perceived value collapses—publish SLAs.',
            '- Generic QR codes invite couch entries and bots—use unique IDs, throttle, log.',
          ]),
  ].join('\n'))

  const whatHeldRetro = clean([
    '',
    '## What likely held it back',
    ...(isAssured
      ? [
          '- Where merch wasn’t visible, people doubted the guarantee and skipped the scan.',
          '- Share certificates that landed days later flattened the excitement.',
          '- Venues without nightly inventory comms quietly stopped mentioning the promo.',
          '- A few staff-led workarounds crept in — once bartenders adjudicate, the promise feels shaky.',
          '- Tone drifted into “promo-speak” in some touchpoints; the charm disappeared.',
        ]
      : isHybrid
        ? [
            '- The overlay messaging overshadowed the breadth; people assumed thin odds.',
            '- Weekly theatre wasn’t loud enough; without it the routine tier felt standard.',
            '- Some stores missed the hero POS, so the story collapsed into “yet another promo”.',
            '- Fulfilment prioritised the overlay prizes; assured winners waited too long.',
            '- Social proof never landed, so the overlay read like hype rather than fact.',
          ]
        : [
            '- Odds weren’t visible enough; people guessed low and bounced.',
            '- The mix leaned on a final moment; weekly wins would have lifted repeat.',
            '- POS was patchy in places; awareness over-relied on on-pack.',
            '- Some winners got late fulfilment; value falls after the season.',
            '- Fraud controls were light early; a few device clusters likely spiked.',
          ]),
  ].join('\n'))

  // — Sharper spec —
  const sharperSpec = clean([
    '',
    '## Sharper spec (keep this tight)',
    ...(isAssured
      ? [
          '- **Five-second script:** “Buy a pint, scan once, pocket your guaranteed Guinness merch on the spot.”',
          '- **On the bar:** merch displayed, tonight’s inventory count, and the share-in-Sir-Guinness promise front and centre.',
          '- **Flow:** one mobile screen; instant confirmation plus digital receipt (no receipt uploads, no forms).',
          '- **Fulfilment:** war-room dispatch same night for share certificates; track hand-offs venue by venue.',
          '- **Proof:** rolling winners ticker/photo wall so every venue shows it’s real.',
        ]
      : isHybrid
        ? [
          '- **Five-second script:** “Scan for the sure thing; stay in to unlock the hero.”',
          '- **On display:** breadth and hero tier side-by-side with total winners for each.',
          '- **Flow:** one screen for the assured tier, optional short-form for the overlay (no receipts).',
          '- **Cadence:** publish nightly micro-wins plus the overlay calendar so both feel planned.',
          '- **Fulfilment:** central, discrete SLAs for each tier; share status dashboards with retailers.',
        ]
        : [
          '- **Five-second script:** “Buy any, scan the QR, see if you’ve won right now.”',
          '- **On the fixture:** total winners in big type; brand line in 5–7 words.',
          '- **Flow:** one mobile screen; age gate only if mandated; no receipt uploads.',
          '- **Winners:** daily/weekly micro-wins plus a hero; publish a rolling winners ticker.',
          '- **IDs:** unique codes (on-pack or POS), bot-throttling, audit log.',
          '- **Fulfilment:** central, tracked, with dates you publish and hit.',
        ]),
  ].join('\n'))

  // — Retailer —
  const retailerReality = clean([
    '',
    '## Retailer reality',
    retailerSummary ? `Activation focus: ${retailerSummary}.` : `Target banners: ${oxford(retailerBanners)}.`,
    activation?.retailerNotes ? activation.retailerNotes : '',
    onPremise
      ? 'Bar managers need set-and-forget: QR on coasters, merch within arm’s reach, staff only pouring.'
      : 'They want simple install, zero staff involvement, and proof it drives traffic and basket. Pre-packed kits win range.',
    isAssured || isHybrid
      ? 'Publish guaranteed inventory per venue and share nightly updates so no-one fears a phantom promise.'
      : 'Make perceived odds visible and maintain a winners ticker so fairness is undeniable.',
  ].filter(Boolean).join('\n'))

  // — Hooks —
  const hooksLines = (opts.hooks && opts.hooks.length ? opts.hooks : (
    isAssured
      ? [
          'Guaranteed Guinness. No Luck Needed.',
          'Your Pint. Your Merch. Tonight.',
          'Scan. Claim. Celebrate.',
        ]
      : isHybrid
        ? [
            'Sure Thing Now. Legend Later.',
            'Scan for the Certainty, Stay for the Hero.',
            'Every Round Lands Something.',
          ]
        : [
            'Win Instantly. No Slow Draws.',
            'Scan. See. Celebrate.',
            'Fair Odds. Fast Wins.',
          ]
  ))
const hooks = clean([
  '',
  '## Hooks worth testing',
  ...hooksLines.map(h => `- **${h}**`),
  'Hooks must fit in a single confident breath; if a staffer would stumble, rewrite it.',
].join('\n'))

  // — Proof (prospective vs retro) —
  const proofProspective = clean([
    '',
    '## Proof we’d want (as it runs)',
    ...(isAssured
      ? [
          '- Guaranteed kits claimed per night versus inventory promised.',
          '- % of venues posting proof-of-life (photo, ticker, winner shout) within the service window.',
          '- Average time from scan to merch-in-hand / share confirmation.',
          '- Repeaters per venue by week.',
          '- Any venue flags for stockouts or staff intervention.',
        ]
      : isHybrid
        ? [
            '- Entrants split between assured and overlay tiers (and conversion per tier).',
            '- Cadence visibility: % who saw total winners across both tracks.',
            '- Repeaters per tier by week.',
            '- Fulfilment SLA hit-rate for each tier.',
            '- Fraud flags or device clusters across either path.',
          ]
        : [
            '- Entry completion under 20s; drop-off under 25%.',
            '- % of traffic who saw visible odds on fixture.',
            '- Repeaters as a share of entrants by week.',
            '- Fulfilment SLA hit-rate during peak weeks.',
            '- Fraud flags: suspicious IP/device clusters.',
          ]),
  ].join('\n'))

  const proofRetro = clean([
    '',
    '## What we’d look at post-mortem',
    ...(isAssured
      ? [
          '- Guaranteed inventory delivered vs promised (venue by venue).',
          '- Time-to-fulfil for merch and share confirmation — where did it slip?',
          '- Repeaters and spend uplift per venue.',
          '- Volume of social proof generated organically (photos, mentions).',
          '- Any compliance or staff escalation incidents.',
        ]
      : isHybrid
        ? [
            '- Balance between tiers: entrants, conversion, fulfilment speed.',
            '- Visibility of total winners and how it affected repeat.',
            '- Overlay theatre vs assured retention — what drove the second visit?',
            '- POS compliance per archetype.',
            '- Fraud/invalidations vs total winners in each tier.',
          ]
        : [
            '- Entry completion time and where people bailed.',
            '- Repeaters as a % of total entrants by week.',
            '- POS compliance by banner/store archetype.',
            '- Fulfilment SLA hit-rate and effect on NPS.',
            '- Fraud/invalidations vs total winners.',
          ]),
  ].join('\n'))

  // — PromoTrack lanes —
  const promoTrackLines = distilPromoTrack(opts.promotrackGuide || '', 5)
  const promoTrackBlock = promoTrackLines.length
    ? clean(['', '## PromoTrack — green lanes', ...promoTrackLines.map(x => `- ${x}`)].join('\n'))
    : ''

  // — Heuristics —
  const heuristicsLines = normaliseHeuristics(opts.heuristicsNote)
  const heuristicsBlock = clean([
    '',
    '## Heuristics we’re watching',
    ...(heuristicsLines.length ? heuristicsLines : baselineHeuristics).map(x => `- ${x}`),
  ].join('\n'))

  const content = clean([
    opening,
    framingBlock,
    fdBlock,
    whereThisSits,
    mode === 'retrospective' ? whatWorkedRetro : whatWorkedProspective,
    mode === 'retrospective' ? whatHeldRetro : whatHeldProspective,
    sharperSpec,
    retailerReality,
    hooks,
    mode === 'retrospective' ? proofRetro : proofProspective,
    promoTrackBlock,
    heuristicsBlock,
    '', // newline
  ].join('\n'))

  const meta: Record<string, any> = {
    tone: mode,
    market,
    category,
    rewardPosture,
    ruleFlex: opts.ruleFlex || 'KEEP',
    ui: {
      verdict: mode === 'retrospective' ? 'REFLECTION' : 'PROPOSAL',
      hook: hooksLines[0],
      assuredValue: isAssured,
      mechanic: isAssured
        ? 'Buy → scan QR → guaranteed reward'
        : isHybrid
          ? 'Buy → scan QR → assured tier + overlay'
          : 'Buy → scan QR → instant result',
    },
    codeVersion: 'v4-eval-prose-au-locked',
  }
  if (activation) {
    meta.activation = {
      channels: activation.activationChannels,
      retailerGroups: activation.retailerGroups,
      retailerBanners,
      onPremise,
      rewardPosture: activation.rewardPosture,
      assuredValue: activation.assuredValue,
      zeroStaff: activation.zeroStaff,
    }
  }
  if (audience) {
    meta.audience = {
      summary: audience.summary,
      ageBand: audience.ageBand,
      lifeStage: audience.lifeStage,
      mindset: audience.mindset,
      behaviour: audience.behaviour,
      signals: audience.signals,
    }
  }

  return { content, meta }
}
