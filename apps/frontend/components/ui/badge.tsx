import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
 * Primitivo de shadcn adaptado al sistema de etiquetas de UVGenius: misma
 * forma que `.pill` en tamaño `sm` (radio `tag`, 20 px, 11 px semibold) y las
 * variantes sobre los tokens `tag-*` / `on-tag-*` de app/global.css. Las
 * instancias que ya pasan sus propias clases (`bg-primary/10 text-primary`,
 * `text-[10px]`…) las conservan: las utilidades siguen ganando.
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-tag border h-5 px-2 text-[11px] font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-tag-success text-on-tag-success [a&]:hover:bg-tag-success/90',
        secondary: 'border-transparent bg-tag-sage text-on-tag-sage [a&]:hover:bg-tag-sage/90',
        destructive:
          'border-transparent bg-tag-red text-on-tag-red [a&]:hover:bg-tag-red/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline: 'border-outline-variant text-foreground [a&]:hover:bg-muted [a&]:hover:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
