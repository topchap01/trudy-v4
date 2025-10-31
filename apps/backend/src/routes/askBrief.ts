import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { prisma } from '../db/prisma.js';

const router = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || undefined });
const MODEL = process.env.TRUDY_SYNTH_MODEL || 'gpt-4o-mini';
const FAKE = process.env.TRUDY_FAKE_RUNS === 'true';
const PERSIST = process.env.TRUDY_PERSIST_ASK === 'true';

const Params = z.object({ id: z.string().min(1) });

const Body = z.object({
  action: z.literal('clarify').default('clarify'),
  prompt: z.preprocess(
    v => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.string().trim().optional(),
  ),
  payload: z.record(z.any()).optional(),
});

const ClarifyResult = z.object({
  problemStatement: z.string(),
  questions: z.array(z.object({
    theme: z.string(),
    question: z.string(),
  })).min(3).max(12),
  missingData: z.array(z.string()).max(20),
});

// Local fallback that derives questions from parsedJson + rawText
function clarifyLocally(rawText: string, parsedJson: any) {
  const missing: string[] = [];
  const ask: Array<{ theme: string; question: string }> = [];
  const pj = parsedJson && typeof parsedJson === 'object' ? parsedJson : {};

  const add = (theme: string, question: string, keyForMissing?: string) => {
    ask.push({ theme, question });
    if (keyForMissing) missing.push(keyForMissing);
  };

  if (!pj.objective) add('Objective', 'What is the single commercial objective (e.g., drive AWOP %, penetration, or sell-in)?', 'objective');
  if (!pj.retailers || pj.retailers.length === 0) add('Retail', 'Which retailers are must-win and what are their sell-in dates?', 'retailers');
  if (pj.budgetTotal == null) add('Budget', 'What is the total working budget, and how is it split across media, prizes and fulfilment?', 'budgetTotal');
  if (!pj.prize?.major) add('Prize', 'Confirm the major prize and total prize value (AUD), plus any instant/weekly tiers.', 'prize');
  if (!pj.mechanics || pj.mechanics.length === 0) add('Mechanic', 'Which entry mechanic is preferred (instant, weekly, major draw, or skill)?', 'mechanics');
  if (!pj.channels || pj.channels.length === 0) add('Channels', 'What channels must be included (in-store, CRM, Meta, TikTok, OOH)?', 'channels');
  if (!pj.timing?.keyDates?.length) add('Timing', 'What are the key timing anchors (e.g., Easter, on-shelf, end date)?', 'timing');
  if (!pj.constraints?.length) add('Compliance', 'Any compliance constraints (ABAC, age-gating 18+, permits)?', 'constraints');
  if (!pj.skus?.length) add('SKU', 'Which SKUs/SUB-brands are in scope (exact list/GTINs)?', 'skus');
  if (!pj.metrics?.length) add('Measurement', 'What KPIs define success (e.g., AWOP +X%, entries, redemption rate)?', 'metrics');

  while (ask.length < 3) {
    add('Context', 'Any creative mandatories or retailer-specific mandatories we must honour?', 'mandatories');
    if (ask.length >= 3) break;
    add('Ops', 'Who is responsible for winner management and prize fulfilment logistics?', 'operations');
  }

  const problemStatement =
    'We need to lock a retailer-ready shopper brief with clear objective, budget split, prize ladder, mechanic, KPIs, timing and compliance guardrails for this market/category.';

  return {
    problemStatement,
    questions: ask.slice(0, 12),
    missingData: Array.from(new Set(missing)).slice(0, 20),
  };
}

router.post('/campaigns/:id/ask/brief', async (req: Request, res: Response) => {
  try {
    const { id } = Params.parse(req.params);
    const { prompt } = Body.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true },
    });
    if (!campaign) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    }
    const brief = campaign.brief;
    if (!brief || (!brief.rawText && !brief.parsedJson)) {
      return res.status(400).json({ error: { code: 'MISSING_BRIEF', message: 'Brief not attached to campaign yet' } });
    }

    if (FAKE) {
      const fake = clarifyLocally(brief.rawText || '', brief.parsedJson || {});
      return res.json({ ok: true, result: fake, source: 'fake' });
    }

    const rawText = brief.rawText || JSON.stringify(brief.parsedJson ?? {}, null, 2);

    let result: z.infer<typeof ClarifyResult> | null = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const system = [
          'You are Trudy’s Brief Clarifier.',
          'Read the supplied brief and produce:',
          '1) A single-sentence problemStatement.',
          '2) 3–12 clarifying questions (each with a theme).',
          '3) A missingData checklist.',
          'Return strict JSON that matches the schema.',
        ].join(' ');

        const user = [
          `Market: ${campaign.market ?? 'AU'}`,
          `Category: ${campaign.category ?? 'N/A'}`,
          prompt ? `Extra context from user: ${prompt}` : '',
          '---',
          'BRIEF:',
          rawText,
        ].join('\n');

        const resp = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' as const },
        });

        const raw = resp.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        result = ClarifyResult.parse(parsed);

        if (PERSIST) {
          await prisma.agentMessage.create({
            data: {
              campaignId: campaign.id,
              agent: 'CLARA',
              role: 'SUGGESTION',
              text: JSON.stringify(result),
              tokenCount: resp.usage?.total_tokens ?? 0,
            } as any,
          }).catch(() => {});
        }
      } catch {
        result = null;
      }
    }

    if (!result) {
      result = clarifyLocally(brief.rawText || '', brief.parsedJson || {});
      return res.json({ ok: true, result, source: 'local' });
    }

    return res.json({ ok: true, result, source: 'model' });
  } catch (err: any) {
    const message = err?.issues ? 'Validation error' : err?.message || 'Unknown error';
    return res.status(400).json({
      error: { code: 'ASK_BRIEF_ERROR', message, ...(err?.issues ? { issues: err.issues } : {}) },
    });
  }
});

export default router;
