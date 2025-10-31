// apps/backend/src/lib/status.ts
// Single source of truth for campaign + phase status strings.

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  READY_FOR_FRAMING: 'READY_FOR_FRAMING',
  READY_FOR_CORE: 'READY_FOR_CORE',
  READY_FOR_SYNTHESIS: 'READY_FOR_SYNTHESIS',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus]

