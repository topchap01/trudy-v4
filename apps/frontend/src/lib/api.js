// apps/frontend/src/lib/api.js
console.info('[TRUDY][api.js] LOADED', new Date().toISOString());

/* -----------------------------
 * Auth header (dev fallback)
 * ----------------------------- */
function authHeaders() {
  const devEmail =
    localStorage.getItem('devEmail') ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DEV_EMAIL : null);
  return devEmail ? { 'x-user-email': devEmail } : {};
}

/* -----------------------------
 * HTTP wrapper
 * ----------------------------- */
async function http(url, init) {
  const method = (init?.method || 'GET').toUpperCase();
  const hasBody = !!init?.body;
  const res = await fetch(url, {
    cache: method === 'GET' ? 'default' : 'no-store',
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  let body = null;
  try {
    body = isJson ? await res.json() : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(
      (isJson && body && typeof body === 'object' && (body.error?.message || JSON.stringify(body))) ||
      (typeof body === 'string' && body) ||
      res.statusText
    );
  }
  return body;
}

/* Download helper for streaming binary responses (PDF/DOCX) */
async function downloadStream(url, { method = 'POST', body = undefined, filenameHint = 'download' } = {}) {
  const res = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error?.message || msg;
    } catch {}
    throw new Error(msg || 'Download failed');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const m = disposition.match(/filename="([^"]+)"/i);
  const filename = (m && m[1]) || filenameHint;
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(urlObj), 2000);
}

const asArray = (d, key) => (Array.isArray(d) ? d : (d && d[key]) || []);
const asObject = (d, key) => (d && d[key]) || d;

/* -----------------------------
 * Ask adapters & helpers
 * ----------------------------- */

const KEY_BY_THEME = {
  'Brand Basics': 'brand',
  'Category': 'category',
  'Mechanic': 'mechanic',
  'Prize': 'prize',
  'Dates & Regions': 'regions',
  'Retail & Channels': 'retailers',
  'Compliance': 'compliance',
  'Budget & Volume': 'budget',
  'Proof & UGC': 'proofOfPurchase',
  'Target': 'target',

  // Legacy/other themes
  Objective: 'objective',
  Retail: 'retailers',
  Budget: 'budgetTotal',
  Channels: 'channels',
  Timing: 'timing',
  SKU: 'skus',
  Measurement: 'metrics',
  Context: 'mandatories',
  Ops: 'operations',
  'Creative Hook': 'creativeHook',
  Proposition: 'proposition',
  'Trade Incentive': 'tradeIncentive',
  'Budget Split': 'budgetSplit',
  'Prize Tiers': 'prizeTiers',
  'Prize Pool Value': 'prizePoolValue',
  'Proof of Purchase': 'proofOfPurchase',
  'Secondary Mechanic': 'secondaryMechanic',
  'Entry Friction': 'entryFriction',
  'Channel Exclusions': 'channelExclusions',
  'Sell-in': 'retailSellin',
  'Artwork Deadlines': 'artworkDeadlines',
  'Age Gating': 'ageGating',
  Permits: 'permits',
  'Privacy & Consent': 'privacyConsent',
  Eligibility: 'eligibility',
  'Min Purchase': 'minPurchase',
  'Participating Outlets': 'participatingOutlets',
  KPIs: 'kpis',
  'Source of Truth': 'sourceOfTruth',
  'Reporting Cadence': 'reportingCadence',
  'Tone & Brand Assets': 'brandAssets',
  Fulfilment: 'fulfilment',
  'Anti-fraud': 'antiFraud',
  'Support & SLAs': 'support',
  'T&Cs Ownership': 'tncOwnership',
};

