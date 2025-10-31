import { cn } from './cn'
export function Badge({ className, ...props }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', className)} {...props} />
}
