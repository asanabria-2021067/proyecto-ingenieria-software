import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'type-body relative grid w-full grid-cols-[0_1fr] items-start gap-y-micro rounded-control border px-stack py-inline has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-inline [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        success: 'border-transparent bg-status-success text-on-status-success',
        warning: 'border-transparent bg-status-warning text-on-status-warning',
        destructive: 'border-transparent bg-status-error text-on-status-error',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'type-subtitle col-start-2 line-clamp-1 min-h-4',
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'type-body col-start-2 grid justify-items-start gap-micro text-current opacity-90',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
