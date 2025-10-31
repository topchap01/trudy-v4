import { forwardRef } from 'react'
import { cn } from './cn'

export const Textarea = forwardRef(function Textarea(props, ref) {
  const { className, ...rest } = props
  return (
    <textarea
      ref={ref}
      className={cn('w-full rounded-xl border border-gray-300 bg-white p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-black', className)}
      {...rest}
    />
  )
})
