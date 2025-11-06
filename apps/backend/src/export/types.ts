import type { CampaignContext } from '../lib/context.js'

export type ExportSections = {
  brief?: boolean
  framing?: boolean
  evaluation?: boolean
  evaluationScoreboard?: boolean
  ideas?: boolean
  synthesis?: boolean
  opinion?: boolean
  strategist?: boolean
  extras?: string[]
  cover?: boolean
  move?: boolean
  valueArchitecture?: boolean
  proof?: boolean
  activation?: boolean
  appendix?: boolean
}

export type ExportTheme = {
  accent?: string
  logoUrl?: string
  titleOverride?: string
  footerNote?: string
  background?: string
  fontFamily?: string
  heroImageUrl?: string
}

export type ExportOptions = {
  format?: 'PDF' | 'HTML' | 'DOCX' | 'BOTH' | 'ALL'
  sections?: ExportSections
  requirePass?: boolean
  useLLMJudge?: boolean
  theme?: ExportTheme
  persona?: 'FULL' | 'EXEC' | 'TRADE'
  includeTooltips?: boolean
  mode?: 'BRIEFED' | 'IMPROVE' | 'REBOOT' | null
}

export type NarrativeBlock = {
  content: string
  raw: string
  sanitized: string
  meta?: any
  params?: any
}

export type IdeasSummary = {
  parsed: any[]
  champion: { name: string; hooks: string[]; mechanic?: string } | null
  hooksTop: string[]
}

export type CampaignSummary = {
  id: string
  title: string
  clientName: string | null
  market: string | null
  category: string | null
  mode: string
  status: string
  createdAt: Date
  updatedAt: Date
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export type ExportSnapshot = {
  campaign: CampaignSummary
  context: CampaignContext
  brief: {
    snapshot: string
    rawText: string
  }
  narratives: {
    framing?: NarrativeBlock & { metaFull?: any }
    evaluation?: NarrativeBlock & { ui?: any; hookWhy?: string; propositionHint?: string; runAgainMoves?: string[]; symbolism?: any; trade?: any }
    synthesis?: NarrativeBlock
    ideas?: NarrativeBlock & IdeasSummary
    opinion?: NarrativeBlock
    strategist?: NarrativeBlock
  }
  ideation?: {
    unboxed: Array<{ agent: string; ideas: any[] }>
    harness: any
  }
  extras: Array<{ type: string; title: string; content: string }>
  offerIQ?: any
  research?: any
  benchmarks?: any
  framingMeta?: any
  judgeInputs: {
    framing: string
    evaluation: string
    opinion: string
    strategist: string
  }
}
