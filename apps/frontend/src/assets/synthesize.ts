export type SseEvent =
  | { event: 'open'; data: { streamId: string } }
  | { event: 'start'; data: { streamId: string } }
  | { event: 'token'; data: { index: number; delta: string } }
  | { event: 'done'; data: { streamId: string; bytes: number } }
  | { event: 'error'; data: { streamId?: string; message: string } };

export async function* synthesize(
  plan: unknown,
  opts: { baseUrl?: string; email?: string; signal?: AbortSignal } = {},
): AsyncGenerator<SseEvent, void, unknown> {
  const base = opts.baseUrl ?? ''; // proxy mode → ''
  const res = await fetch(`${base}/api/synthesis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.email ? { 'x-user-email': opts.email } : {}),
    },
    body: JSON.stringify({ narrativePlan: plan }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SSE request failed: ${res.status} ${res.statusText} ${body}`);
  }
  if (!res.body) throw new Error('SSE response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });

    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';

    for (const frame of frames) {
      const ev = frame.match(/^event:\s*(.+)$/m)?.[1];
      const data = frame.match(/^data:\s*(.+)$/m)?.[1];
      if (!ev || !data) continue;
      yield { event: ev, data: JSON.parse(data) } as SseEvent;
    }
  }
}
