'use client';

import { reintentarSiNoEsTerminal } from '@/lib/api/query-retry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { MantenimientoGate } from '@/components/mantenimiento/mantenimiento-gate';
import { ConfirmacionHost } from '@/components/mensajes/confirmacion-host';

/** Aparte para poder leer `useTheme()` (necesita estar DENTRO de ThemeProvider). */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      closeButton
      visibleToasts={3}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      // Cabecera del dashboard = 4rem (h-16): la pila nace 8px debajo; el chat (abajo a la derecha) queda libre.
      offset={{ top: 72, right: 24, bottom: 32, left: 24 }}
      mobileOffset={{ top: 72, right: 16, bottom: 16, left: 16 }}
      style={
        {
          '--normal-bg': 'var(--color-card)',
          '--normal-text': 'var(--color-text-primary)',
          '--normal-border': 'var(--color-outline-variant)',
          '--border-radius': 'var(--radius-control)',
          '--width': '24rem',
        } as React.CSSProperties
      }
      toastOptions={{
        style: { fontFamily: 'var(--font-family-body)' },
        classNames: {
          // Pila colapsada: los avisos de atrás conservan la tarjeta (borde y acento) pero ocultan su contenido, como los toasts normales.
          toast: '[&[data-styled=true]]:shadow-raised [&[data-expanded=false][data-front=false]_[data-slot=notificacion-toast]>*]:opacity-0',
          title: 'font-semibold',
          description: '!text-text-secondary',
          actionButton: '!bg-action !text-on-action !rounded-md',
          cancelButton: '!bg-surface-container !text-text-primary !rounded-md',
          closeButton: '!bg-card !text-text-secondary !border-outline-variant',
          success: '[&_[data-icon]]:text-tag-success !border-l-4 !border-l-tag-success',
          error: '[&_[data-icon]]:text-on-tag-red !border-l-4 !border-l-on-tag-red',
          info: '[&_[data-icon]]:text-on-tag-blue !border-l-4 !border-l-on-tag-blue',
          warning: '[&_[data-icon]]:text-on-tag-amber !border-l-4 !border-l-on-tag-amber',
          loading: '[&_[data-icon]]:text-text-secondary !border-l-4 !border-l-on-tag-slate',
        },
      }}
    />
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // GPI01-C05 (H-03): un 401/403/404 no cambia por repetirlo. Reintentarlo
          // cuatro veces alargaba el skeleton antes de mostrar el estado terminal.
          queries: { staleTime: 60 * 1000, retry: reintentarSiNoEsTerminal },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MantenimientoGate>{children}</MantenimientoGate>
        <ConfirmacionHost />
        <AppToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}