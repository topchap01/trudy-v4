import { forwardRef } from 'react'
import { cn } from './ui/cn'

/**
 * Unified Button component.
 * Variants: solid (sky-600), outline, ghost, danger
 * Supports loading spinner + disabled state + aria-busy.
 */
const Button = forwardRef(function Button(
  {
    children,
    onClick,
    loading = false,
    disabled = false,
    variant = 'solid',
    size = 'md',
    type = 'button',
    className = '',
    'aria-label': ariaLabel,
    ...rest
  },
  ref
) {
  const isDisabled = loading || disabled

  const variants = {
    solid: 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 focus:ring-sky-500',
    outline: 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 focus:ring-gray-400',
    ghost: 'bg-transparent text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-400',
    danger: 'bg-red-600 text-white border-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 focus:ring-red-500',
  }

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-3 py-2 text-sm gap-2',
    lg: 'h-10 px-5 text-sm gap-2',
  }

  return (
    <button
      ref={ref}
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-lg border font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant] || variants.solid,
        sizes[size] || sizes.md,
        className
      )}
      {...rest}
    >
      {loading && (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
})

export default Button
