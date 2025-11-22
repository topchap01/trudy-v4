export const BUILDER_LANES = ['Hook', 'Value', 'Mechanic', 'Cadence', 'Strategy', 'Retailer', 'Trade', 'Compliance']

const randomId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `builder-${Date.now()}-${Math.random().toString(16).slice(2)}`

const cleanText = (value) => (value == null ? '' : String(value).trim())
const asArray = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [String(value).trim()].filter(Boolean)
}

const cashbackHasRealFields = (cb) => {
  if (!cb) return false
  const hasAmount =
    cb.amount != null && String(cb.amount).trim() !== ''
  const hasPercent =
    cb.percent != null && String(cb.percent).trim() !== ''
  const odds = typeof cb.odds === 'string' ? cb.odds.trim() : ''
  const processing = cb.processingDays != null && String(cb.processingDays).trim() !== ''
  const cap = cb.cap != null && String(cb.cap).trim() !== ''
  const basePayout = cb.basePayout != null && String(cb.basePayout).trim() !== ''
  const topPayout = cb.topPayout != null && String(cb.topPayout).trim() !== ''
  return hasAmount || hasPercent || Boolean(odds) || processing || cap || basePayout || topPayout
}

export function createEmptyWorkspace() {
  return BUILDER_LANES.map((lane) => ({ lane, entries: [] }))
}

export function workspaceHasEntries(workspace = createEmptyWorkspace()) {
  return workspace.some((column) => Array.isArray(column.entries) && column.entries.length > 0)
}

function cloneWorkspaceTemplate() {
  return createEmptyWorkspace().map((column) => ({ ...column, entries: [] }))
}

function pushEntry(workspace, lane, cardId, values) {
  return workspace.map((column) =>
    column.lane === lane
      ? { ...column, entries: [...column.entries, { id: randomId(), cardId, values }] }
      : column
  )
}

