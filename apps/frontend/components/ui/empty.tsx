import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const emptyVariants = cva(
  'relative isolate flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-2xl border px-6 py-10 text-center text-balance shadow-sm md:px-10 md:py-12',
  {
    variants: {
      tone: {
        default:
          'border-outline-variant/70 bg-surface-container-lowest text-on-surface',
        muted:
          'border-dashed border-outline-variant bg-surface-container-low text-on-surface',
        danger:
          'border-error/25 bg-error-container/20 text-on-surface',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
)

function Empty({
  className,
  tone = 'default',
  ...props
}: React.ComponentProps<'section'> & VariantProps<typeof emptyVariants>) {
  return (
    <section
      data-slot="empty"
      className={cn(emptyVariants({ tone, className }))}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        'flex max-w-sm flex-col items-center gap-2 text-center',
        className,
      )}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  'empty-state-visual relative mb-1 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "flex size-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm ring-8 ring-primary/5 [&_svg:not([class*='size-'])]:size-7",
        compact:
          "flex size-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface-container text-primary [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function EmptyMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-title"
      className={cn('font-headline text-xl font-extrabold tracking-tight text-on-surface', className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        'text-tertiary [&>a:hover]:text-primary max-w-md text-sm/relaxed [&>a]:font-semibold [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        'flex w-full max-w-sm min-w-0 flex-col items-center gap-3 text-sm text-balance sm:flex-row sm:justify-center',
        className,
      )}
      {...props}
    />
  )
}

function EmptySteps({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="empty-steps"
      className={cn('mt-1 flex items-center gap-1.5 text-primary/70', className)}
      {...props}
    >
      <span className="h-1.5 w-8 rounded-full bg-current" />
      <span className="h-1.5 w-3 rounded-full bg-current opacity-60" />
      <span className="h-1.5 w-5 rounded-full bg-current opacity-30" />
    </div>
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
  EmptySteps,
}
