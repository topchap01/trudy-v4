import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

const AGENTS = ['BRUCE','CLARA','MILES','JAX','NINA','IVY','THEO','QUENTIN','OMAR']

export default function AskForPanel({ onSubmit, loading }) {
  const [target, setTarget] = useState('BRUCE')
  const [kind, setKind] = useState('QUESTION')
  const [prompt, setPrompt] = useState('')

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-2 text-sm font-semibold">Ask For</div>
      <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="flex gap-2 overflow-x-auto">
          {AGENTS.map(a => (
            <button key={a}
              className={`rounded-xl border px-3 py-1 text-xs ${target===a?'bg-black text-white':'hover:bg-gray-100'}`}
              onClick={() => setTarget(a)}
            >{a}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {['QUESTION','REWRITE','CRITIQUE'].map(k => (
            <button key={k}
              className={`rounded-xl border px-3 py-1 text-xs ${kind===k?'bg-black text-white':'hover:bg-gray-100'}`}
              onClick={() => setKind(k)}
            >{k}</button>
          ))}
        </div>
        <Input placeholder="Optional short title…" />
      </div>
      <Textarea
        rows={4}
        placeholder="What do you want from the agent?"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <Button
          onClick={async () => {
            if (!prompt.trim()) return
            await onSubmit({ target, kind, prompt })
            setPrompt('')
          }}
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
