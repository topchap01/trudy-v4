import { cn } from './cn'

/**
 * Accessible Tabs with proper ARIA roles.
 */
export function Tabs({ value, onValueChange, children, className }) {
  return <div className={cn('w-full', className)} data-value={value}>{children}</div>
}

export function TabsList({ className, children, 'aria-label': ariaLabel = 'Tabs' }) {
  return (
    <div
      className={cn('mb-2 flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({ value, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500',
        active
          ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
      )}
      data-value={value}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, active, children }) {
  if (!active) return null
  return (
    <div role="tabpanel" className="mt-2" tabIndex={0}>
      {children}
    </div>
  )
}
