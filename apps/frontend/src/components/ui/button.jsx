import { forwardRef } from 'react'
import { cn } from './cn'

export const Button = forwardRef(function Button(
  { className, variant = 'default', size = 'md', ...props }, ref
) {
  const v = {
    default: 'bg-black text-white hover:bg-gray-800',
    ghost: 'bg-transparent hover:bg-gray-100',
    outline: 'border border-gray-300 hover:bg-gray-50',
  }[variant]
  const s = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-4',
    lg: 'h-10 px-5 text-base',
  }[size]
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50 disabled:pointer-events-none',
        v, s, className
      )}
      {...props}
    />
  )
})
