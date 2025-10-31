// apps/backend/src/orchestrator/prismaEnums.ts
// Mirrors the enum sets in schema.prisma EXACTLY (no renames, no additions).

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type CampaignStatus = typeof CampaignStatus[keyof typeof CampaignStatus];

export const Mode = {
  EVALUATION: 'EVALUATION',
  CREATE: 'CREATE',
} as const;
export type Mode = typeof Mode[keyof typeof Mode];

export const Phase = {
  FRAMING: 'FRAMING',
  CREATE: 'CREATE',
  EVALUATE: 'EVALUATE',
  SYNTHESIS: 'SYNTHESIS',
} as const;
export type Phase = typeof Phase[keyof typeof Phase];

export const Status = {
  DRAFT: 'DRAFT',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type Status = typeof Status[keyof typeof Status];

export const Agent = {
  CLARA: 'CLARA',
  MILES: 'MILES',
  JAX: 'JAX',
  NINA: 'NINA',
  IVY: 'IVY',
  THEO: 'THEO',
  QUENTIN: 'QUENTIN',
  OMAR: 'OMAR',
  BRUCE: 'BRUCE',
} as const;
export type Agent = typeof Agent[keyof typeof Agent];

export const MessageRole = {
  SYSTEM: 'SYSTEM',
  ANALYSIS: 'ANALYSIS',
  SUGGESTION: 'SUGGESTION',
} as const;
export type MessageRole = typeof MessageRole[keyof typeof MessageRole];

export const RiskLevel = {
  SAFE: 'SAFE',
  BALANCED: 'BALANCED',
  BOLD: 'BOLD',
} as const;
export type RiskLevel = typeof RiskLevel[keyof typeof RiskLevel];
