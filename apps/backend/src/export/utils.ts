const EASE_RX = /\b(one[-\s]?screen|one[-\s]?step|ocr|qr(?:\s*code)?|scan(?:\s*the)?\s*qr|receipt\s*upload|reduce\s*friction|frictionless|onboarding|ux|ui|fields?)\b/gi

export function normalizeText(value: any): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
}

export function sanitizeFraming(s: string): string {
  return s
    .split(/\r?\n/)
    .map(line =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[-*•\u2022\u00BB>\u2192]+\s*/, '')
    )
    .join('\n')
}

export function tidyText(value: string): string {
  return String(value || '')
    .replace(/\bbld\b/gi, 'build')
    .replace(/\bqck\b/gi, 'quick')
    .replace(/\breqring\b/gi, 'requiring')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function scrubEase(value: any): string {
  return String(value ?? '')
    .replace(EASE_RX, (match) => {
      const t = match.toLowerCase()
      if (t.includes('ocr')) return 'auto-capture'
      if (t.startsWith('qr')) return 'code'
      if (t.includes('receipt')) return 'proof handling'
      if (t.includes('one')) return 'quick'
      if (t === 'ux' || t === 'ui') return 'flow'
      if (t.includes('fields')) return 'form'
      return ''
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function escapeHtml(value: any): string {
  const s = String(value ?? '')
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeCssColor(value: string): string {
  return String(value).replace(/[^#(),.%a-zA-Z0-9\s-]/g, '').slice(0, 32)
}

export function isSafeUrl(value: any): boolean {
  try {
    const url = new URL(String(value))
    return ['http:', 'https:', 'data:'].includes(url.protocol)
  } catch {
    return false
  }
}

export function slug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function uniqLines(arr: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of arr || []) {
    const line = (raw || '').trim()
    if (!line) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

export function includesAny(haystack: string | string[] | undefined, needles: string[]): boolean {
  if (!haystack) return false
  const hay = Array.isArray(haystack) ? haystack.join(' ') : String(haystack)
  const lower = hay.toLowerCase()
  return needles.some((needle) => lower.includes(String(needle).toLowerCase()))
}

export function preferredBrand(ctx: any): string | null {
  const brand = (ctx?.briefSpec && (ctx.briefSpec as any).brand) ? String((ctx.briefSpec as any).brand) : ''
  return brand.trim() || null
}

export function isAssuredValue(ctx: any): boolean {
  const spec = ctx?.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const cashback = spec?.cashback || null
  const gwp = spec?.gwp
  const cashbackAssured =
    (type === 'CASHBACK' && (cashback ? cashback.assured !== false : true)) ||
    Boolean(cashback && cashback.assured !== false)
  const gwpAssured = (type === 'GWP' || !!gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  return Boolean(cashbackAssured || gwpAssured)
}

export function hasOverlayPrize(ctx: any): boolean {
  const spec = ctx?.briefSpec || {}
  return isAssuredValue(ctx) && Boolean(spec?.heroPrize)
}

export function isCashbackProofImplied(ctx: any): boolean {
  const spec = ctx?.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const notes = JSON.stringify(spec || {}).toLowerCase()
  return type === 'CASHBACK' || /cashback/.test(notes) || /receipt|upload|proof/.test(notes)
}

export function mdSafe(value: any): string {
  return escapeHtml(normalizeText(value)).replace(/\n/g, '<br/>')
}
