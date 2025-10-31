// apps/backend/src/lib/context.ts
import type { Campaign, Brief } from '@prisma/client'

export type BriefSpec = {
  hook?: string
  mechanicOneLiner?: string
  objective?: string
  primaryKpi?: string
  secondaryKpis?: string[] | string
  retailers?: string[] | string
  tradeIncentive?: string
  typeOfPromotion?: string
  heroPrize?: string
  heroPrizeCount?: number | string
  runnerUps?: string[] | string
  prizeBudgetNotes?: string
  frictionBudget?: 'ONE_STEP' | 'TWO_STEP' | string
  bannedMechanics?: string[] | string
  calendarTheme?: string
  brandPosition?: 'LEADER' | 'FOLLOWER' | 'DISRUPTOR' | string
  startDate?: string
  endDate?: string

  // ------ NEW: portfolio / banner support ------
  isPortfolio?: boolean
  bannerName?: string
  // can be array of strings ("Guinness") or objects ({ name, role })
  brands?: Array<string | { name: string; role?: string }>
  brandNotes?: string

  [key: string]: any
}

export type CampaignContext = {
  id: string
  clientName: string | null
  title: string
  market: string | null
  category: string | null
  brandPosition: string | null
  mode: string
  status: string
  startDate: string | null
  endDate: string | null
  nowISO: string
  orientation: 'PAST' | 'LIVE' | 'FUTURE' | 'UNKNOWN'
  briefRaw: string | null
  briefSpec: BriefSpec
  assets: any[]
  timingWindow: string | null
}

function toArray(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return [String(v)]
}

// Normalize brands → [{ name, role? }]
function normalizeBrands(v: any): Array<{ name: string; role?: string }> {
  if (!v) return []
  const out: Array<{ name: string; role?: string }> = []
  const arr = Array.isArray(v) ? v : [v]
  for (const item of arr) {
    if (!item) continue
    if (typeof item === 'string') {
      // allow "Brand:ROLE" or just "Brand"
      const m = String(item).split(':').map(s => s.trim())
      const name = m[0]
      const role = m[1] || undefined
      if (name) out.push({ name, role })
    } else if (typeof item === 'object') {
      const name = String(item.name || '').trim()
      const role = item.role ? String(item.role).trim() : undefined
      if (name) out.push({ name, role })
    }
  }
  return out
}

export function orientationFromDates(
  start?: string | null,
  end?: string | null,
  now = new Date()
): 'PAST' | 'LIVE' | 'FUTURE' | 'UNKNOWN' {
  const s = start ? new Date(start) : null
  const e = end ? new Date(end) : null
  if (!s && !e) return 'UNKNOWN'
  if (e && e < now) return 'PAST'
  if (s && s > now) return 'FUTURE'
  return 'LIVE'
}

export function buildCampaignContext(row: Campaign & { brief?: Brief | null }): CampaignContext {
  const p: BriefSpec = (row.brief?.parsedJson && typeof row.brief.parsedJson === 'object')
    ? (row.brief.parsedJson as any)
    : {}

  // keep existing normalization
  p.retailers = toArray(p.retailers)
  p.runnerUps = toArray(p.runnerUps)
  p.bannedMechanics = toArray(p.bannedMechanics)
  p.secondaryKpis = toArray(p.secondaryKpis)

  // NEW: normalize portfolio fields
  p.isPortfolio = Boolean(p.isPortfolio)
  p.bannerName = p.bannerName ? String(p.bannerName).trim() : undefined
  p.brands = normalizeBrands(p.brands)
  p.brandNotes = p.brandNotes ? String(p.brandNotes).trim() : undefined

  const start = p.startDate || (row.startDate ? row.startDate.toISOString().slice(0, 10) : null)
  const end   = p.endDate   || (row.endDate   ? row.endDate.toISOString().slice(0, 10)   : null)

  return {
    id: row.id,
    clientName: row.clientName,
    title: row.title,
    market: row.market,
    category: row.category,
    brandPosition: (p.brandPosition as any) || null,
    mode: row.mode,
    status: row.status,
    startDate: start,
    endDate: end,
    nowISO: new Date().toISOString(),
    orientation: orientationFromDates(start, end),
    briefRaw: row.brief?.rawText || null,
    briefSpec: p,
    assets: [],
    timingWindow: start && end ? `${start} — ${end}` : null,
  }
}

export function renderBriefSnapshot(ctx: CampaignContext): string {
  const s = ctx.briefSpec || {}
  const parts: string[] = []

  parts.push(`Client: ${ctx.clientName || 'n/a'}`)
  parts.push(`Title: ${ctx.title}`)
  parts.push(`Market: ${ctx.market || 'n/a'} | Category: ${ctx.category || 'n/a'}`)
  if (ctx.timingWindow) parts.push(`Timing: ${ctx.timingWindow}`)
  parts.push(`Orientation: ${ctx.orientation}`)

  // NEW: Portfolio/banner lines appear immediately after header context if present
  if (s.isPortfolio || (Array.isArray(s.brands) && s.brands.length) || s.bannerName) {
    if (s.bannerName) parts.push(`Banner: ${s.bannerName}`)
    const brandList = (Array.isArray(s.brands) ? s.brands : []).map((b: any) => {
      const name = typeof b === 'string' ? b : String(b?.name || '').trim()
      const role = typeof b === 'object' && b?.role ? ` (${String(b.role)})` : ''
      return name ? `${name}${role}` : ''
    }).filter(Boolean)
    if (brandList.length) parts.push(`Participating brands: ${brandList.join(', ')}`)
    if (s.brandNotes) parts.push(`Brand notes: ${s.brandNotes}`)
  }

  // legacy/standard brief snapshot (unchanged)
  if (s.hook) parts.push(`Hook: ${s.hook}`)
  if (s.mechanicOneLiner) parts.push(`Mechanic: ${s.mechanicOneLiner}`)
  if (s.objective) parts.push(`Objective: ${s.objective}`)
  if (s.primaryKpi) parts.push(`Primary KPI: ${s.primaryKpi}`)
  const sk = toArray(s.secondaryKpis)
  if (sk.length) parts.push(`Secondary KPIs: ${sk.join(' | ')}`)
  const rs = toArray(s.retailers)
  if (rs.length) parts.push(`Retailers: ${rs.join(', ')}`)
  if (s.tradeIncentive) parts.push(`Trade incentive: ${s.tradeIncentive}`)
  if (s.typeOfPromotion) parts.push(`Promotion type: ${s.typeOfPromotion}`)
  if (s.heroPrize) parts.push(`Hero prize: ${s.heroPrize}${s.heroPrizeCount ? ` x${s.heroPrizeCount}` : ''}`)
  const ru = toArray(s.runnerUps)
  if (ru.length) parts.push(`Runner-ups: ${ru.join(', ')}`)
  if (s.prizeBudgetNotes) parts.push(`Prize notes: ${s.prizeBudgetNotes}`)
  if (s.frictionBudget) parts.push(`Friction budget: ${s.frictionBudget}`)
  const bm = toArray(s.bannedMechanics)
  if (bm.length) parts.push(`Banned mechanics: ${bm.join(', ')}`)
  if (s.calendarTheme) parts.push(`Calendar theme: ${s.calendarTheme}`)
  if (s.brandPosition) parts.push(`Brand position: ${s.brandPosition}`)

  if (ctx.briefRaw) {
    parts.push('')
    parts.push('Notes:')
    parts.push(ctx.briefRaw)
  }
  return parts.join('\n')
}
