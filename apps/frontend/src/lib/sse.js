// apps/frontend/src/lib/sse.js
/**
 * Start a synthesis SSE stream.
 * - Accumulates text tokens.
 * - Finalizes when it sees `[DONE]` or a JSON object with a `text` field.
 * - On finalize, snapshots to POST /api/campaigns/:id/phaseRuns with { phase:'SYNTHESIS', text, meta }.
 */
export function startSynthesisStream({ campaignId, prompt = '', debug = false, onToken, onDone, onError }) {
  const qs = new URLSearchParams();
  if (campaignId) qs.set('campaignId', campaignId);
  if (prompt) qs.set('prompt', prompt);
  if (debug) qs.set('debug', '1');

  const url = `/api/synthesis?${qs.toString()}`;
  const es = new EventSource(url);

  let acc = '';
  const startedAt = Date.now();

  function safeClose() {
    try { es.close(); } catch {}
  }

  async function snapshotAndFinish(finalObj) {
    const durationMs = Date.now() - startedAt;
    const text = typeof finalObj?.text === 'string' && finalObj.text.length ? finalObj.text : acc;
    const meta = {
      model: finalObj?.model,
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      tokenCount: text?.length ?? acc.length ?? 0,
    };

    // Snapshot (best-effort; do not throw if it fails)
    if (campaignId && text) {
      try {
        await fetch(`/api/campaigns/${campaignId}/phaseRuns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'SYNTHESIS', text, meta }),
        });
      } catch {
        // ignore snapshot errors; UI will still refresh via query invalidation
      }
    }

    onDone?.({ text, meta, raw: finalObj || null });
  }

  es.onmessage = (ev) => {
    const payload = ev.data || '';

    // Server may send the sentinel
    if (payload === '[DONE]') {
      safeClose();
      snapshotAndFinish(null);
      return;
    }

    // Try JSON parse — end-of-stream may be a JSON envelope with { text }
    if (payload.startsWith('{') || payload.startsWith('[')) {
      try {
        const j = JSON.parse(payload);
        if (j && typeof j === 'object' && (typeof j.text === 'string' || j.final === true)) {
          if (typeof j.text === 'string' && !acc) {
            // If server sent the full text as a single JSON, prefer it
            acc = j.text;
          }
          safeClose();
          snapshotAndFinish(j);
          return;
        }
      } catch {
        // fall through to treat as a token
      }
    }

    // Treat as token chunk (plain text)
    acc += payload;
    onToken?.(payload);
  };

  es.onerror = (e) => {
    onError?.(e);
    safeClose();
  };

  // Return a disposer to callers
  return () => safeClose();
}
