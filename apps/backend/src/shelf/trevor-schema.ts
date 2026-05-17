// apps/backend/src/shelf/trevor-schema.ts
// Output schema that maps Trudy's campaign routes to Trevor Wizard's Salesforce data contract.
// Trevor's core object: Promotional_Campaign__c (see Trevor FIELD_MAP in salesforce.js)

import { z } from 'zod'

// The 5 One Job types from The Shelf
export const OneJobEnum = z.enum(['BREAKER', 'CONVERTER', 'BUILDER', 'LOADER', 'HARVESTER', 'KEEPER'])

// Maps to Trevor's Campaign_Type__c picklist
export const TrevorCampaignTypeEnum = z.enum([
  'Simple Entry',     // Prize draw, sweepstakes
  'Cashback',         // Cashback / refund
  'Gift with Purchase', // GWP
  'Sweepstakes',      // Instant win
  'Code Based',       // Unique code entry
])

// The Shelf's mechanic categories
export const MechanicEnum = z.enum([
  'PRICE_OFF', 'SAMPLE_TRIAL', 'CASHBACK', 'INSTANT_WIN',
  'COLLECT_TO_WIN', 'LOYALTY_BOOST', 'STREAK', 'SUBSCRIPTION',
  'GWP', 'BUNDLE', 'BONUS_PACK', 'COUPON',
  'PRIZE_DRAW', 'REFERRAL', 'UGC_CHALLENGE', 'CAUSE_RELATED',
  'CONDITIONAL', 'PARTNERSHIP', 'SLP', 'INSURED',
])

// Prize definition — maps to Promotional_Campaign_Prize__c
export const PrizeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  value: z.number(), // AUD
  quantity: z.number().int().min(1),
  type: z.enum(['Physical', 'Voucher', 'Experience', 'Cash', 'Points']),
  tier: z.enum(['HERO', 'MAJOR', 'MINOR', 'INSTANT', 'CONSOLATION']).optional(),
})

// Entry friction profile — maps to Trevor's entry form config
export const FrictionProfileSchema = z.object({
  entryMethod: z.enum(['QR_SCAN', 'RECEIPT_UPLOAD', 'CODE_ENTRY', 'PEEL_REVEAL', 'APP', 'WEBSITE', 'SMS']),
  estimatedSeconds: z.number().int(), // time to complete entry
  fields: z.array(z.object({
    name: z.string(), // e.g., 'firstName', 'email', 'mobile', 'state', 'bsb', 'dob'
    required: z.boolean(),
    justification: z.enum(['BUDGET_PROTECTION', 'VALUE_AMPLIFICATION', 'LEGAL_REQUIREMENT', 'UNNECESSARY']),
  })),
  receiptRequired: z.boolean(),
  frictionLevel: z.enum(['ZERO', 'LOW', 'MEDIUM', 'HIGH']),
  frictionRationale: z.string(), // why this level of friction is right for this mechanic
})

// Budget scenario
export const BudgetScenarioSchema = z.object({
  redemptionRate: z.number(), // 0.10, 0.30, 0.60
  totalCost: z.number(),
  costPerAcquisition: z.number().optional(),
  prizePoolCost: z.number(),
  operationalCost: z.number().optional(),
  verdict: z.enum(['SAFE', 'WATCH', 'BLOWOUT']),
  note: z.string().optional(),
})

// The 3-Second Equation scores
export const ThreeSecondScoreSchema = z.object({
  reward: z.number().min(1).max(10),
  rewardNote: z.string(),
  belief: z.number().min(1).max(10),
  beliefNote: z.string(),
  friction: z.number().min(1).max(10), // 10 = frictionless, 1 = painful
  frictionNote: z.string(),
  conversion: z.number().min(1).max(10), // composite
})

