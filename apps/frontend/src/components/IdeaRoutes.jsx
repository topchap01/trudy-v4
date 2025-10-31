import React, { useMemo, useState } from 'react'

/**
 * Cardised renderer for Create outputs with:
 * - Route parsing (`### <Name> — <promise>`)
 * - Progressive disclosure
 * - Copy button
 * - Deep-links to Ask Outputs (route-specific hooks/retailer deck/mechanics)
 *
 * Props:
 *   - text: string (raw Create markdown)
 *   - campaignId: string
 *   - onSaved?: () => void (refresh Saved Outputs panel)
 */
export default function IdeaRoutes({ text = '', campaignId, onSaved }) {
  const routes = useMemo(() => splitRoutes(text), [text])
  if (!routes.length) return <div className="text-sm text-gray-600">No routes yet.</div>

  return (
    <div className="space-y-4">
      {routes.map((r, idx) => (
        <RouteCard
          key={idx}
          campaignId={campaignId}
          route={r}
          onSaved={onSaved}
        />
      ))}
    </div>
  )
}

function RouteCard({ route, campaignId, onSaved }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)

  async function askOutputs(payload) {
    setBusy(payload.type)
    try {
      const res = await fetch('/api/ask/outputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved && onSaved()
    } catch (e) {
      console.error('Ask Outputs failed', e)
      alert('Ask Outputs failed. See console for details.')
    } finally {
      setBusy(null)
    }
  }

  // Deep-links: use type=custom so we can target the specific route
  const askMoreHooks = () =>
    askOutputs({
      campaignId,
      type: 'custom',
      prompt:
        `Generate 12 premium, brand-locked hooks for this specific Create route.\n` +
        `Return each as: "Hook" — Why it works.\n\n` +
        `ROUTE NAME: ${route.title}\n` +
        (route.promise ? `ROUTE PROMISE: ${route.promise}\n` : '') +
        (route.hook ? `CURRENT HOOK: ${route.hook}\n` : '') +
        (route.altHook ? `ALT HOOK: ${route.altHook}\n` : '') +
        `Mechanic summary: ${route.mechanic || 'n/a'}`,
      params: { count: 12 },
    })

  const askRetailerDeck = () =>
    askOutputs({
      campaignId,
      type: 'retailerDeck',
      params: {},
      // piggy-back with context in prompt to steer it
      prompt:
        `Focus this retailer deck on the following Create route only:\n` +
        `Name: ${route.title}\n` +
        (route.promise ? `Promise: ${route.promise}\n` : '') +
        (route.hook ? `Hook: ${route.hook}\n` : '') +
        `Mechanic: ${route.mechanic || 'n/a'}`,
    })

  const askMechanics = () =>
    askOutputs({
      campaignId,
      type: 'mechanics',
      params: {},
      prompt:
        `Propose 4 mechanic variants for this route only:\n` +
        `Name: ${route.title}\n` +
        (route.hook ? `Hook: ${route.hook}\n` : '') +
        `Current mechanic: ${route.mechanic || 'n/a'}`,
    })

  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">
            {route.title}
            {route.promise ? <span className="text-gray-500 font-normal"> — {route.promise}</span> : null}
          </div>
          {route.hook ? <div className="mt-1 text-sm"><span className="font-medium">Hook:</span> {route.hook}</div> : null}
          {route.altHook ? <div className="text-sm"><span className="font-medium">Alt hook:</span> {route.altHook}</div> : null}
        </div>
        <div className="flex gap-2">
          <button
            className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
            onClick={() => navigator.clipboard.writeText(route.raw)}
            title="Copy route"
          >
            Copy
          </button>
          <button
            className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className={`mt-3 text-sm whitespace-pre-wrap ${open ? '' : 'line-clamp-6'}`}>
        {route.body}
      </div>

      {/* Mechanic chip row */}
      {(route.mechanic || route.frequency || route.retailer || route.compliance) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {route.mechanic ? <Chip label="Staff script" value={route.mechanic} /> : null}
          {route.frequency ? <Chip label="Frequency" value={route.frequency} /> : null}
          {route.retailer ? <Chip label="Retailer" value={route.retailer} /> : null}
          {route.compliance ? <Chip label="Compliance" value={route.compliance} /> : null}
        </div>
      )}

      {/* Actions: Ask Outputs deep-links */}
      {campaignId && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
            onClick={askMoreHooks}
            disabled={busy === 'hooks' || busy === 'custom'}
          >
            {busy === 'custom' ? 'Working…' : 'More hooks for this route'}
          </button>
          <button
            className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
            onClick={askRetailerDeck}
            disabled={busy === 'retailerDeck'}
          >
            {busy === 'retailerDeck' ? 'Working…' : 'Retailer deck (focused)'}
          </button>
          <button
            className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
            onClick={askMechanics}
            disabled={busy === 'mechanics'}
          >
            {busy === 'mechanics' ? 'Working…' : 'Mechanic variants'}
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({ label, value }) {
  return (
    <div className="text-xs px-2 py-1 rounded-full border bg-white">
      <span className="text-gray-500">{label}:</span> <span className="font-medium">{value}</span>
    </div>
  )
}

function splitRoutes(src = '') {
  // Split by headings that start a route: ### <Title> — <promise>
  const parts = src.split(/\n(?=###\s+)/).filter(Boolean)
  return parts.map((block) => parseRoute(block.trim()))
}

function parseRoute(block) {
  const lines = block.split('\n')
  const head = lines.shift() || ''
  const bodyText = lines.join('\n').trim()

  // Header like: "### NAME — promise"
  const headClean = head.replace(/^###\s*/, '')
  const [title, ...rest] = headClean.split('—')
  const promise = rest.join('—').trim()

  // Pull key fields with tolerant regexes
  const hook = matchLine(bodyText, /^Hook\s*(?:\(.*\))?:\s*(.+)$/im)
  const altHook = matchLine(bodyText, /^Alt hook\s*:\s*(.+)$/im)
  const mechanic =
    matchLine(bodyText, /^(?:Core mechanic|Mechanic)(?:\s*\(.*\))?:\s*(.+)$/im) ||
    matchLine(bodyText, /^Core mechanic \(staff script\):\s*(.+)$/im)
  const frequency = matchLine(bodyText, /^Frequency loop:\s*(.+)$/im)
  const retailer = matchLine(bodyText, /^Retailer story:\s*(.+)$/im)
  const compliance = matchLine(bodyText, /^Compliance:\s*(.+)$/im)

  return {
    title: (title || '').trim(),
    promise,
    hook,
    altHook,
    mechanic,
    frequency,
    retailer,
    compliance,
    body: normalizeHeadings(bodyText),
    raw: block,
  }
}

function matchLine(text, rx) {
  const m = rx.exec(text)
  return m ? m[1].trim() : ''
}

// Normalise markdown headings inside each route body so it doesn’t look like “too many ###”
function normalizeHeadings(s) {
  // Downshift ###/#### into a simple bold label feel
  return s
    .replace(/^####\s+/gm, '') // drop 4-level headings
    .replace(/^###\s+/gm, '')  // drop 3-level headings inside cards
}

