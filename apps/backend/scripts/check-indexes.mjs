// apps/backend/scripts/check-indexes.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pretty(rows) {
  // Group columns by index name, keep column order
  const byKey = {};
  for (const r of rows) {
    const key =
      r.Key_name ?? r.KeyName ?? r.key_name ?? r.Index_name ?? r.index_name ?? 'UNKNOWN';
    const col =
      r.Column_name ?? r.ColumnName ?? r.column_name ?? r.Column ?? r.column ?? undefined;
    const seq =
      Number(r.Seq_in_index ?? r.SeqInIndex ?? r.seq_in_index ?? r.Seq ?? r.seq ?? 0);
    if (!key || !col) continue;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ seq, col });
  }
  const out = {};
  for (const [k, arr] of Object.entries(byKey)) {
    out[k] = arr.sort((a, b) => a.seq - b.seq).map((x) => x.col);
  }
  return out;
}

function hasIndex(map, name, cols) {
  const got = map[name];
  if (!got) return false;
  if (got.length !== cols.length) return false;
  return got.every((c, i) => String(c) === String(cols[i]));
}

async function main() {
  // MySQL / PlanetScale
  const phaseRows = await prisma.$queryRawUnsafe('SHOW INDEX FROM `PhaseRun`');
  const msgRows   = await prisma.$queryRawUnsafe('SHOW INDEX FROM `AgentMessage`');

  const phaseMap = pretty(phaseRows);
  const msgMap   = pretty(msgRows);

  console.log('Indexes on PhaseRun:', JSON.stringify(phaseMap, null, 2));
  console.log('Indexes on AgentMessage:', JSON.stringify(msgMap, null, 2));

  const ok1 = hasIndex(phaseMap, 'idx_PhaseRun_campaign_phase', ['campaignId', 'phase']);
  const ok2 = hasIndex(msgMap, 'idx_AgentMessage_phaseRun_created', ['phaseRunId', 'createdAt']);

  if (ok1 && ok2) {
    console.log('✅ Required indexes present.');
    process.exit(0);
  } else {
    if (!ok1) console.error('❌ Missing idx_PhaseRun_campaign_phase (campaignId, phase)');
    if (!ok2) console.error('❌ Missing idx_AgentMessage_phaseRun_created (phaseRunId, createdAt)');
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error('[check-indexes] Error:', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
