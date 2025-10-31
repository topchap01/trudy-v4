import { forwardRef } from 'react'
import { cn } from './cn'

export const Input = forwardRef(function Input(props, ref) {
  const { className, ...rest } = props
  return (
    <input
      ref={ref}
      className={cn('h-9 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black', className)}
      {...rest}
    />
  )
})
