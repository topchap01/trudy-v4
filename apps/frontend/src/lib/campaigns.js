// apps/frontend/src/lib/campaigns.js
// Unified frontend API helpers for Trudy v4

async function api(path, { method = 'GET', body, headers } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) throw new Error(json?.error || json?.message || `${r.status} ${r.statusText}`);
  return json ?? {};
}

// ------- Campaigns -------
export async function listCampaigns() {
  const data = await api('/api/campaigns');
  return Array.isArray(data?.campaigns) ? data.campaigns : (Array.isArray(data) ? data : []);
}
export async function createCampaign(payload) {
  const data = await api('/api/campaigns', { method: 'POST', body: payload });
  return data?.campaign ?? data;
}

export async function updateCampaign(id, payload) {
  const data = await api(`/api/campaigns/${id}`, { method: 'PATCH', body: payload });
  return data;
}
export async function getCampaign(id) {
  const data = await api(`/api/campaigns/${id}`);
  return data?.campaign ?? data;
}

export async function getCampaignDebugBundle(id) {
  return await api(`/api/campaigns/${id}/debug/bundle`);
}

export async function askAnalyst(id, payload) {
  return await api(`/api/campaigns/${id}/debug/query`, { method: 'POST', body: payload });
}

export async function runResearchTask(id, payload = {}) {
  return await api(`/api/campaigns/${id}/debug/research-task`, { method: 'POST', body: payload });
}

// ------- Brief -------
export async function getBrief(id) {
  const data = await api(`/api/campaigns/${id}/brief`);
  return data?.brief ?? null;
}
export async function putBrief(id, payload) {
  return await api(`/api/campaigns/${id}/brief`, { method: 'PUT', body: payload });
}

export async function saveBriefQAResponse(id, issueId, response) {
  return await api(`/api/campaigns/${id}/brief/qa/issues/${issueId}/response`, {
    method: 'POST',
    body: { response },
  });
}

// ------- Framing -------
export async function runFraming(id) {
  const data = await api(`/api/campaigns/${id}/framing/run`, { method: 'POST' });
  // Backend may return { result: { id, content, meta? } } or { id, content, params? }
  const r = data?.result ?? data;
  // We don’t depend on meta for Framing in the UI yet, so return r directly.
  return r;
}

// ------- Evaluate (normalized to always return { content, meta }) -------
export async function runEvaluate(id) {
  const data = await api(`/api/campaigns/${id}/evaluate/run`, { method: 'POST' });
  const r = data?.result ?? data;
  const meta = r?.meta ?? r?.params ?? null;
  return { content: r?.content ?? '', meta };
}

// ------- Create -------
export async function runCreate(id, { intensity = 'DISRUPTIVE', count = 7 } = {}) {
  const data = await api(`/api/campaigns/${id}/create/run`, { method: 'POST', body: { intensity, count } });
  return data?.result ?? data;
}

// ------- Ideation (CREATE_UNBOXED + HARNESS) -------
export async function runIdeation(id) {
  const data = await api(`/api/campaigns/${id}/ideation/run`, { method: 'POST' });
  const result = data?.result ?? data ?? {};
  const harnessRow = result?.harness ?? null;
  const unboxedRow = result?.unboxed ?? null;
  const harness = harnessRow?.data ?? harnessRow ?? null;
  const unboxed = Array.isArray(unboxedRow?.data)
    ? unboxedRow.data
    : Array.isArray(unboxedRow)
      ? unboxedRow
      : [];
  return {
    harness,
    unboxed,
    harnessRow,
    unboxedRow,
  };
}

// ------- Synthesis -------
export async function runSynthesis(id) {
  const data = await api(`/api/campaigns/${id}/synthesis/run`, { method: 'POST' });
  return data?.result ?? data;
}

// ------- Opinion (narrative synthesis of framing + evaluation) -------
export async function runOpinion(id, opts = {}) {
  // opts can include { ruleFlex?: 'KEEP'|'BEND'|'BREAK' }
  const data = await api(`/api/campaigns/${id}/opinion/run`, { method: 'POST', body: opts });
  const r = data?.result ?? data;
  const meta = r?.meta ?? r?.params ?? null;
  return { content: r?.content ?? '', meta };
}

// ------- Strategist (scenario playbook) -------
export async function runStrategist(id, opts = {}) {
  const payload = {}
  if (Array.isArray(opts.customPrompts) && opts.customPrompts.length) {
    payload.customPrompts = opts.customPrompts
  }
  if (opts.deepDive) payload.deepDive = true
  if (opts.mode) payload.mode = opts.mode
  const data = await api(`/api/campaigns/${id}/strategist/run`, { method: 'POST', body: payload });
  return data?.result ?? data;
}

// ------- Judge (quality audit) -------
export async function runJudge(id, opts = {}) {
  const data = await api(`/api/campaigns/${id}/judge/run`, { method: 'POST', body: opts });
  return data?.result ?? data;
}

// ------- War Room prefs -------
export async function updateWarRoomPrefs(id, payload) {
  const data = await api(`/api/campaigns/${id}/war-room/prefs`, { method: 'POST', body: payload });
  return data?.prefs ?? data;
}

export async function updateResearchOverrides(id, payload) {
  const data = await api(`/api/campaigns/${id}/war-room/research/overrides`, { method: 'POST', body: payload });
  return data?.overrides ?? data;
}

// ------- Exports -------
export async function listExports(id) {
  const data = await api(`/api/campaigns/${id}/exports`);
  return Array.isArray(data?.artifacts) ? data.artifacts : (Array.isArray(data) ? data : []);
}
export async function createExport(id, options) {
  const data = await api(`/api/campaigns/${id}/exports`, { method: 'POST', body: options || {} });
  return data?.artifact ?? data;
}

// ------- Latest outputs snapshot -------
export async function getLatestOutputs(id) {
  return await api(`/api/campaigns/${id}/outputs/latest`);
}

// ------- Variants -------
export async function getVariants(id) {
  const data = await api(`/api/campaigns/${id}/variants`);
  return data?.variants ?? [];
}

export async function saveVariants(id, variants, options = {}) {
  const body = { variants }
  if (options && options.spark) body.spark = options.spark
  const data = await api(`/api/campaigns/${id}/variants`, { method: 'POST', body });
  return data?.variants ?? [];
}

export async function runVariantEvaluate(id, variantId, payload = {}) {
  const data = await api(`/api/campaigns/${id}/variants/${variantId}/evaluate`, { method: 'POST', body: payload });
  return data?.result ?? data;
}

export async function draftVariantOverrides(id, instructions) {
  const data = await api(`/api/campaigns/${id}/variants/draft`, {
    method: 'POST',
    body: { instructions },
  })
  return data?.overrides ?? {}
}

// ------- Promo Builder -------
export async function getPromoBuilderCards() {
  const data = await api(`/api/promo-builder/cards`)
  return data?.cards ?? []
}

export async function runPromoBuilderEvaluate(payload) {
  return await api(`/api/promo-builder/evaluate`, { method: 'POST', body: payload })
}

// ------- Spark -------
export async function sparkIdea(idea) {
  return await api(`/api/spark`, { method: 'POST', body: { idea } })
}
