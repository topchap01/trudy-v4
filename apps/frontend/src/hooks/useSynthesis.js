import { useEffect, useRef, useState } from 'react'

export function useSynthesis(debugSSE = false) {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const controllerRef = useRef(null)

  const start = (payload = {}) => {
    if (running) return
    setText('')
    setRunning(true)

    if (debugSSE) {
      const es = new EventSource('/api/synthesis?debug=1')
      es.onmessage = (evt) => setText((t) => t + evt.data)
      es.onerror = () => { es.close(); setRunning(false) }
      controllerRef.current = null
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller
    fetch('/api/synthesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error('SSE stream failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        chunk.split('\n').forEach((line) => {
          if (line.startsWith('data:')) setText((t) => t + line.slice(5).trimStart())
        })
      }
    })
    .catch(() => {})
    .finally(() => setRunning(false))
  }

  const cancel = () => {
    controllerRef.current?.abort?.()
    setRunning(false)
  }

  return { text, running, start, cancel }
}