const DEFAULT_MECHANIC_OPTIONS = [
  'Prize Draw (Major)',
  'Prize Draw (Weekly)',
  'Prize Draw (Daily)',
  'Instant Win',
  'Lucky Door Prize',
  'Golden Ticket (in-pack)',
  'Game of Skill (25 words or less)',
  'UGC Contest (photo/video)',
  'Social Hashtag Contest',
  'AR Filter Challenge',
  'Trivia / Quiz Challenge',
  'Leaderboard Challenge',
  'Receipt Upload (OCR)',
  'Unique Code on Pack',
  'Barcode Scan & Win',
  'QR Scan & Win',
  'Collect & Win',
  'Loyalty Stamp / Card',
  'Scavenger Hunt / Geo Check-in',
  'Treasure Hunt',
  'Gift with Purchase (GWP)',
  'Buy X Get Y',
  'Multi-buy (Spend & Save)',
  'Tiered Spend & Get',
  'Cashback / Rebate',
  'Instant Discount Coupon',
  'Mystery Discount',
  'Mystery Box',
  'Sampling / Trial',
  'Try & Review',
  'Trade Promotion Lottery',
  'Trade Incentive (scan-back / display bonus)',
  'Register & Win',
  'Survey & Win',
  'Newsletter Sign-up Bonus',
  'Spin to Win (digital)',
  'Scratch & Win (digital)',
  'Recycle / Trade-in to Redeem',
  'Other',
];

export function ensureMechanicOptions() {
  return DEFAULT_MECHANIC_OPTIONS.slice();
}
export function isOtherMechanic(val) {
  return String(val || '').trim().toLowerCase() === 'other';
}
export function normalizeMechanicSelection(sel, otherText) {
  const s = String(sel || '').trim();
  if (!s) return '';
  if (isOtherMechanic(s)) return String(otherText || '').trim();
  return s;
}

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Ensure a UI-friendly question object. */
export function ensureUiQuestion(q, i = 0) {
  const isUiShaped = q && (q.label || q.key || q.type);

  if (isUiShaped) {
    const id = q.id || `q_${slug(q.label || q.key || q.theme || 'q')}_${i + 1}`;
    const type = q.type || (q.key === 'mechanic' ? 'select' : 'text');
    const options = Array.isArray(q.options) && q.options.length
      ? q.options
      : (q.key === 'mechanic' ? DEFAULT_MECHANIC_OPTIONS : undefined);
    return {
      id,
      label: q.label || q.question || q.theme || 'Question',
      key: q.key || KEY_BY_THEME[q.theme] || undefined,
      type,
      options,
      placeholder: q.placeholder || (q.label || q.question || ''),
      theme: q.theme || '',
      required: Boolean(q.required),
      hint: q.hint,
    };
  }

  // Legacy → UI mapping
  const theme = (q?.theme || '').trim();
  const question = (q?.question || '').trim();
  const label = question || theme || 'Question';
  const themeKey =
    KEY_BY_THEME[theme] ||
    KEY_BY_THEME[(theme.split(':')[0] || '').trim()] ||
    undefined;

  const lower = label.toLowerCase();
  const isNumbery = /budget|value|pool|kpi|count|how many|estimated total|aud|\$\d|^\d+$/.test(lower);
  const isDatey = /date|deadline|start|end|sell-?in/.test(lower);
  const isListy = /list|tiers|channels|skus|outlets|exclusions/.test(lower);

  const type =
    themeKey === 'mechanic' ? 'select'
    : isNumbery ? 'number'
    : isDatey ? 'date'
    : isListy ? 'textarea'
    : 'text';

  const options = themeKey === 'mechanic' ? DEFAULT_MECHANIC_OPTIONS : undefined;

  const idBase = slug(theme || label || 'q');
  const id = `q_${idBase || 'q'}_${i + 1}`;

  return {
    id,
    label,
    key: themeKey,
    type,
    options,
    placeholder: label,
    theme,
    required: false,
  };
}

function clarifyMarkdown(result) {
  const lines = [
    `**Problem:** ${result?.problemStatement || '—'}`,
    '',
    '**Questions:**',
    ...(Array.isArray(result?.questions) && result.questions.length
      ? result.questions.map((q) => `- *${q.theme}*: ${q.question}`)
      : ['- —']),
    '',
    '**Missing Data:**',
    ...(Array.isArray(result?.missingData) && result.missingData.length
      ? result.missingData.map((x) => `- ${x}`)
      : ['- —']),
  ];
  return lines.join('\n');
}

