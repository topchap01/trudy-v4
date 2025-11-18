import { resolveModel } from './models.js'
import { chat } from './openai.js'

type ProofreadOptions = {
  scope: string
  campaignId?: string
  medium?: 'plain' | 'markdown' | 'html'
}

function shouldProofExports() {
  return String(process.env.TRUDY_PROOF_EXPORT || '').toLowerCase() === 'true'
}

function chooseModel() {
  return resolveModel(process.env.MODEL_PROOF, process.env.MODEL_DEFAULT, 'gpt-4o-mini')
}

async function runProofread(input: string, opts: ProofreadOptions) {
  if (!input.trim()) return input
  const model = chooseModel()
  const instructions = [
    'You are a meticulous proofreader.',
    'Correct typos, grammar, and clunky phrasing while preserving meaning and factual content.',
    'Never invent new facts, numbers, or sources.',
    'Keep the structure intact; do not delete sections.',
  ]
  if (opts.medium === 'html') {
    instructions.push('Return valid HTML. Do not remove tags; only edit the text nodes.')
  } else if (opts.medium === 'markdown') {
    instructions.push('Return Markdown only.')
  } else {
    instructions.push('Return plain text only.')
  }
  const prefix =
    opts.medium === 'html'
      ? 'HTML to proofread:'
      : opts.medium === 'markdown'
      ? 'Markdown to proofread:'
      : 'Text to proofread:'
  try {
    const output = await chat({
      model,
      system: instructions.join(' '),
      messages: [{ role: 'user', content: `${prefix}\n\n${input}` }],
      temperature: 0,
      meta: { scope: `proof.${opts.scope}`, campaignId: opts.campaignId },
    })
    const cleaned = output?.trim()
    return cleaned ? stripCodeFence(cleaned) : input
  } catch (err) {
    console.warn('[proofreader] failed', err)
    return input
  }
}

export async function proofreadProse(text: string, opts: ProofreadOptions) {
  if (!shouldProofExports()) return text
  return runProofread(text, { ...opts, medium: opts.medium || 'markdown' })
}

export async function proofreadHtml(html: string, opts: ProofreadOptions) {
  if (!shouldProofExports()) return html
  if (!html || html.length > 15000) return html
  return runProofread(html, { ...opts, medium: 'html' })
}

export function proofingEnabled() {
  return shouldProofExports()
}

function stripCodeFence(value: string): string {
  if (!value) return ''
  const fenceMatch = value.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]+?)\n```$/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
  return value
}
