// apps/backend/src/lib/promo-builder.ts

export type BuilderField = {
  key: string
  label: string
  input: 'text' | 'textarea' | 'number' | 'currency' | 'select' | 'checkbox'
  placeholder?: string
  helper?: string
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
}

export type BuilderCard = {
  id: string
  category: 'Hook' | 'Value' | 'Mechanic' | 'Cadence' | 'Retailer' | 'Compliance' | 'Trade'
  label: string
  description: string
  fields: BuilderField[]
  tags?: string[]
}

const builderCards: BuilderCard[] = [
  {
    id: 'hook-core',
    category: 'Hook',
    label: 'Core hook',
    description: 'Short consumer-facing line that can live on pack and digital assets.',
    fields: [
      {
        key: 'headline',
        label: 'Hook copy',
        input: 'text',
        placeholder: 'e.g., Proof Uploaded. Cashback Approved.',
        helper: 'Keep it short, brand-locked, and concrete.',
      },
      {
        key: 'support',
        label: 'Support line',
        input: 'textarea',
        placeholder: 'Why should the shopper believe this hook? Optional.',
      },
    ],
    tags: ['creative', 'front-of-pack'],
  },
  {
    id: 'value-cashback',
    category: 'Value',
    label: 'Cashback value',
    description: 'Define the cashback posture and payout.',
    fields: [
      {
        key: 'assured',
        label: 'Guaranteed for every claimant',
        input: 'checkbox',
        helper: 'Untick if this is an odds-based cashback.',
      },
      {
        key: 'amount',
        label: 'Headline amount ($)',
        input: 'currency',
        placeholder: 'e.g., 100',
        helper: 'Use AUD by default.',
        min: 0,
      },
      {
        key: 'percent',
        label: 'Percent of spend (%)',
        input: 'number',
        placeholder: 'e.g., 15',
        helper: 'Leave blank for flat dollar payouts.',
        min: 0,
        max: 100,
      },
      {
        key: 'odds',
        label: 'Odds / cadence',
        input: 'text',
        placeholder: 'e.g., 1-in-3 wins $300; others $0',
      },
      {
        key: 'processing',
        label: 'Processing time (days)',
        input: 'number',
        placeholder: 'e.g., 7',
        min: 0,
      },
    ],
    tags: ['value', 'cashback'],
  },
  {
    id: 'value-hero',
    category: 'Value',
    label: 'Hero overlay',
    description: 'Define the hero prize posture and any retailer overlays.',
    fields: [
      {
        key: 'hero_prize',
        label: 'Hero prize headline',
        input: 'text',
        placeholder: 'e.g., Win a $5k Kitchen Reset',
        helper: 'Unique, memorable line that can live on POS.',
      },
      {
        key: 'hero_count',
        label: 'Number of hero winners',
        input: 'number',
        placeholder: 'e.g., 4',
        min: 1,
      },
      {
        key: 'hero_overlay',
        label: 'Overlay / theatre',
        input: 'textarea',
        placeholder: 'e.g., Retailer-specific chef residencies + finale dinner.',
        helper: 'Spell out retailer splits or experiential detail.',
      },
    ],
    tags: ['hero', 'overlay'],
  },
  {
    id: 'value-runner',
    category: 'Value',
    label: 'Runner-up ladder',
    description: 'Stack breadth prizes or instant wins to keep odds fair.',
    fields: [
      {
        key: 'prize',
        label: 'Prize line',
        input: 'text',
        placeholder: 'e.g., $300 cashback every week',
      },
      {
        key: 'qty',
        label: 'Winner count',
        input: 'number',
        placeholder: 'e.g., 12',
        min: 1,
      },
      {
        key: 'value',
        label: 'Value descriptor',
        input: 'text',
        placeholder: 'e.g., $300 each | 1-in-3 odds',
      },
      {
        key: 'retailers',
        label: 'Retailer split / notes',
        input: 'text',
        placeholder: "e.g., 1 per Dan Murphy's metro region",
      },
    ],
    tags: ['runner-up', 'breadth', 'instant win'],
  },
  {
    id: 'value-gwp',
    category: 'Value',
    label: 'Gift-with-purchase',
    description: 'Capture the GWP hook when cashback flips to a guaranteed item.',
    fields: [
      {
        key: 'item',
        label: 'Gift item',
        input: 'text',
        placeholder: 'e.g., Limited edition glassware',
      },
      {
        key: 'rrp',
        label: 'Headline value (RRP)',
        input: 'number',
        placeholder: 'e.g., 400',
        min: 0,
      },
      {
        key: 'net_cost',
        label: 'Net cost to brand',
        input: 'number',
        placeholder: 'e.g., 100',
        min: 0,
      },
      {
        key: 'trigger_qty',
        label: 'Trigger quantity',
        input: 'number',
        placeholder: 'e.g., 1 unit purchased',
        min: 1,
      },
      {
        key: 'cap',
        label: 'Cap',
        input: 'text',
        placeholder: 'e.g., UNLIMITED or 5000',
      },
    ],
    tags: ['assured', 'gwp'],
  },
  {
    id: 'mechanic-passport',
    category: 'Mechanic',
    label: 'Digital passport mechanic',
    description: 'Multi-purchase mechanic that banks entries or stamps.',
    fields: [
      {
        key: 'description',
        label: 'Mechanic line',
        input: 'text',
        placeholder: 'e.g., Collect stamps with every pint to unlock rewards.',
        helper: 'This becomes the mechanic one-liner / entry description.',
      },
      {
        key: 'trigger_qty',
        label: 'Entries / stamps required',
        input: 'number',
        placeholder: 'e.g., 12',
        min: 1,
      },
      {
        key: 'proof_type',
        label: 'Proof type',
        input: 'select',
        options: [
          { label: 'QR upload (receipt)', value: 'RECEIPT' },
          { label: 'POS integration (no upload)', value: 'POS' },
          { label: 'Serial / batch', value: 'SERIAL' },
        ],
        helper: 'Pick the lightest-weight proof that still keeps fraud in check.',
      },
      {
        key: 'staff_burden',
        label: 'Staff lift',
        input: 'select',
        options: [
          { label: 'Zero', value: 'ZERO' },
          { label: 'Low (tick-and-flick)', value: 'LOW' },
        ],
      },
    ],
    tags: ['mechanic', 'digital'],
  },
  {
    id: 'cadence-instant',
    category: 'Cadence',
    label: 'Instant win / cadence',
    description: 'Define the confirmation rhythm so it never feels one-and-done.',
    fields: [
      {
        key: 'cadence_copy',
        label: 'Cadence note',
        input: 'text',
        placeholder: 'e.g., Instant confirmation + weekly “You’re halfway there” email.',
      },
      {
        key: 'winner_vis',
        label: 'Winner visibility',
        input: 'text',
        placeholder: 'e.g., Live counter on microsite; weekly social tiles.',
      },
    ],
    tags: ['cadence', 'crm'],
  },
  {
    id: 'trade-incentive',
    category: 'Trade',
    label: 'Retailer incentive',
    description: 'Optional sell-in bonus or staff challenge to keep majors engaged.',
    fields: [
      {
        key: 'retailers',
        label: 'Retailer set',
        input: 'text',
        placeholder: 'e.g., Harvey Norman, The Good Guys',
      },
      {
        key: 'reward',
        label: 'Reward',
        input: 'textarea',
        placeholder: 'e.g., $50 POS credit per sell-in bundle; staff draw for top 10 stores.',
      },
      {
        key: 'guardrail',
        label: 'Guardrail',
        input: 'text',
        placeholder: 'e.g., Zero in-store adjudication; fulfilled centrally.',
      },
    ],
    tags: ['trade', 'retailer'],
  },
  {
    id: 'compliance',
    category: 'Compliance',
    label: 'Compliance touches',
    description: 'Document age gates, RSA/ABAC or state permits.',
    fields: [
      {
        key: 'requirements',
        label: 'Required actions',
        input: 'textarea',
        placeholder: 'e.g., RSA copy lock-up, NSW permit, proof of age gating on microsite.',
      },
    ],
    tags: ['compliance'],
  },
]

export function listBuilderCards(): BuilderCard[] {
  return builderCards
}