/* -----------------------------
 * Public API
 * ----------------------------- */

export const api = {
  // GET /api/campaigns
  listCampaigns: () => http('/api/campaigns').then((d) => asArray(d, 'campaigns')),

  // GET /api/campaigns/:id
  getCampaign: async (id) => {
    try {
      const d = await http(`/api/campaigns/${id}`);
      return asObject(d, 'campaign');
    } catch {
      const list = await api.listCampaigns();
      const found = list.find((c) => c.id === id);
      if (!found) throw new Error('Campaign not found');
      return found;
    }
  },

  // Gating & Framing
  getGating: (id) => http(`/api/campaigns/${id}/gating`),
  getFraming: (id) => http(`/api/campaigns/${id}/framing`),
  getLaunchLast: (id) => http(`/api/campaigns/${id}/launch/last`).then((d) => d?.lastLaunch),

  // Evaluation
  getEvaluation: (id) =>
    http(`/api/campaigns/${id}/evaluation`).then((d) => ({
      available: !!(d?.available || d?.evaluation),
      at: d?.at ?? null,
      source: d?.source ?? d?.from ?? null,
      evaluation: d?.evaluation ?? null,
      history: Array.isArray(d?.history) ? d.history : [],
    })),
  runEvaluation: (id) =>
    http(`/api/campaigns/${id}/evaluate/run`, { method: 'POST' }).then((d) => ({
      ok: !!d?.ok,
      deltaCount: d?.deltaCount ?? 0,
      evaluation: d?.evaluation ?? null,
      history: Array.isArray(d?.history) ? d.history : [],
    })),

  // --- Synthesis ---
  getSynthesis: (id) =>
    http(`/api/campaigns/${id}/synthesis`).then((d) => ({
      available: !!(d?.synthesis),
      at: d?.synthesis?.at ?? null,
      synthesis: d?.synthesis ?? null,
      history: Array.isArray(d?.history) ? d.history : [],
    })),

  runSynthesis: (id) =>
    http(`/api/campaigns/${id}/synthesis/run`, { method: 'POST' }).then((d) => ({
      ok: !!d?.ok,
      synthesis: d?.synthesis ?? null,
      history: Array.isArray(d?.history) ? d.history : [],
    })),

  // Routes
  listIdeaRoutes: (id) => http(`/api/campaigns/${id}/routes`).then((d) => asArray(d, 'routes')),
  postCreate: (id, payload = {}) =>
    http(`/api/campaigns/${id}/create`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((d) => d?.result || d),

  // Brief
  patchBrief: (id, { rawText, parsedJson, assets } = {}) =>
    http(`/api/campaigns/${id}/brief`, {
      method: 'PATCH',
      body: JSON.stringify({ rawText, parsedJson, assets }),
    }),

  // ---- ASK (brief) ----
  askBrief: async (id, { prompt } = {}) => {
    const json = await http(`/api/campaigns/${id}/ask/brief`, {
      method: 'POST',
      body: JSON.stringify(prompt ? { prompt } : {}),
    });

    const rawQs =
      (Array.isArray(json?.questions) && json.questions) ||
      (Array.isArray(json?.result?.questions) && json.result.questions) ||
      [];

    const questions = rawQs.map(ensureUiQuestion);

    let text = '';
    if (typeof json?.text === 'string' && json.text.trim()) {
      text = json.text;
    } else if (json?.result) {
      text = clarifyMarkdown(json.result);
    } else {
      const bullets = questions.length ? questions.map((q) => `- ${q.label}`) : ['- —'];
      text = ['**Questions:**', ...bullets].join('\n');
    }

    return {
      messageId: json?.messageId || `ask_${Date.now()}`,
      text,
      questions,
      raw: json,
    };
  },

  // ---- ASK (outputs) ----
  askOutputs: (id, { action = 'riskProfile', prompt, payload } = {}) =>
    http(`/api/campaigns/${id}/ask/outputs`, {
      method: 'POST',
      body: JSON.stringify({ action, prompt, payload }),
    }).then((json) => ({
      messageId: json?.messageId || `ask_${Date.now()}`,
      text: json?.text || '',
      action: json?.action || action,
      raw: json,
    })),

  // Back-compat shim
  ask: (id, payload = {}) => {
    if (payload.scope === 'OUTPUTS') {
      const { action, prompt, payload: pld } = payload;
      return api.askOutputs(id, { action, prompt, payload: pld });
    }
    if (payload.action === 'clarify' || payload.scope === 'BRIEF' || !payload.action) {
      return api.askBrief(id, { prompt: payload.prompt });
    }
    return api.askOutputs(id, payload);
  },

  // Saved outputs feed
  listOutputs: (id, { limit = 50 } = {}) =>
    http(`/api/campaigns/${id}/outputs?limit=${encodeURIComponent(limit)}`)
      .then((d) => (Array.isArray(d?.outputs) ? d.outputs : Array.isArray(d) ? d : [])),

  // POST /api/campaigns  (supports clientName)
  createCampaign: (data = {}) =>
    http('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        clientName: data?.clientName ?? localStorage.getItem('defaultClientName') ?? undefined,
        clientId: data?.clientId ?? localStorage.getItem('defaultClientId') ?? undefined,
        mode: data?.mode ?? 'EVALUATION',
        market: data?.market ?? 'AU',
        title: data?.title ?? 'Untitled',
        status: data?.status ?? 'DRAFT',
        ...data,
      }),
    }).then((d) => {
      const c = d?.campaign ?? d;
      const id = c?.id ?? d?.campaignId ?? d?.id;
      if (!id) throw new Error('Create campaign: missing id in response');
      return { id, ...c };
    }),

  // Legacy open-in-new-tab
  exportPdf: (id) => downloadStream(`/api/exports/pdf?campaignId=${id}`, { method: 'GET', filenameHint: 'export.pdf' }),
  exportDocx: (id) => downloadStream(`/api/exports/docx?campaignId=${id}`, { method: 'GET', filenameHint: 'export.docx' }),

  // ---- Exports (selected + flags via POST) ----
  // Convenience helpers used by WarRoom (ALL / SELECTED)
  exportPdfSelected: (id, selectionOrOpts = {}, maybeOpts = undefined) => {
    let body = {};
    if (Array.isArray(selectionOrOpts)) body = { selection: selectionOrOpts };
    else if (selectionOrOpts && typeof selectionOrOpts === 'object') body = { ...selectionOrOpts };
    if (maybeOpts && typeof maybeOpts === 'object') body = { ...body, ...maybeOpts };
    return downloadStream(`/api/campaigns/${id}/export/pdf`, { method: 'POST', body, filenameHint: 'export.pdf' });
  },
  exportDocxSelected: (id, selectionOrOpts = {}, maybeOpts = undefined) => {
    let body = {};
    if (Array.isArray(selectionOrOpts)) body = { selection: selectionOrOpts };
    else if (selectionOrOpts && typeof selectionOrOpts === 'object') body = { ...selectionOrOpts };
    if (maybeOpts && typeof maybeOpts === 'object') body = { ...body, ...maybeOpts };
    return downloadStream(`/api/campaigns/${id}/export/docx`, { method: 'POST', body, filenameHint: 'export.docx' });
  },

  // Provide explicit “with options” names so WarRoom can call them directly
  exportPdfWithOptions: (id, opts = {}) => downloadStream(`/api/campaigns/${id}/export/pdf`, { method: 'POST', body: opts, filenameHint: 'export.pdf' }),
  exportDocxWithOptions: (id, opts = {}) => downloadStream(`/api/campaigns/${id}/export/docx`, { method: 'POST', body: opts, filenameHint: 'export.docx' }),
};

/* -----------------------------
 * Dev helper
 * ----------------------------- */
export function setDevEmail(email) {
  localStorage.setItem('devEmail', email);
}