export function workspaceFromSpec(spec = {}) {
  let workspace = cloneWorkspaceTemplate()
  const add = (lane, cardId, values) => {
    workspace = pushEntry(workspace, lane, cardId, values)
  }

  if (spec.hook) {
    add('Hook', 'hook-core', {
      headline: spec.hook,
      support: '',
    })
  }

  if (cashbackHasRealFields(spec.cashback)) {
    const cb = spec.cashback || {}
    add('Value', 'value-cashback', {
      assured: cb.assured === true,
      amount: cb.amount != null ? String(cb.amount) : '',
      percent: cb.percent != null ? String(cb.percent) : '',
      odds: cb.odds || '',
      processing: cb.processingDays != null ? String(cb.processingDays) : '',
      cap:
        cb.cap == null
          ? ''
          : typeof cb.cap === 'number'
            ? String(cb.cap)
            : String(cb.cap),
      expected_claims: spec.expectedBuyers != null ? String(spec.expectedBuyers) : '',
      assured_summary:
        Array.isArray(spec.assuredItems) && spec.assuredItems.length
          ? spec.assuredItems.join('\n')
          : '',
    })
  }

  if (spec.heroPrize || spec.heroPrizeCount != null || spec.majorPrizeOverlay) {
    add('Value', 'value-hero', {
      hero_prize: cleanText(spec.heroPrize),
      hero_count: spec.heroPrizeCount != null ? String(spec.heroPrizeCount) : '',
      hero_overlay: typeof spec.majorPrizeOverlay === 'string' ? spec.majorPrizeOverlay : '',
    })
  }

  const metaRunnerUps = Array.isArray(spec?.builderMetadata?.runnerUps) ? spec.builderMetadata.runnerUps : []
  if (metaRunnerUps.length) {
    metaRunnerUps.forEach((entry) =>
      add('Value', 'value-runner', {
        prize: cleanText(entry.prize),
        qty: entry.qty != null ? String(entry.qty) : '',
        value: cleanText(entry.value),
        retailers: cleanText(entry.retailers),
      })
    )
  } else {
    const runners = asArray(spec.runnerUps)
    runners.forEach((text) =>
      add('Value', 'value-runner', {
        prize: text,
        qty: '',
        value: '',
        retailers: '',
      })
    )
  }

  if (
    spec?.gwp &&
    (spec.gwp.item ||
      spec.gwp.triggerQty != null ||
      spec.gwp.cap != null ||
      spec.gwp.rrp != null ||
      spec.gwp.netCost != null)
  ) {
    const gwp = spec.gwp
    add('Value', 'value-gwp', {
      item: cleanText(gwp.item),
      rrp: gwp.rrp != null ? String(gwp.rrp) : gwp.value != null ? String(gwp.value) : '',
      net_cost: gwp.netCost != null ? String(gwp.netCost) : '',
      trigger_qty: gwp.triggerQty != null ? String(gwp.triggerQty) : '',
      cap: gwp.cap === 'UNLIMITED' ? 'UNLIMITED' : gwp.cap != null ? String(gwp.cap) : '',
    })
  }

  if (spec.mechanicOneLiner || spec.entryMechanic || spec.staffBurden || spec.proofType) {
    add('Mechanic', 'mechanic-passport', {
      description: spec.mechanicOneLiner || spec.entryMechanic || '',
      trigger_qty: spec.gwp?.triggerQty != null ? String(spec.gwp.triggerQty) : '',
      proof_type: spec.proofType || '',
      staff_burden: spec.staffBurden || '',
    })
  } else {
    add('Mechanic', 'mechanic-passport', {
      description: '',
      trigger_qty: '',
      proof_type: '',
      staff_burden: '',
    })
  }

  if (spec.cadenceCopy) {
    add('Cadence', 'cadence-instant', {
      cadence_copy: spec.cadenceCopy,
      winner_vis: '',
    })
  } else {
    add('Cadence', 'cadence-instant', {
      cadence_copy: '',
      winner_vis: '',
    })
  }

  const objective = cleanText(spec.primaryObjective || spec.objective || '')
  const kpi = cleanText(spec.primaryKpi || '')
  const measurement = cleanText(spec.measurementNotes || spec.measurementPlan || '')
  if (objective || kpi || measurement) {
    add('Strategy', 'strategy-objective', {
      objective,
      kpi,
      measurement,
    })
  } else {
    add('Strategy', 'strategy-objective', {
      objective: '',
      kpi: '',
      measurement: '',
    })
  }

  const retailerList = Array.isArray(spec.retailers) ? spec.retailers.map((r) => cleanText(r)).filter(Boolean) : []
  const activationList = Array.isArray(spec.activationChannels)
    ? spec.activationChannels.map((r) => cleanText(r)).filter(Boolean)
    : []
  const channelNotes = cleanText(spec.channelNotes || '')
  if (retailerList.length || activationList.length || channelNotes) {
    add('Retailer', 'retail-footprint', {
      retailers: retailerList.join('\n'),
      activation_channels: activationList.join('\n'),
      channel_notes: channelNotes,
    })
  } else {
    add('Retailer', 'retail-footprint', {
      retailers: '',
      activation_channels: '',
      channel_notes: '',
    })
  }

  if (spec.tradeIncentive || spec.tradeIncentiveSpec) {
    add('Trade', 'trade-incentive', {
      retailers: spec.tradeIncentiveSpec?.audience || '',
      reward: spec.tradeIncentiveSpec?.reward || spec.tradeIncentive || '',
      guardrail: spec.tradeIncentiveSpec?.guardrail || '',
    })
  } else {
    add('Trade', 'trade-incentive', {
      retailers: '',
      reward: '',
      guardrail: '',
    })
  }

  if (spec.nonNegotiables && spec.nonNegotiables.length) {
    add('Compliance', 'compliance', {
      requirements: spec.nonNegotiables.join('\n'),
    })
  } else {
    add('Compliance', 'compliance', {
      requirements: '',
    })
  }

  return workspace
}

