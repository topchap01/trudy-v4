import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE_FILE = fileURLToPath(new URL('../../docs/science/mechanic-rules.json', import.meta.url))

export type MechanicRule = {
  mechanic: string
  felt_value: string
  friction_risk: string
  brand_fit_congruency: string
  cadence_strength: string
  compliance_risk: string
  copy_moves?: string[]
  sludge_audit?: string[]
  sources?: string[]
}

let cache: Record<string, MechanicRule> | null = null

function loadMechanicRules(): Record<string, MechanicRule> {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(SOURCE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    console.warn('[mechanic-rules] failed to load rules', err)
    cache = {}
  }
  return cache!
}

const ALIASES: Record<string, string> = {
  CASHBACK: 'CASHBACK',
  REBATE: 'CASHBACK',
  PRICE_OFF: 'PRICE_OFF',
  DISCOUNT: 'PRICE_OFF',
  BOGO: 'BOGO',
  BONUSPACK: 'BOGO',
  BONUS_PACK: 'BOGO',
  GWP: 'GWP',
  LOYALTY: 'LOYALTY_STAMP',
  STAMP: 'LOYALTY_STAMP',
  COLLECT: 'LOYALTY_STAMP',
  INSTANT_WIN: 'INSTANT_WIN',
  RNG: 'INSTANT_WIN',
  SCARCITY: 'SCARCITY',
  URGENCY: 'SCARCITY',
  REFERRAL: 'REFERRAL',
  ADVOCATE: 'REFERRAL',
  BUNDLE: 'BUNDLE',
  WARRANTY: 'WARRANTY',
  EXTENDED_WARRANTY: 'WARRANTY',
  SPEND_AND_SAVE: 'PRICE_THRESHOLD',
  PRICE_THRESHOLD: 'PRICE_THRESHOLD',
}

export function getMechanicRule(rawType: string | null | undefined): MechanicRule | null {
  const rules = loadMechanicRules()
  if (!rawType) return null
  const key = rawType.trim().toUpperCase()
  const canonical = ALIASES[key] || key
  return rules[canonical] || null
}
