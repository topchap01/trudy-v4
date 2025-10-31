function diffLines(a, b) {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const max = Math.max(aLines.length, bLines.length)
  const rows = []
  for (let i = 0; i < max; i++) {
    const L = aLines[i] ?? ''
    const R = bLines[i] ?? ''
    rows.push({ left: L, right: R, change: L===R ? 'same' : (!L && R ? 'add' : (L && !R ? 'del' : 'add')) })
  }
  return rows
}

export default function DiffViewer({ before, after }) {
  const rows = diffLines(before, after)
  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="grid grid-cols-2 text-xs font-semibold bg-gray-50 border-b">
        <div className="px-3 py-2">Before</div>
        <div className="px-3 py-2 border-l">After</div>
      </div>
      <div className="grid grid-cols-2 text-sm">
        {rows.map((r, idx) => (
          <div key={idx} className="contents">
            <div className={`px-3 py-1 whitespace-pre-wrap ${r.change==='del'?'bg-red-50':''}`}>{r.left}</div>
            <div className={`px-3 py-1 border-l whitespace-pre-wrap ${r.change==='add'?'bg-green-50':''}`}>{r.right}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
