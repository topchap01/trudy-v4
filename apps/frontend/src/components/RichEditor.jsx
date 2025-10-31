import { useState } from 'react'
import { Textarea } from './ui/textarea'
import { Button } from '../components/ui/button'

export default function RichEditor({ initial = '', onSave, onImprove }) {
  const [text, setText] = useState(initial)
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-2 text-sm font-semibold">Narrative Editor</div>
      <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex gap-2 justify-end">
        <Button variant="outline" onClick={() => onImprove?.(text)}>AI Improve</Button>
        <Button onClick={() => onSave?.(text)}>Save</Button>
      </div>
    </div>
  )
}
