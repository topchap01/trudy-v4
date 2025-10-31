import { cn } from './ui/cn'
const PHASES = ['FRAMING', 'CREATE', 'EVALUATE', 'SYNTHESIS', 'EXPORT']

export default function PhaseTimeline({ current, mode }) {
  // Display FRAMING -> (CREATE|EVALUATE) -> SYNTHESIS -> EXPORT
  const items = ['FRAMING', mode === 'CREATE' ? 'CREATE' : 'EVALUATE', 'SYNTHESIS', 'EXPORT']
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((label, i) => {
        const active = label === current
        return (
          <div key={i} className="flex items-center">
            <div className={cn('rounded-full px-3 py-1 border', active ? 'bg-black text-white' : 'bg-white')}>
              {label}
            </div>
            {i < items.length - 1 && <div className="mx-2 h-px w-10 bg-gray-300" />}
          </div>
        )
      })}
    </div>
  )
}
