import { cn } from './cn'

export function Tabs({ value, onValueChange, children, className }) {
  return <div className={cn('w-full', className)} data-value={value}>{children}</div>
}
export function TabsList({ className, children }) {
  return <div className={cn('mb-2 flex gap-2', className)}>{children}</div>
}
export function TabsTrigger({ value, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-xl border px-3 py-1 text-sm', active ? 'bg-black text-white' : 'hover:bg-gray-100')}
      data-value={value}
    >
      {children}
    </button>
  )
}
export function TabsContent({ value, active, children }) {
  if (!active) return null
  return <div className="mt-2">{children}</div>
}
