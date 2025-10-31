import { Card, CardContent, CardFooter, CardHeader } from './ui/card'
import { cn } from './ui/cn'

function riskBg(r) {
  if (r === 'SAFE') return 'bg-[#e8f7f0]'
  if (r === 'BALANCED') return 'bg-[#fff7e6]'
  if (r === 'BOLD') return 'bg-[#fde8e8]'
  return 'bg-white'
}

export default function AgentCard({ m }) {
  return (
    <Card className={cn('transition', m.pending && 'opacity-60')}>
      <CardHeader className={cn('flex items-center justify-between', riskBg(m.riskLevel))}>
        <div className="font-semibold">{m.agent}</div>
        <div className="text-xs text-gray-600">{m.role}</div>
      </CardHeader>
      <CardContent>
        <div className="whitespace-pre-wrap text-sm">{m.text}</div>
      </CardContent>
      <CardFooter className="text-xs text-gray-500">
        {m.pending ? 'pending…' : m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
      </CardFooter>
    </Card>
  )
}
