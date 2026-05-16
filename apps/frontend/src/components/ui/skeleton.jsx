import { cn } from './cn'

/**
 * Loading skeleton placeholder.
 * Usage: <Skeleton className="h-4 w-48" /> or <Skeleton lines={3} />
 */
export function Skeleton({ className, lines }) {
  if (lines) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse',
              i === lines - 1 ? 'w-3/4' : 'w-full'
            )}
          />
        ))}
        <span className="sr-only">Loading...</span>
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse', className)}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

/** Card-shaped skeleton for dashboard grid */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-white dark:bg-gray-900 p-4 shadow-sm space-y-3" role="status" aria-label="Loading campaign">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-4 w-28" />
      <span className="sr-only">Loading...</span>
    </div>
  )
}
