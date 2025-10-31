// apps/frontend/src/lib/askOutputs.js
console.info('[Trudy][askOutputs] loaded', new Date().toISOString());

function devHeaders() {
  const devEmail =
    localStorage.getItem('devEmail') ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DEV_EMAIL : null);
  return devEmail ? { 'x-user-email': devEmail } : {};
}

/**
 * POST /api/ask/outputs
 */
export async function askOutputs({ campaignId, type, params, prompt }) {
  const res = await fetch('/api/ask/outputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...devHeaders() },
    body: JSON.stringify({ campaignId, type, params, prompt }),
  })
  if (!res.ok) {
    let j
    try {
      j = await res.json()
    } catch {}
    throw new Error(j?.error?.message || j?.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.output
}