// Kill Sheet result
export const KillSheetSchema = z.object({
  reward: z.object({ pass: z.boolean(), note: z.string() }),
  urgency: z.object({ pass: z.boolean(), note: z.string() }),
  belief: z.object({ pass: z.boolean(), note: z.string() }),
  speed: z.object({ pass: z.boolean(), note: z.string() }),
  scan: z.object({ pass: z.boolean(), note: z.string() }),
  loadTime: z.object({ pass: z.boolean(), note: z.string() }),
  data: z.object({ pass: z.boolean(), note: z.string() }),
  ops: z.object({ pass: z.boolean(), note: z.string() }),
  passCount: z.number().int(),
  failCount: z.number().int(),
  verdict: z.enum(['GO', 'REWORK', 'KILL']),
})

// Message hierarchy
export const MessageHierarchySchema = z.object({
  headline: z.string().max(50), // 8-12 words, trigger word first
  subline: z.string().max(80).optional(),
  packCopy: z.string().max(40).optional(), // on-pack text
  staffLine: z.string().max(40).optional(), // 5-second staff script
  shelfBreakScore: z.number().min(1).max(10), // would this stop someone in 3 seconds?
})

// S.O.S. retailer pitch
export const RetailerPitchSchema = z.object({
  simple: z.string(), // one sentence
  operational: z.string(), // one sentence
  sales: z.string(), // one sentence with maths
})

// Creative Director — positioning lenses for headline craft
export const HeadlineLensEnum = z.enum([
  'TRANSACTIONAL',     // the obvious baseline — what 90% of category does
  'CULTURAL_MOMENT',   // tied to what's happening now (winter, cost of living, EOFY, etc.)
  'BRAND_TRUTH',       // anchored in what the brand actually stands for
  'EMOTIONAL_JOB',     // what the shopper feels (life-stage truth, self-investment, etc.)
  'WILDCARD',          // the unexpected angle that flips category convention
])

export const HeadlineAngleSchema = z.object({
  lens: HeadlineLensEnum,
  headline: z.string(),         // 6-14 words, follows the message hierarchy
  subhead: z.string().optional(),
  rationale: z.string(),        // why this lens / why this line — 1-2 sentences
  pilot: z.enum(['GAMBLER', 'ACCOUNTANT', 'HYBRID']).optional(),
})

// Creative Director block — runs alongside Provocateur + Pragmatist
export const CreativeDirectorSchema = z.object({
  score: z.number().min(1).max(10),
  note: z.string(),
  headlineAngles: z.array(HeadlineAngleSchema), // five lenses, one entry per lens
  signatureMoment: z.string(), // "the scene people will talk about"
})

// Ambition zone — drives the SAFE/BOLD/RIDICULOUS spread on alternative routes
export const AmbitionZoneEnum = z.enum(['SAFE', 'BOLD', 'RIDICULOUS'])

// A single campaign route — the core output unit
export const CampaignRouteSchema = z.object({
  id: z.string(),
  name: z.string(), // short memorable name
  oneJob: OneJobEnum,
  mechanic: MechanicEnum,
  trevorCampaignType: TrevorCampaignTypeEnum, // Trevor-compatible type

  // The idea
  concept: z.string(), // 2-3 sentences explaining the idea
  whyItWorks: z.string(), // behavioral/cultural reasoning
  whatBreaks: z.string(), // honest assessment of risks

  // The Shelf scores
  threeSecondScore: ThreeSecondScoreSchema,
  pilot: z.enum(['GAMBLER', 'ACCOUNTANT', 'HYBRID']), // which shopper mindset it targets
  killSheet: KillSheetSchema.optional(), // filled in during stress test

  // Creative
  messageHierarchy: MessageHierarchySchema,

  // Friction design
  frictionProfile: FrictionProfileSchema,

  // Prize architecture
  prizes: z.array(PrizeSchema),
  totalPrizePoolValue: z.number(),

  // Budget
  budgetScenarios: z.array(BudgetScenarioSchema).optional(), // 10/30/60%

  // Retailer
  retailerPitch: RetailerPitchSchema.optional(),

  // Provocateur vs Pragmatist
  provocateurScore: z.number().min(1).max(10).optional(),
  provocateurNote: z.string().optional(),
  pragmatistScore: z.number().min(1).max(10).optional(),
  pragmatistNote: z.string().optional(),

  // Ambition zone — assigned when generated as part of a SAFE/BOLD/RIDICULOUS trio
  ambitionZone: AmbitionZoneEnum.optional(),

  // Signature moment — the scene people will talk about (Mark's 2024 vision: "scene people will talk about")
  signatureMoment: z.string().optional(),

  // Creative headline craft — 5 positioning angles, one per lens
  headlineAngles: z.array(HeadlineAngleSchema).optional(),

  // Dates (optional, from brief)
  suggestedDurationDays: z.number().int().optional(),

  // Entry config for Trevor handoff
  trevorEntryConfig: z.object({
    fields: z.record(z.boolean()), // { firstName: true, email: true, mobile: false, ... }
    fieldsRequired: z.record(z.boolean()),
    receiptRequired: z.boolean(),
    maxReceipts: z.number().int().optional(),
    codeRequired: z.boolean(),
    entryLimit: z.number().int().optional(),
    dailyEntryLimit: z.number().int().optional(),
  }).optional(),
})

