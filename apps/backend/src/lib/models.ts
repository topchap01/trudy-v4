// apps/backend/src/lib/models.ts
// Centralised model resolution helpers so every orchestrator shares defaults.

const FALLBACK_MODEL =
  (process.env.MODEL_DEFAULT && process.env.MODEL_DEFAULT.trim()) ||
  (process.env.TRUDY_MODEL_DEFAULT && process.env.TRUDY_MODEL_DEFAULT.trim()) ||
  'gpt-4o-mini'

export function resolveModel(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length) {
      return candidate.trim()
    }
  }
  return FALLBACK_MODEL
}

export function defaultModel(): string {
  return FALLBACK_MODEL
}
