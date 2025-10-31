// apps/backend/scripts/enrichLegacyBriefs.mjs
/**
 * Legacy Brief Enrichment
 * Backfills: target.primary, timing.start, timing.end (never overwrites).
 * Dry-run by default with DRY_RUN=1.
 *
 * Usage:
 *   DRY_RUN=1 pnpm -C apps/backend exec node ./scripts/enrichLegacyBriefs.mjs --limit 5
 *   pnpm -C apps/backend exec node ./scripts/enrichLegacyBriefs.mjs --limit 50
 *   pnpm -C apps/backend exec node ./scripts/enrichLegacyBriefs.mjs --campaign-id <id>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Load env from backend first (then root) BEFORE Prisma is created ----------
function loadEnvFiles() {
  const cwd = process.cwd();
  const backendDir = path.resolve(__dirname, '..'); // apps/backend
  const candidates = [
    path.join(backendDir, '.env.local'),
    path.join(backendDir, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env'),
  ].filter((p) => fs.existsSync(p));

  let loadedFrom = [];
  for (const p of candidates) {
    loadEnv({ path: p, override: true });
    loadedFrom.push(p);
  }
  return loadedFrom;
}

function redactUrl(u) {
  if (!u) return '(missing)';
  // avoid URL parsing pitfalls with special query strings
  return u.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://***:***@');
}

function parseHost(u) {
  if (!u) return { host: '-', port: '-', db: '-' };
  // crude parse that works for mysql DSNs
  const at = u.split('@')[1] || '';
  const hostPort = at.split('/')[0] || '';
  const db = (at.split('/')[1] || '').split('?')[0] || '';
  const [host, port] = hostPort.split(':');
  return { host: host || '-', port: port || '-', db: db || '-' };
}

const loaded = loadEnvFiles();

// Dynamic import so env is present before Prisma reads it
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

// ---------------- CLI args ----------------
function argvFlag(name, def = false) {
  return process.argv.includes(`--${name}`) ? true : def;
}
function argvValue(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
}

const DRY_RUN = process.env.DRY_RUN === '1' || argvFlag('dry-run', false);
const LIMIT = parseInt(argvValue('limit', '0') || '0', 10) || 0;
const ONE_CAMPAIGN = argvValue('campaign-id', null);

// ---------------- date helpers ----------------
function pad(n) { return String(n).padStart(2, '0'); }
function toDateOnly(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function addDays(dateStr, days) {
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + days);
  return toDateOnly(dt);
}

// Try to infer start/end from keyDates array if present & valid
function inferFromKeyDates(keyDates) {
  if (!Array.isArray(keyDates) || keyDates.length === 0) return null;
  const valid = keyDates
    .map((s) => new Date(s))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const start = toDateOnly(valid[0]);
  const end = toDateOnly(valid[valid.length - 1]);
  return { start, end };
}

// Ensure timing; preserve existing, else infer, else default (+28d)
function ensureTiming(parsed) {
  const out = { ...(parsed?.timing || {}) };
  if (out.start && out.end) return { timing: out, method: 'existing' };
  const k = inferFromKeyDates(parsed?.keyDates);
  if (k) {
    if (!out.start) out.start = k.start;
    if (!out.end) out.end = k.end;
    if (out.start && out.end) return { timing: out, method: 'keyDates' };
  }
  if (out.start && !out.end) return { timing: { ...out, end: addDays(out.start, 28) }, method: 'start+28' };
  if (!out.start && out.end) return { timing: { ...out, start: addDays(out.end, -28) }, method: 'end-28' };
  const start = toDateOnly(new Date());
  const end = addDays(start, 28);
  return { timing: { ...out, start, end }, method: 'default28' };
}

// Ensure target.primary; never overwrite; promote secondary if present
function ensureTargetPrimary(parsed) {
  const out = { ...(parsed?.target || {}) };
  if (out.primary && String(out.primary).trim()) return { target: out, method: 'existing' };
  if (!out.primary && out.secondary && String(out.secondary).trim()) {
    return { target: { ...out, primary: String(out.secondary).trim() }, method: 'promotedSecondary' };
  }
  return { target: { ...out, primary: 'TBC' }, method: 'defaultTBC' };
}

function cloneJson(x) {
  return x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : {};
}

// ---------------- main ----------------
async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  const { host, port, db } = parseHost(dbUrl);

  console.info(
    `[ENRICH] start DRY_RUN=${DRY_RUN ? '1' : '0'} limit=${LIMIT || '-'} campaignId=${ONE_CAMPAIGN || '-'}`
  );
  console.info(`[ENRICH] env files loaded: ${loaded.length ? loaded.join(', ') : '(none found)'}`);
  console.info(`[ENRICH] DATABASE_URL=${redactUrl(dbUrl)}`);
  console.info(`[ENRICH] target DB: ${host}:${port}/${db}`);

  let briefs = await prisma.brief.findMany({
    select: { campaignId: true, parsedJson: true, assets: true },
    ...(ONE_CAMPAIGN ? { where: { campaignId: ONE_CAMPAIGN } } : {}),
  });

  const candidates = briefs.filter((b) => {
    const p = b.parsedJson || {};
    const hasTargetPrimary = !!(p?.target && p.target.primary && String(p.target.primary).trim());
    const hasTimingStart = !!(p?.timing && p.timing.start && String(p.timing.start).trim());
    const hasTimingEnd = !!(p?.timing && p.timing.end && String(p.timing.end).trim());
    return !hasTargetPrimary || !hasTimingStart || !hasTimingEnd;
  });

  if (LIMIT > 0) candidates.splice(LIMIT);

  console.info(`[ENRICH] scan: found ${candidates.length} candidate(s)`);

  let updated = 0;
  for (const brief of candidates) {
    const original = cloneJson(brief.parsedJson);
    const p = cloneJson(brief.parsedJson);

    const { target, method: targetMethod } = ensureTargetPrimary(p);
    const { timing, method: timingMethod } = ensureTiming(p);

    p.target = { ...(p.target || {}), ...target };
    p.timing = { ...(p.timing || {}), ...timing };

    const changed =
      JSON.stringify(p.target) !== JSON.stringify(original?.target || {}) ||
      JSON.stringify(p.timing) !== JSON.stringify(original?.timing || {});

    if (!changed) {
      console.info(`[ENRICH] ${brief.campaignId}: no-op (already complete)`);
      continue;
    }

    const assets = cloneJson(brief.assets);
    const mig = cloneJson(assets.migrations);
    const nowIso = new Date().toISOString();

    const entry = {
      kind: 'legacy-brief-enrichment',
      at: nowIso,
      targetMethod,
      timingMethod,
      notes: 'Backfilled required launch fields; values are placeholders if inference unavailable.',
    };

    assets.migrations = {
      ...mig,
      last: entry,
      history: Array.isArray(mig.history) ? [...mig.history, entry] : [entry],
    };

    if (DRY_RUN) {
      console.info(
        `[ENRICH][DRY] ${brief.campaignId}: target.primary=${JSON.stringify(
          p.target.primary
        )} timing.start=${p.timing.start} timing.end=${p.timing.end} methods=${targetMethod}/${timingMethod}`
      );
      continue;
    }

    await prisma.brief.update({
      where: { campaignId: brief.campaignId },
      data: { parsedJson: p, assets },
    });

    console.info(
      `[ENRICH][OK] ${brief.campaignId}: target.primary=${JSON.stringify(
        p.target.primary
      )} timing.start=${p.timing.start} timing.end=${p.timing.end} methods=${targetMethod}/${timingMethod}`
    );
    updated++;
  }

  console.info(
    `[ENRICH] done: updated=${updated} skipped=${candidates.length - updated} totalCandidates=${candidates.length}`
  );
}

main()
  .catch((e) => {
    console.error('[ENRICH][ERROR]', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
