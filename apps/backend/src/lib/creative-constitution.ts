import constitutionData from './creative-constitution.json' with { type: 'json' }

type Mode = 'evaluate' | 'create' | 'system'

export type CreativeLaw = {
  id: string
  title: string
  description: string
  appliesTo?: Mode[]
  directives?: string[]
}

export type CreativeLayer = {
  id: string
  name: string
  summary: string
  laws: CreativeLaw[]
}

export type CreativeConstitution = {
  version: string
  updated: string
  author: string
  modes: Record<string, { description: string }>
  annexes?: Record<string, unknown>
  layers: CreativeLayer[]
}

const constitution = constitutionData as CreativeConstitution

const LAW_INDEX = new Map<string, { layer: CreativeLayer; law: CreativeLaw }>()
for (const layer of constitution.layers) {
  for (const law of layer.laws) {
    LAW_INDEX.set(law.id.toUpperCase(), { layer, law })
  }
}

export function getCreativeConstitution(): CreativeConstitution {
  return constitution
}

export function getLaw(id: string) {
  return LAW_INDEX.get(id.toUpperCase()) || null
}

export function listLawsForMode(mode: Mode) {
  const out: CreativeLaw[] = []
  for (const { law } of LAW_INDEX.values()) {
    if (!law.appliesTo || law.appliesTo.includes(mode)) {
      out.push(law)
    }
  }
  return out
}

export function summarizeLawSet(ids: string[]): string {
  const items = ids
    .map((id) => getLaw(id))
    .filter((entry): entry is NonNullable<ReturnType<typeof getLaw>> => Boolean(entry))
    .map(({ law, layer }) => `${law.id} (${layer.name}): ${law.title}`)
  return items.join('; ')
}
