'use client';

import { reintentarSiNoEsTerminal } from '@/lib/api/query-retry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { ConfirmacionHost } from '@/components/mensajes/confirmacion-host';

/** Aparte para poder leer `useTheme()` (necesita estar DENTRO de ThemeProvider). */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
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
        {children}
        <ConfirmacionHost />
        <AppToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}