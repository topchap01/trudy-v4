// apps/frontend/src/components/FramingEditor.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'

export default function FramingEditor({ brief, campaignId, onSave }) {
  const initialParsed = useMemo(() => {
    const pj = (brief && brief.parsedJson && typeof brief.parsedJson === 'object') ? brief.parsedJson : {}
    return { ...pj }
  }, [brief])

  const [rawText, setRawText] = useState(brief?.rawText || '')
  const [parsed, setParsed] = useState(initialParsed)

  // standard fields we expose inline (kept minimal to avoid UI drift)
  const [hook, setHook] = useState(parsed.hook || '')
  const [mechanicOneLiner, setMechanicOneLiner] = useState(parsed.mechanicOneLiner || '')
  const [objective, setObjective] = useState(parsed.objective || '')
  const [primaryKpi, setPrimaryKpi] = useState(parsed.primaryKpi || '')
  const [secondaryKpis, setSecondaryKpis] = useState(toCSV(parsed.secondaryKpis))
  const [retailers, setRetailers] = useState(toCSV(parsed.retailers))
  const [calendarTheme, setCalendarTheme] = useState(parsed.calendarTheme || '')
  const [brandPosition, setBrandPosition] = useState(parsed.brandPosition || '')
  const [startDate, setStartDate] = useState(parsed.startDate || '')
  const [endDate, setEndDate] = useState(parsed.endDate || '')

  // ------ NEW: portfolio fields ------
  const [isPortfolio, setIsPortfolio] = useState(Boolean(parsed.isPortfolio))
  const [bannerName, setBannerName] = useState(parsed.bannerName || '')
  const [brandsCsv, setBrandsCsv] = useState(brandsToCSV(parsed.brands))
  const [brandNotes, setBrandNotes] = useState(parsed.brandNotes || '')

  useEffect(() => {
    // keep state in sync if brief changes from above
    setRawText(brief?.rawText || '')
    const pj = (brief && brief.parsedJson && typeof brief.parsedJson === 'object') ? brief.parsedJson : {}
    setParsed({ ...pj })

    setHook(pj.hook || '')
    setMechanicOneLiner(pj.mechanicOneLiner || '')
    setObjective(pj.objective || '')
    setPrimaryKpi(pj.primaryKpi || '')
    setSecondaryKpis(toCSV(pj.secondaryKpis))
    setRetailers(toCSV(pj.retailers))
    setCalendarTheme(pj.calendarTheme || '')
    setBrandPosition(pj.brandPosition || '')
    setStartDate(pj.startDate || '')
    setEndDate(pj.endDate || '')

    setIsPortfolio(Boolean(pj.isPortfolio))
    setBannerName(pj.bannerName || '')
    setBrandsCsv(brandsToCSV(pj.brands))
    setBrandNotes(pj.brandNotes || '')
  }, [brief])

  function handleSave() {
    // merge known fields back into parsed, preserving unknown keys
    const next = { ...parsed }

    next.hook = cleanStr(hook)
    next.mechanicOneLiner = cleanStr(mechanicOneLiner)
    next.objective = cleanStr(objective)
    next.primaryKpi = cleanStr(primaryKpi)
    next.secondaryKpis = fromCSV(secondaryKpis)
    next.retailers = fromCSV(retailers)
    next.calendarTheme = cleanStr(calendarTheme)
    next.brandPosition = cleanStr(brandPosition)
    next.startDate = cleanStr(startDate)
    next.endDate = cleanStr(endDate)

    next.isPortfolio = Boolean(isPortfolio)
    next.bannerName = cleanStr(bannerName)
    next.brands = csvToBrands(brandsCsv)
    next.brandNotes = cleanStr(brandNotes)

    onSave && onSave(rawText, next)
  }

  return (
    <div className="border rounded p-3 space-y-4">
      {/* Portfolio / Banner */}
      <section>
        <h3 className="font-semibold mb-2">Portfolio / Banner</h3>
        <div className="flex items-center gap-3 mb-2">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-sky-600"
              checked={isPortfolio}
              onChange={(e) => setIsPortfolio(e.target.checked)}
            />
            <span>This is a portfolio campaign (banner across multiple brands)</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Banner name</label>
            <input
              type="text"
              value={bannerName}
              onChange={(e) => setBannerName(e.target.value)}
              className="w-full border rounded px-2 py-1"
              placeholder="e.g., Summer Sips"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Participating brands (comma-separated)</label>
            <input
              type="text"
              value={brandsCsv}
              onChange={(e) => setBrandsCsv(e.target.value)}
              className="w-full border rounded px-2 py-1"
              placeholder="Guinness:LEAD, Smirnoff, Bundaberg Rum:SUPPORT"
            />
            <div className="text-xs text-gray-500 mt-1">Tip: Use <code>Brand</code> or <code>Brand:ROLE</code> (e.g., LEAD / SUPPORT).</div>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">Brand notes</label>
          <textarea
            value={brandNotes}
            onChange={(e) => setBrandNotes(e.target.value)}
            className="w-full border rounded px-2 py-1"
            rows={2}
            placeholder="Rotation logic, ownership, shared POS, etc."
          />
        </div>
      </section>

      {/* Core brief fields (kept compact) */}
      <section>
        <h3 className="font-semibold mb-2">Core Brief</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Hook</label>
            <input className="w-full border rounded px-2 py-1" value={hook} onChange={(e)=>setHook(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Mechanic (one-liner)</label>
            <input className="w-full border rounded px-2 py-1" value={mechanicOneLiner} onChange={(e)=>setMechanicOneLiner(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Objective</label>
            <input className="w-full border rounded px-2 py-1" value={objective} onChange={(e)=>setObjective(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Primary KPI</label>
            <input className="w-full border rounded px-2 py-1" value={primaryKpi} onChange={(e)=>setPrimaryKpi(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Secondary KPIs (comma-separated)</label>
            <input className="w-full border rounded px-2 py-1" value={secondaryKpis} onChange={(e)=>setSecondaryKpis(e.target.value)} placeholder="ROS, penetration, basket size" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Retailers (comma-separated)</label>
            <input className="w-full border rounded px-2 py-1" value={retailers} onChange={(e)=>setRetailers(e.target.value)} placeholder="Coles, Woolworths, BWS" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Calendar theme</label>
            <input className="w-full border rounded px-2 py-1" value={calendarTheme} onChange={(e)=>setCalendarTheme(e.target.value)} placeholder="St Patrick’s, EOFY Winter" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Brand position</label>
            <input className="w-full border rounded px-2 py-1" value={brandPosition} onChange={(e)=>setBrandPosition(e.target.value)} placeholder="LEADER / FOLLOWER / DISRUPTOR" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Start date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">End date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={endDate} onChange={(e)=>setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* Raw notes (unchanged behaviour) */}
      <section>
        <h3 className="font-semibold mb-2">Notes (free text)</h3>
        <textarea
          className="w-full border rounded px-2 py-2"
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste any raw notes here…"
        />
      </section>

      <div className="flex gap-2">
        <Button onClick={handleSave}>Save Brief</Button>
      </div>
    </div>
  )
}

// ---------- helpers ----------
function toCSV(v) {
  if (!v) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string') return v
  return String(v)
}
function fromCSV(s) {
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
function cleanStr(s) {
  const v = String(s || '').trim()
  return v || undefined
}
function brandsToCSV(brands) {
  if (!brands || !Array.isArray(brands)) return ''
  return brands
    .map((b) => {
      if (!b) return ''
      if (typeof b === 'string') return b
      const name = String(b.name || '').trim()
      const role = b.role ? String(b.role).trim() : ''
      return role ? `${name}:${role}` : name
    })
    .filter(Boolean)
    .join(', ')
}
function csvToBrands(csv) {
  const arr = fromCSV(csv)
  return arr.map((item) => {
    const parts = String(item).split(':').map((s) => s.trim())
    const name = parts[0]
    const role = parts[1] || undefined
    return name ? { name, role } : null
  }).filter(Boolean)
}