// Mode 2: Evaluation verdict for an existing idea
export const EvaluationVerdictSchema = z.object({
  idea: z.string(), // the original idea as submitted
  oneJob: OneJobEnum.nullable(), // detected job, or null if unclear
  oneJobIssue: z.string().optional(), // "trying to do Trial + Data simultaneously"

  threeSecondScore: ThreeSecondScoreSchema,
  killSheet: KillSheetSchema,
  frictionAudit: z.object({
    currentLevel: z.enum(['ZERO', 'LOW', 'MEDIUM', 'HIGH']),
    optimalLevel: z.enum(['ZERO', 'LOW', 'MEDIUM', 'HIGH']),
    fieldsToRemove: z.array(z.string()),
    fieldsToAdd: z.array(z.string()),
    rationale: z.string(),
  }),
  // Budget scenarios were removed — the LLM has no real anchor for media spend,
  // audience size, or store distribution, so the numbers were precise-looking
  // fiction. Pragmatist note now carries the narrative cost reasoning instead.
  // Field kept optional for back-compat with old persisted verdicts.
  budgetScenarios: z.array(BudgetScenarioSchema).optional(),
  messageHierarchy: z.object({
    current: MessageHierarchySchema.optional(),
    improved: MessageHierarchySchema,
  }),
  retailerReadiness: z.object({
    wouldCategoryManagerSayYes: z.boolean(),
    risks: z.array(z.string()),
    pitch: RetailerPitchSchema,
  }),

  // The verdict
  whatWorks: z.array(z.string()),
  whatBreaks: z.array(z.object({
    issue: z.string(),
    shelfReference: z.string(), // e.g., "Insult Threshold (Ch. 3)"
    fix: z.string(),
  })),
  whatToChange: z.array(z.string()),

  verdict: z.enum(['GO', 'REWORK', 'KILL']),
  verdictRationale: z.string(),

  // Optional: alternative routes
  alternativeRoutes: z.array(CampaignRouteSchema).optional(),
})

// Types
export type OneJob = z.infer<typeof OneJobEnum>
export type CampaignRoute = z.infer<typeof CampaignRouteSchema>
export type EvaluationVerdict = z.infer<typeof EvaluationVerdictSchema>
export type Prize = z.infer<typeof PrizeSchema>
export type FrictionProfile = z.infer<typeof FrictionProfileSchema>
export type KillSheet = z.infer<typeof KillSheetSchema>
export type MessageHierarchy = z.infer<typeof MessageHierarchySchema>
export type RetailerPitch = z.infer<typeof RetailerPitchSchema>
export type BudgetScenario = z.infer<typeof BudgetScenarioSchema>
export type ThreeSecondScore = z.infer<typeof ThreeSecondScoreSchema>
export type HeadlineLens = z.infer<typeof HeadlineLensEnum>
export type HeadlineAngle = z.infer<typeof HeadlineAngleSchema>
export type CreativeDirectorBlock = z.infer<typeof CreativeDirectorSchema>
export type AmbitionZone = z.infer<typeof AmbitionZoneEnum>
