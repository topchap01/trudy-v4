import { getLaw } from './creative-constitution.js'

export type LawMode = 'evaluate' | 'create'

export function buildLawPrompt(mode: LawMode, ids: readonly string[], header?: string): string {
  const seen = new Set<string>()
  const lines = ids
    .map((id) => id.toUpperCase())
    .filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((id) => ({ id, record: getLaw(id) }))
    .filter((entry): entry is { id: string; record: NonNullable<ReturnType<typeof getLaw>> } => Boolean(entry.record))
    .map(({ id, record }) => `${id} — ${record.law.title}: ${record.law.description}`)

  const lead = header || `Creative Constitution (${mode.toUpperCase()} focus)`
  return [lead, lines.join('\n'), 'If you bend a law, label it and state the mitigation.']
    .filter(Boolean)
    .join('\n')
}
