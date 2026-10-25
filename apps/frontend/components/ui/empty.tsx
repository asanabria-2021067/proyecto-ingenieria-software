import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const emptyVariants = cva(
  'relative isolate flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-2xl border px-6 py-10 text-center text-balance shadow-sm md:px-10 md:py-12',
  {
    variants: {
      tone: {
        default:
          'border-outline-variant/70 bg-surface-container-lowest text-on-surface',
        // «Sin registros»: la misma tarjeta blanca de borde sutil que `default` (referencia:
        // Chats archivados). Antes era una superficie tintada con borde punteado.
        muted:
          'border-outline-variant/70 bg-surface-container-lowest text-on-surface',
        danger:
          'border-error/25 bg-error-container/20 text-on-surface',
        // Dentro de una tarjeta: el vacío va directo sobre ella, sin otra
        // superficie (ni borde, ni fondo, ni sombra propios).
        flush:
          'rounded-none border-0 bg-transparent px-0 py-8 text-on-surface shadow-none md:px-0 md:py-10',
      },
      size: {
        default: '',
        // Banda horizontal (~80–100 px): ícono a la izquierda, texto al centro y acción a la
        // derecha. En pantallas angostas la acción baja bajo el texto. Reacomoda las piezas
        // por su `data-slot`, así que se usan las mismas EmptyMedia/EmptyHeader/EmptyContent.
        compact:
          'flex-row flex-wrap items-center justify-start gap-x-4 gap-y-3 px-5 py-4 text-left md:px-6 md:py-4 [&>[data-slot=empty-icon]]:mb-0 [&>[data-slot=empty-header]]:max-w-none [&>[data-slot=empty-header]]:min-w-48 [&>[data-slot=empty-header]]:flex-1 [&>[data-slot=empty-header]]:items-start [&>[data-slot=empty-header]]:gap-1 [&>[data-slot=empty-header]]:text-left [&>[data-slot=empty-content]]:w-auto [&>[data-slot=empty-content]]:max-w-none',
      },
    },
    defaultVariants: {
      tone: 'default',
      size: 'default',
    },
  },
)

function Empty({
  className,
  tone = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<'section'> & VariantProps<typeof emptyVariants>) {
  return (
    <section
      data-slot="empty"
      className={cn(emptyVariants({ tone, size, className }))}
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
        // Icono neutro, sin verde ni anillo (referencia: Chats archivados): acompaña sin decorar.
        icon: "flex size-12 shrink-0 items-center justify-center rounded-control bg-surface-container text-text-secondary [animation:none] [&_svg:not([class*='size-'])]:size-6",
        compact:
          "flex size-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface-container text-primary [&_svg:not([class*='size-'])]:size-6",
        // Icono pequeño y neutro, sin anillo ni animación: acompaña sin decorar.
        subtle:
          "flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-container text-text-secondary [animation:none] [&_svg:not([class*='size-'])]:size-5",
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