const toNumberOrNull = (value) => {
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const formatRunnerUpLine = (meta) => {
  const prize = cleanText(meta.prize)
  const qty = typeof meta.qty === 'number' && Number.isFinite(meta.qty) ? meta.qty : null
  const qtyText = qty != null ? `${qty} winner${qty === 1 ? '' : 's'}` : ''
  const detailBits = [cleanText(meta.value), cleanText(meta.retailers), qtyText].filter(Boolean)
  const detail = detailBits.length ? `(${detailBits.join(' • ')})` : ''
  return [prize, detail].filter(Boolean).join(' ').trim()
}

const hasMeaningfulValue = (obj) =>
  Object.values(obj || {}).some((val) => {
    if (typeof val === 'boolean') return val === true
    return val != null && val !== ''
  })

export function workspaceToOverrides(workspace = createEmptyWorkspace()) {
  const result = specFromWorkspace({}, workspace)
  if (result.heroPrizeEnabled === false) delete result.heroPrizeEnabled
  if (result.cashback && !cashbackHasRealFields(result.cashback)) {
    delete result.cashback
  }
  if (result.tradeIncentiveSpec && !hasMeaningfulValue(result.tradeIncentiveSpec)) {
    delete result.tradeIncentiveSpec
  }
  if (result.builderMetadata && !result.builderMetadata.runnerUps?.length) {
    delete result.builderMetadata
  }
  if (result.gwp && !hasMeaningfulValue(result.gwp)) {
    delete result.gwp
  }
  return result
}

export function specFromWorkspace(currentSpec = {}, workspace = createEmptyWorkspace()) {
  const next = JSON.parse(JSON.stringify(currentSpec || {}))

  const column = (lane) => workspace.find((col) => col.lane === lane) || { entries: [] }

  const hookEntry = column('Hook').entries.find((entry) => entry.cardId === 'hook-core')
  if (hookEntry) {
    next.hook = hookEntry.values.headline || ''
  } else {
    delete next.hook
  }

  const valueEntry = column('Value').entries.find((entry) => entry.cardId === 'value-cashback')
  if (valueEntry) {
    const cb = next.cashback || {}
    const amount = toNumberOrNull(valueEntry.values.amount)
    if (amount != null) cb.amount = amount
    else delete cb.amount
    const percent = toNumberOrNull(valueEntry.values.percent)
    if (percent != null) cb.percent = percent
    else delete cb.percent
    cb.assured = valueEntry.values.assured === true
    cb.odds = cleanText(valueEntry.values.odds)
    const proc = toNumberOrNull(valueEntry.values.processing)
    if (proc != null) cb.processingDays = proc
    else delete cb.processingDays
    const capRaw = cleanText(valueEntry.values.cap)
    if (capRaw) {
      if (capRaw.toUpperCase() === 'UNLIMITED') cb.cap = 'UNLIMITED'
      else {
        const capNum = toNumberOrNull(capRaw)
        cb.cap = capNum != null ? capNum : capRaw
      }
    } else {
      delete cb.cap
    }
    const expectedClaims = toNumberOrNull(valueEntry.values.expected_claims)
    if (expectedClaims != null) next.expectedBuyers = expectedClaims
    else delete next.expectedBuyers
    const assuredLines = asArray(valueEntry.values.assured_summary)
    if (assuredLines.length) {
      next.assuredItems = assuredLines
    } else if (cb.assured !== false && amount != null) {
      const currency = cleanText(cb.currency || next.cashback?.currency || '')
      const prefix = currency ? `${currency} ` : '$'
      next.assuredItems = [`${prefix}${amount} cashback per eligible purchase`]
    } else {
      delete next.assuredItems
    }
    next.assuredValue = cb.assured !== false
    next.cashback = cb
  } else {
    delete next.cashback
  }

  const heroEntry = column('Value').entries.find((entry) => entry.cardId === 'value-hero')
  if (heroEntry) {
    next.heroPrizeEnabled = true
    next.heroPrize = cleanText(heroEntry.values.hero_prize) || null
    const heroCount = toNumberOrNull(heroEntry.values.hero_count)
    next.heroPrizeCount = heroCount
    const overlay = cleanText(heroEntry.values.hero_overlay)
    next.majorPrizeOverlay = overlay || null
  } else {
    next.heroPrizeEnabled = false
    delete next.heroPrize
    delete next.heroPrizeCount
    delete next.majorPrizeOverlay
  }

  const runnerEntries = column('Value').entries.filter((entry) => entry.cardId === 'value-runner')
  const runnerMeta = runnerEntries
    .map((entry) => ({
      prize: cleanText(entry.values.prize),
      qty: toNumberOrNull(entry.values.qty),
      value: cleanText(entry.values.value),
      retailers: cleanText(entry.values.retailers),
    }))
    .filter((entry) => entry.prize || entry.qty != null || entry.value || entry.retailers)
  if (runnerMeta.length) {
    next.builderMetadata = { ...(next.builderMetadata || {}), runnerUps: runnerMeta }
    next.runnerUps = runnerMeta.map((meta) => formatRunnerUpLine(meta)).filter(Boolean)
  } else {
    if (next.builderMetadata?.runnerUps) {
      delete next.builderMetadata.runnerUps
      if (!Object.keys(next.builderMetadata).length) delete next.builderMetadata
    }
    delete next.runnerUps
  }

  const gwpEntry = column('Value').entries.find((entry) => entry.cardId === 'value-gwp')
  if (gwpEntry) {
    const capRaw = cleanText(gwpEntry.values.cap).toUpperCase()
    const capValue = capRaw === 'UNLIMITED' ? 'UNLIMITED' : toNumberOrNull(gwpEntry.values.cap)
    next.gwp = {
      item: cleanText(gwpEntry.values.item) || null,
      triggerQty: toNumberOrNull(gwpEntry.values.trigger_qty),
      cap: capValue,
      rrp: toNumberOrNull(gwpEntry.values.rrp),
      netCost: toNumberOrNull(gwpEntry.values.net_cost),
    }
  } else {
    delete next.gwp
  }

  const mechanicEntry = column('Mechanic').entries.find((entry) => entry.cardId === 'mechanic-passport')
  if (mechanicEntry) {
    if (mechanicEntry.values.description) next.mechanicOneLiner = mechanicEntry.values.description
    else delete next.mechanicOneLiner
    if (mechanicEntry.values.proof_type) next.proofType = mechanicEntry.values.proof_type
    else delete next.proofType
    if (mechanicEntry.values.staff_burden) next.staffBurden = mechanicEntry.values.staff_burden
    else delete next.staffBurden
    const qty = toNumberOrNull(mechanicEntry.values.trigger_qty)
    if (qty != null) {
      next.gwp = next.gwp || {}
      next.gwp.triggerQty = qty
    }
  } else {
    delete next.mechanicOneLiner
    delete next.proofType
    delete next.staffBurden
  }

  const cadenceEntry = column('Cadence').entries.find((entry) => entry.cardId === 'cadence-instant')
  if (cadenceEntry) {
    next.cadenceCopy = cleanText(cadenceEntry.values.cadence_copy)
  } else {
    delete next.cadenceCopy
  }

  const tradeEntry = column('Trade').entries.find((entry) => entry.cardId === 'trade-incentive')
  if (tradeEntry) {
    next.tradeIncentiveSpec = {
      audience: cleanText(tradeEntry.values.retailers),
      reward: cleanText(tradeEntry.values.reward),
      guardrail: cleanText(tradeEntry.values.guardrail),
    }
    next.tradeIncentive = cleanText(tradeEntry.values.reward)
  } else {
    delete next.tradeIncentiveSpec
    delete next.tradeIncentive
  }

  const complianceEntry = column('Compliance').entries.find((entry) => entry.cardId === 'compliance')
  if (complianceEntry) {
    const lines = String(complianceEntry.values.requirements || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
    next.nonNegotiables = lines
  } else {
    delete next.nonNegotiables
  }

  const retailerEntry = column('Retailer').entries.find((entry) => entry.cardId === 'retail-footprint')
  if (retailerEntry) {
    const retailers = asArray(retailerEntry.values.retailers)
    if (retailers.length) next.retailers = retailers
    else delete next.retailers
    const channels = asArray(retailerEntry.values.activation_channels)
    if (channels.length) next.activationChannels = channels
    else delete next.activationChannels
    const notes = cleanText(retailerEntry.values.channel_notes)
    next.channelNotes = notes || null
  } else {
    delete next.channelNotes
  }

  const strategyEntry = column('Strategy').entries.find((entry) => entry.cardId === 'strategy-objective')
  if (strategyEntry) {
    const objective = cleanText(strategyEntry.values.objective)
    const kpi = cleanText(strategyEntry.values.kpi)
    const measurement = cleanText(strategyEntry.values.measurement)
    next.primaryObjective = objective || null
    next.primaryKpi = kpi || null
    next.measurementNotes = measurement || null
  } else {
    delete next.measurementNotes
  }

  if (next.cashback && !hasMeaningfulValue(next.cashback)) {
    delete next.cashback
  }

  return next
}
