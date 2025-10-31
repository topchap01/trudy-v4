// apps/frontend/src/components/ExportPanel.jsx
import { useState } from 'react'
import Button from './Button'

const EXTRA_TYPES = [
  ['hooks', 'Hooks'],
  ['retailerDeck', 'Retailer Deck'],
  ['prizeLadder', 'Prize Ladder'],
  ['mechanics', 'Mechanics'],
  ['compliance', 'Compliance'],
  ['riskProfile', 'Risk Register'],
  ['custom', 'Custom'],
]

export default function ExportPanel({ artifacts = [], onExport }) {
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState('BOTH') // PDF | HTML | BOTH
  const [sections, setSections] = useState({
    brief: true,
    framing: true,
    evaluation: true,
    synthesis: true,      // NEW
    opinion: true,        // NEW
    strategist: true,
    ideas: true,
    extras: EXTRA_TYPES.map((x) => x[0]),
  })
  const [accent, setAccent] = useState('#0ea5e9')
  const [logoUrl, setLogoUrl] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [background, setBackground] = useState('#f6f7fb')
  const [titleOverride, setTitleOverride] = useState('')
  const [persona, setPersona] = useState('FULL')
  const [includeTooltips, setIncludeTooltips] = useState(true)

  function apiFileHref(a) {
    const rel = (a.path || '').split('storage/')[1]
    return rel ? `/api/files/${rel}` : ''
  }
  function toggleExtra(type) {
    setSections((s) => {
      const has = s.extras.includes(type)
      return { ...s, extras: has ? s.extras.filter((t) => t !== type) : [...s.extras, type] }
    })
  }

  async function generate() {
    if (!onExport) return
    setBusy(true)
    try {
      await onExport({
        format,
        sections,
        persona,
        includeTooltips,
        theme: {
          accent,
          background,
          logoUrl: logoUrl || undefined,
          heroImageUrl: heroImageUrl || undefined,
          titleOverride: titleOverride || undefined,
        },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border rounded p-3 space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full border rounded p-2">
            <option value="PDF">PDF</option>
            <option value="HTML">HTML</option>
            <option value="BOTH">Both</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Accent colour</label>
          <input type="text" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full border rounded p-2" placeholder="#0ea5e9" />
        </div>
        <div>
          <label className="block text-sm font-medium">Logo URL (optional)</label>
          <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="w-full border rounded p-2" placeholder="https://…" />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Background</label>
          <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} className="w-full border rounded p-2" placeholder="#f6f7fb" />
        </div>
        <div>
          <label className="block text-sm font-medium">Hero image URL</label>
          <input type="url" value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} className="w-full border rounded p-2" placeholder="https://…/hero.jpg" />
        </div>
        <div>
          <label className="block text-sm font-medium">Persona</label>
          <select value={persona} onChange={(e) => setPersona(e.target.value)} className="w-full border rounded p-2">
            <option value="FULL">Client deck</option>
            <option value="EXEC">Exec summary</option>
            <option value="TRADE">Trade deck</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Title override (optional)</label>
        <input type="text" value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} className="w-full border rounded p-2" placeholder="e.g., Q4 Activation Routes" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeTooltips} onChange={(e) => setIncludeTooltips(e.target.checked)} /> Show strategic tooltips in HTML preview
      </label>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="border rounded p-2">
          <div className="font-medium text-sm mb-2">Include sections</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.brief} onChange={(e) => setSections({ ...sections, brief: e.target.checked })} /> Brief snapshot
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.framing} onChange={(e) => setSections({ ...sections, framing: e.target.checked })} /> Framing
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.evaluation} onChange={(e) => setSections({ ...sections, evaluation: e.target.checked })} /> Evaluation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.synthesis} onChange={(e) => setSections({ ...sections, synthesis: e.target.checked })} /> Synthesis
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.ideas} onChange={(e) => setSections({ ...sections, ideas: e.target.checked })} /> Idea routes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.opinion} onChange={(e) => setSections({ ...sections, opinion: e.target.checked })} /> Opinion
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.strategist} onChange={(e) => setSections({ ...sections, strategist: e.target.checked })} /> Strategist scenarios
          </label>
        </div>
        <div className="border rounded p-2">
          <div className="font-medium text-sm mb-2">Include extra outputs</div>
          <div className="grid grid-cols-2 gap-2">
            {EXTRA_TYPES.map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sections.extras.includes(id)}
                  onChange={() => toggleExtra(id)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={generate} loading={busy}>Generate Export</Button>

      <div className="mt-3 space-y-2">
        {artifacts?.map((a) => {
          const href = apiFileHref(a)
          return (
            <div key={a.id} className="text-sm">
              <div className="font-medium">
                {new Date(a.createdAt).toLocaleString()} — {a.kind} — {a.bytes || 0} bytes
              </div>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
                  {href}
                </a>
              ) : (
                <div className="text-gray-500 break-all">{a.path}</div>
              )}
            </div>
          )
        })}
        {!artifacts?.length && <div className="text-sm text-gray-500">No exports yet.</div>}
      </div>
    </div>
  )
}
