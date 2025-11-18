import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import { DraggableColumn, DraggableItem } from '../ui/useDrag.jsx'
import { getPromoBuilderCards, runPromoBuilderEvaluate } from '../lib/campaigns.js'
import { BUILDER_LANES, createEmptyWorkspace } from '../utils/promoBuilderMapping.js'

function CardLibrary({ cards, onAdd, loading }) {
  if (loading) {
    return <div className="text-sm text-gray-600">Loading card library…</div>
  }
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div key={card.id} className="border rounded p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{card.label}</div>
              <div className="text-xs uppercase text-gray-400">{card.category}</div>
            </div>
            <Button variant="outline" onClick={() => onAdd(card, card.category)}>Add</Button>
          </div>
          <p className="text-sm text-gray-600 mt-2">{card.description}</p>
          {card.tags?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-[11px] rounded bg-sky-50 text-sky-700 border border-sky-100">{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function WorkspaceCard({ card, values, onChange, onRemove }) {
  return (
    <div className="border rounded p-3 bg-white space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{card.label}</div>
          <div className="text-xs uppercase text-gray-400">{card.category}</div>
        </div>
        <Button variant="outline" onClick={onRemove}>Remove</Button>
      </div>
      {card.fields.map((field) => {
        const value = values[field.key] ?? (field.input === 'checkbox' ? false : '')
        const commonProps = {
          className: 'w-full border rounded px-3 py-2 text-sm',
          value,
          onChange: (event) => {
            const nextValue = field.input === 'checkbox' ? event.target.checked : event.target.value
            onChange(field.key, nextValue)
          },
        }
        return (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
            {field.input === 'textarea' ? (
              <textarea {...commonProps} rows={3} placeholder={field.placeholder || ''} />
            ) : field.input === 'select' ? (
              <select {...commonProps}>
                <option value="">Select…</option>
                {(field.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.input === 'checkbox' ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => onChange(field.key, event.target.checked)}
                  className="rounded border-gray-300"
                />
                <span>{field.helper || 'Enable'}</span>
              </label>
            ) : (
              <input
                {...commonProps}
                type={field.input === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder || ''}
              />
            )}
            {field.helper ? <div className="text-xs text-gray-500 mt-1">{field.helper}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

function PrizeWizard({ onApply, disabled }) {
  if (!PRIZE_TEMPLATES.length) return null
  return (
    <div className="border rounded p-3 bg-slate-50">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Prize wizard</div>
          <p className="text-xs text-slate-500">Drop in a tested ladder and edit from there.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {PRIZE_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="text-left border rounded p-3 bg-white hover:border-sky-300 hover:shadow"
            onClick={() => onApply?.(tpl)}
            disabled={disabled}
          >
            <div className="text-sm font-semibold">{tpl.label}</div>
            <p className="text-xs text-gray-600 mt-1">{tpl.caption}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function ConfettiLayer({ bursts }) {
  if (!bursts.length) return null
  return (
    <div className="builder-confetti-layer">
      {bursts.flatMap((burst) =>
        burst.pieces.map((piece) => (
          <span
            key={piece.id}
            className="builder-confetti-piece"
            style={{
              left: `${piece.left}%`,
              top: `${piece.top}%`,
              '--drift': `${piece.drift}px`,
              '--distance': `${piece.distance}px`,
              animationDuration: `${piece.duration}ms`,
              animationDelay: `${piece.delay}ms`,
              backgroundColor: piece.color,
            }}
          />
        ))
      )}
    </div>
  )
}

function ensureWorkspace(value) {
  if (!value || !Array.isArray(value)) return createEmptyWorkspace()
  return BUILDER_LANES.map((lane) => {
    const column = value.find((col) => col.lane === lane)
    if (!column) return { lane, entries: [] }
    return {
      lane,
      entries: Array.isArray(column.entries) ? column.entries.map((entry) => ({ ...entry })) : [],
    }
  })
}

const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `builder-${Date.now()}-${Math.random().toString(16).slice(2)}`)

const TEMPLATE_DEFAULT_REPLACE = ['value-cashback', 'value-hero', 'value-runner', 'value-gwp']

const PRIZE_TEMPLATES = [
  {
    id: 'cashback-300',
    label: '$300 cashback (1-in-3)',
    caption: 'Odds-led cashback with a weekly brag moment.',
    replace: TEMPLATE_DEFAULT_REPLACE,
    cards: [
      {
        lane: 'Value',
        cardId: 'value-cashback',
        values: {
          assured: false,
          amount: '300',
          percent: '',
          odds: '1-in-3 claims win $300; others $0',
          processing: '7',
        },
      },
      {
        lane: 'Value',
        cardId: 'value-runner',
        values: {
          prize: '$100 pub tab',
          qty: '30',
          value: 'Daily instant win',
          retailers: 'Shared across majors',
        },
      },
      {
        lane: 'Value',
        cardId: 'value-hero',
        values: {
          hero_prize: 'Guinness Golden Ticket ($5k experience)',
          hero_count: '3',
          hero_overlay: 'Finale hero at each major banner; livestream moment for independents.',
        },
      },
    ],
  },
  {
    id: 'retailer-hero',
    label: 'Retailer-specific heroes',
    caption: 'Split overlay per retailer plus indie pool.',
    replace: TEMPLATE_DEFAULT_REPLACE,
    cards: [
      {
        lane: 'Value',
        cardId: 'value-hero',
        values: {
          hero_prize: 'Chef residency per major retailer',
          hero_count: '4',
          hero_overlay: 'Harvey Norman, JB Hi-Fi, The Good Guys each receive a bespoke overlay; one pooled hero for independents.',
        },
      },
      {
        lane: 'Value',
        cardId: 'value-runner',
        values: {
          prize: '$250 retailer credit',
          qty: '40',
          value: '1 per flagship store',
          retailers: 'Auto-allocated to participating outlets',
        },
      },
    ],
  },
  {
    id: 'gwp-upgrade',
    label: '$400 GWP (costs $100)',
    caption: 'Switch to a hero-worthy assured gift + overlay.',
    replace: TEMPLATE_DEFAULT_REPLACE,
    cards: [
      {
        lane: 'Value',
        cardId: 'value-gwp',
        values: {
          item: 'Bar-quality glassware kit',
          rrp: '400',
          net_cost: '100',
          trigger_qty: '1',
          cap: 'UNLIMITED',
        },
      },
      {
        lane: 'Value',
        cardId: 'value-hero',
        values: {
          hero_prize: 'Ultimate Home Bar Upgrade',
          hero_count: '2',
          hero_overlay: 'Hero overlay locked to retailer partners; concierge install filmed for social proof.',
        },
      },
      {
        lane: 'Value',
        cardId: 'value-runner',
        values: {
          prize: 'Daily pint-on-us',
          qty: '60',
          value: 'Push notification + retail shout-out',
          retailers: 'Focus on pubs/clubs to spur visitation',
        },
      },
    ],
  },
]

export default function PromoBuilderCanvas({
  workspace: controlledWorkspace,
  onWorkspaceChange,
  showSerialized = true,
  showEvaluateButton = true,
  onEvaluate,
  embedded = false,
}) {
  const [cards, setCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [evaluation, setEvaluation] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [confettiBursts, setConfettiBursts] = useState([])

  const [internalWorkspace, setInternalWorkspace] = useState(ensureWorkspace(controlledWorkspace))
  useEffect(() => {
    if (controlledWorkspace) {
      setInternalWorkspace(ensureWorkspace(controlledWorkspace))
    }
  }, [controlledWorkspace])
  const workspace = controlledWorkspace ? ensureWorkspace(controlledWorkspace) : internalWorkspace

  const triggerConfetti = useCallback((intensity = 14) => {
    const colors = ['#0f172a', '#0ea5e9', '#0891b2', '#22c55e', '#f97316', '#eab308']
    const id = randomId()
    const pieces = Array.from({ length: intensity }).map(() => ({
      id: `${id}-${Math.random().toString(36).slice(2)}`,
      left: 10 + Math.random() * 80,
      top: 10 + Math.random() * 20,
      drift: (Math.random() - 0.5) * 80,
      distance: 80 + Math.random() * 80,
      delay: Math.random() * 150,
      duration: 700 + Math.random() * 600,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
    setConfettiBursts((prev) => [...prev, { id, pieces }])
    setTimeout(() => {
      setConfettiBursts((prev) => prev.filter((burst) => burst.id !== id))
    }, 1600)
  }, [])

  useEffect(() => {
    let active = true
    getPromoBuilderCards()
      .then((list) => {
        if (active) {
          setCards(list)
          setLoadingCards(false)
        }
      })
      .catch((err) => {
        console.error('Failed to load builder cards', err)
        if (active) {
          setCards([])
          setLoadingCards(false)
        }
      })
    return () => { active = false }
  }, [])

  const updateWorkspace = (updater) => {
    setInternalWorkspace((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!controlledWorkspace) {
        onWorkspaceChange?.(next)
        return next
      }
      onWorkspaceChange?.(next)
      return next
    })
  }

  const applyPrizeTemplate = (template) => {
    if (!template || !Array.isArray(template.cards) || !template.cards.length) return
    const replaceIds = Array.isArray(template.replace) && template.replace.length ? template.replace : TEMPLATE_DEFAULT_REPLACE
    updateWorkspace((prev) =>
      prev.map((column) => {
        if (column.lane !== 'Value') return column
        const kept = column.entries.filter((entry) => !replaceIds.includes(entry.cardId))
        const appended = template.cards
          .filter((card) => !card.lane || card.lane === column.lane || card.lane === 'Value')
          .map((card) => ({
            id: randomId(),
            cardId: card.cardId,
            values: { ...(card.values || {}) },
          }))
        return { ...column, entries: [...kept, ...appended] }
      })
    )
    triggerConfetti(24)
  }

  const handleAddCard = (card, laneOverride) => {
    const lane = laneOverride || card.category
    updateWorkspace((prev) =>
      prev.map((column) =>
        column.lane === lane
          ? {
              ...column,
              entries: [...column.entries, { id: randomId(), cardId: card.id, values: {} }],
            }
          : column
      )
    )
    if (lane === 'Value') triggerConfetti(12)
  }

  const handleUpdateCard = (lane, entryId, key, value) => {
    updateWorkspace((prev) =>
      prev.map((column) => {
        if (column.lane !== lane) return column
        return {
          ...column,
          entries: column.entries.map((entry) =>
            entry.id === entryId
              ? { ...entry, values: { ...entry.values, [key]: value } }
              : entry
          ),
        }
      })
    )
  }

  const handleRemoveCard = (lane, entryId) => {
    updateWorkspace((prev) =>
      prev.map((column) =>
        column.lane === lane
          ? { ...column, entries: column.entries.filter((entry) => entry.id !== entryId) }
          : column
      )
    )
  }

  const handleReorder = (lane, orderedEntries) => {
    updateWorkspace((prev) =>
      prev.map((column) => (column.lane === lane ? { ...column, entries: orderedEntries } : column))
    )
  }

  const serializedOutput = useMemo(() => {
    const detail = workspace.flatMap((column) =>
      column.entries.map((entry) => ({ lane: column.lane, cardId: entry.cardId, values: entry.values }))
    )
    return JSON.stringify({ blocks: detail }, null, 2)
  }, [workspace])

  const cardLookup = useMemo(() => {
    const map = new Map()
    cards.forEach((card) => map.set(card.id, card))
    return map
  }, [cards])

  const runEvaluation = async () => {
    if (onEvaluate) {
      onEvaluate()
      return
    }
    setEvaluating(true)
    try {
      const payload = { blocks: workspace }
      const res = await runPromoBuilderEvaluate(payload)
      setEvaluation(JSON.stringify(res, null, 2))
    } catch (err) {
      setEvaluation(`⚠️ Promo builder evaluation is not ready: ${err?.message || err}`)
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="relative">
      <ConfettiLayer bursts={confettiBursts} />
      <div className={embedded ? 'space-y-4' : 'grid gap-6 lg:grid-cols-[1fr,1.25fr]'}>
        <div className={embedded ? 'space-y-3' : ''}>
          {!embedded && <h2 className="text-lg font-semibold mb-3">Card library</h2>}
          <CardLibrary cards={cards} onAdd={handleAddCard} loading={loadingCards} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Workspace lanes</h2>
            <Button variant="outline" onClick={() => updateWorkspace(createEmptyWorkspace())}>Clear all</Button>
          </div>
          <PrizeWizard onApply={applyPrizeTemplate} disabled={loadingCards} />
          <div className="grid gap-4 md:grid-cols-2">
            {workspace.map((column) => (
              <div key={column.lane} className="border rounded bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{column.lane}</div>
                    <div className="text-xs text-gray-500">{column.entries.length} card(s)</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {cards
                      .filter((card) => card.category === column.lane)
                      .slice(0, 1)
                      .map((card) => (
                        <Button key={card.id} variant="outline" onClick={() => handleAddCard(card, column.lane)}>
                          + {card.label.split(' ')[0]}
                        </Button>
                      ))}
                  </div>
                </div>
                {column.entries.length === 0 ? (
                  <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded p-3 bg-white">
                    No cards. Add a {column.lane.toLowerCase()} card to get started.
                  </div>
                ) : (
                  <DraggableColumn
                    items={column.entries}
                    lane={column.lane}
                    onReorder={(ordered) => handleReorder(column.lane, ordered)}
                    onDrop={({ lane }) => {
                      if (lane === 'Value') triggerConfetti(8)
                    }}
                  >
                    <div className="space-y-2">
                      {column.entries.map((entry) => {
                        const card = cardLookup.get(entry.cardId)
                        if (!card) return null
                        return (
                          <DraggableItem key={entry.id} id={entry.id}>
                            <WorkspaceCard
                              card={card}
                              values={entry.values}
                              onChange={(key, value) => handleUpdateCard(column.lane, entry.id, key, value)}
                              onRemove={() => handleRemoveCard(column.lane, entry.id)}
                            />
                          </DraggableItem>
                        )
                      })}
                    </div>
                  </DraggableColumn>
                )}
              </div>
            ))}
          </div>
          {showSerialized && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Serialized output</h3>
              <pre className="bg-slate-900 text-slate-100 text-xs rounded p-3 overflow-auto h-48">{serializedOutput}</pre>
              {showEvaluateButton && (
                <Button onClick={runEvaluation} loading={evaluating} disabled={!workspace.length}>
                  Run quick evaluation (stub)
                </Button>
              )}
              {evaluation && !onEvaluate ? (
                <pre className="bg-slate-900 text-slate-100 text-xs rounded p-3 overflow-auto h-40">{evaluation}</pre>
              ) : null}
            </div>
          )}
          {showEvaluateButton && !showSerialized && (
            <Button onClick={runEvaluation} loading={evaluating} disabled={!workspace.length}>
              Run quick evaluation
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
