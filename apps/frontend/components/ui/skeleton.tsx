import type { ReactNode } from 'react'

import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_ROWS,
} from '@/components/dashboard/data-table'
import { cn } from '@/lib/utils'

/**
 * Bloque base: decorativo, nunca se anuncia. La pulsación se detiene con
 * `prefers-reduced-motion` (regla global de global.css y `motion-safe`).
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-muted motion-safe:animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

/**
 * Contenedor de una carga: un solo anuncio «Cargando …» para todo el
 * esqueleto, con `aria-busy` mientras dura.
 */
function SkeletonRegion({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { label: string }) {
  return (
    <div
      data-slot="skeleton-region"
      role="status"
      aria-busy="true"
      aria-label={label}
      className={className}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/**
 * Las variantes se anuncian solas cuando reciben `label`; sin él son
 * decorativas y deben ir dentro de un `SkeletonRegion` de la vista.
 */
function SkeletonRoot({
  label,
  className,
  children,
}: {
  label?: string
  className?: string
  children: ReactNode
}) {
  if (label) {
    return (
      <SkeletonRegion label={label} className={className}>
        {children}
      </SkeletonRegion>
    )
  }
  return (
    <div data-slot="skeleton-group" aria-hidden="true" className={className}>
      {children}
    </div>
  )
}

const LINE_WIDTHS = ['w-2/5', 'w-full', 'w-3/5'] as const

function SkeletonLines({ lines }: { lines: number }) {
  return (
    <div className="min-w-0 flex-1 space-y-tight">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(i === 0 ? 'h-4' : 'h-3.5', LINE_WIDTHS[i % LINE_WIDTHS.length])}
        />
      ))}
    </div>
  )
}

interface SkeletonListProps {
  label?: string
  className?: string
  count?: number
  /** Líneas de texto por elemento (título + detalle). */
  lines?: number
  avatar?: 'circle' | 'square'
  /** Etiquetas o acciones al final de cada fila. */
  trailing?: number
  /**
   * `cards`: una tarjeta por elemento. `rows`: filas divididas en una sola
   * tarjeta. `plain`: filas sueltas dentro de un panel que ya es superficie.
   */
  layout?: 'cards' | 'rows' | 'plain'
}

function SkeletonList({
  label,
  className,
  count = 3,
  lines = 2,
  avatar,
  trailing = 0,
  layout = 'cards',
}: SkeletonListProps) {
  const items = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      data-slot="skeleton-list-item"
      className={cn(
        'flex items-center gap-stack',
        layout === 'cards' && 'card-base',
        layout === 'rows' && 'px-card py-inline',
      )}
    >
      {avatar && (
        <Skeleton
          className={cn(
            'shrink-0',
            avatar === 'circle' ? 'size-10 rounded-full' : 'size-11 rounded-control',
          )}
        />
      )}
      <SkeletonLines lines={lines} />
      {Array.from({ length: trailing }, (_, j) => (
        <Skeleton key={j} className="h-6 w-20 shrink-0 rounded-pill" />
      ))}
    </div>
  ))

  return (
    <SkeletonRoot
      label={label}
      className={cn(
        layout === 'rows' ? cn(DATA_TABLE_CARD, DATA_TABLE_ROWS) : 'flex flex-col gap-stack',
        className,
      )}
    >
      {items}
    </SkeletonRoot>
  )
}

interface SkeletonCardProps {
  label?: string
  /** Rejilla que contiene las tarjetas; por defecto la de tres columnas. */
  className?: string
  count?: number
  lines?: number
  /** Bloque de gráfica o imagen; `mediaClassName` fija su alto. */
  media?: boolean
  mediaClassName?: string
  /** Pie con acción, separado por un borde como en las tarjetas reales. */
  footer?: boolean
}

function SkeletonCard({
  label,
  className,
  count = 3,
  lines = 2,
  media = false,
  mediaClassName,
  footer = false,
}: SkeletonCardProps) {
  return (
    <SkeletonRoot
      label={label}
      className={cn('grid grid-cols-1 gap-grid md:grid-cols-2 lg:grid-cols-3', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-slot="skeleton-card" className="card-base flex flex-col gap-stack">
          <Skeleton className="h-5 w-3/5" />
          {lines > 0 && <SkeletonLines lines={lines} />}
          {media && <Skeleton className={cn('h-48 w-full rounded-control', mediaClassName)} />}
          {footer && (
            <div className="mt-auto flex items-center justify-between gap-inline border-t border-outline-variant/40 pt-stack">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 w-28 rounded-control" />
            </div>
          )}
        </div>
      ))}
    </SkeletonRoot>
  )
}

interface SkeletonTableProps {
  label?: string
  className?: string
  rows?: number
  columns?: number
}

function SkeletonTable({ label, className, rows = 5, columns = 4 }: SkeletonTableProps) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  return (
    <SkeletonRoot label={label} className={cn(DATA_TABLE_CARD, className)}>
      <div
        data-slot="skeleton-table-head"
        className={cn(DATA_TABLE_HEAD_ROW, 'grid gap-stack px-card py-inline')}
        style={gridStyle}
      >
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className="h-3.5 w-20" />
        ))}
      </div>
      <div className={DATA_TABLE_ROWS}>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            data-slot="skeleton-table-row"
            className="grid items-center gap-stack px-card py-stack"
            style={gridStyle}
          >
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-4/5' : 'w-1/2')} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonRoot>
  )
}

interface SkeletonDetailProps {
  label?: string
  className?: string
  /** Bloques de contenido bajo la cabecera. */
  sections?: number
  /** Bloques de la columna lateral; 0 la omite. */
  aside?: number
}

function SkeletonDetail({ label, className, sections = 2, aside = 0 }: SkeletonDetailProps) {
  return (
    <SkeletonRoot
      label={label}
      className={cn(
        'grid grid-cols-1 gap-grid',
        aside > 0 && 'lg:grid-cols-[minmax(0,1fr)_360px]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-section">
        <div data-slot="skeleton-detail-header" className="card-base flex flex-col gap-stack">
          <div className="flex gap-tight">
            <Skeleton className="h-6 w-20 rounded-tag" />
            <Skeleton className="h-6 w-20 rounded-tag" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        {Array.from({ length: sections }, (_, i) => (
          <div key={i} data-slot="skeleton-detail-section" className="card-base flex flex-col gap-stack">
            <Skeleton className="h-5 w-40" />
            <SkeletonLines lines={3} />
          </div>
        ))}
      </div>
      {aside > 0 && (
        <div className="flex flex-col gap-section">
          {Array.from({ length: aside }, (_, i) => (
            <div key={i} data-slot="skeleton-detail-aside" className="card-base flex flex-col gap-stack">
              <Skeleton className="h-5 w-32" />
              <SkeletonLines lines={2} />
            </div>
          ))}
        </div>
      )}
    </SkeletonRoot>
  )
}

export { Skeleton, SkeletonCard, SkeletonDetail, SkeletonList, SkeletonRegion, SkeletonTable }
