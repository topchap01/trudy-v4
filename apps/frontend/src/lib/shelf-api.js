// apps/frontend/src/lib/shelf-api.js
// API helpers for Trudy Shelf mode

import { toast } from '../components/ui/toaster.jsx'

function authHeaders() {
  const devEmail = localStorage.getItem('devEmail') || import.meta.env?.VITE_DEV_EMAIL
  const h = { 'Content-Type': 'application/json' }
  if (devEmail) h['x-user-email'] = devEmail
  return h
}

/** Extract a readable error message from API response JSON */
function extractErrorMessage(json, statusText) {
  if (!json?.error) return json?.message || statusText
  if (typeof json.error === 'string') return json.error
  // Zod validation errors: { formErrors: [], fieldErrors: { field: [msgs] } }
  if (json.error.fieldErrors) {
    const fields = Object.entries(json.error.fieldErrors)
    if (fields.length) return fields.map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
  }
  if (json.error.formErrors?.length) return json.error.formErrors.join('; ')
  // Structured error with message (e.g., Claude API errors)
  if (typeof json.error.message === 'string') return json.error.message
  return JSON.stringify(json.error)
}

async function shelfApi(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    const msg = extractErrorMessage(json, `${res.status} ${res.statusText}`)
    toast.error(String(msg))
    throw new Error(String(msg))
  }
  return json ?? {}
}

/** Mode 1 — generate routes from a brief */
export async function generateRoutes(brief) {
  return shelfApi('/api/shelf/generate', brief)
}

/** Mode 2 — evaluate an existing idea */
export async function evaluateIdea(idea) {
  return shelfApi('/api/shelf/evaluate', idea)
}

/** Stress-test a selected route */
export async function stressTestRoute(route, context) {
  return shelfApi('/api/shelf/stress-test', { route, ...context })
}

/** Export a route to Trevor format */
export async function exportToTrevor(route) {
  return shelfApi('/api/shelf/export-trevor', { route })
}

/** Fetch latest outputs for a campaign (GET) */
export async function getShelfOutputs(campaignId) {
  const res = await fetch(`/api/campaigns/${campaignId}/outputs/latest`, {
    headers: authHeaders(),
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    const msg = extractErrorMessage(json, `${res.status} ${res.statusText}`)
    toast.error(String(msg))
    throw new Error(String(msg))
  }
  return json ?? {}
}
