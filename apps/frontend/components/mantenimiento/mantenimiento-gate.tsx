'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { EVENTO_MANTENIMIENTO } from '@/lib/api/client';
import { LOGIN_PATH } from '@/lib/api/session';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageTitle } from '@/components/ui/page-title';
import { MENSAJE_MANTENIMIENTO, getMantenimiento } from '@/lib/services/admin-sistema';

export function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(
    new Date(iso),
  );
}

export function PantallaMantenimiento({
  mensaje,
  regresoEstimado,
  onReintentar,
  reintentando = false,
}: {
  mensaje?: string;
  regresoEstimado?: string | null;
  onReintentar: () => void;
  reintentando?: boolean;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-section">
      <Empty tone="muted" role="status" className="w-full max-w-xl">
        <EmptyMedia variant="icon">
          <Wrench aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <PageTitle className="text-balance">
            Plataforma en mantenimiento
          </PageTitle>
          <EmptyDescription>{mensaje || MENSAJE_MANTENIMIENTO}</EmptyDescription>
          {regresoEstimado && (
            <EmptyDescription>
              Regreso estimado: <time dateTime={regresoEstimado}>{formatearFechaHora(regresoEstimado)}</time> (hora de Guatemala)
            </EmptyDescription>
          )}
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={onReintentar} disabled={reintentando}>
            {reintentando ? 'Comprobando…' : 'Reintentar'}
          </Button>
          <Button asChild variant="outline">
            <Link href={LOGIN_PATH}>Acceso de administradores</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

/**
 * Cambia la app por la pantalla de mantenimiento cuando la API responde 503 `MANTENIMIENTO`
 * (evento de `apiFetch`) o, en las páginas públicas, cuando `GET /mantenimiento` indica
 * `bloqueando`. Dentro del dashboard solo manda el 503: el administrador no lo recibe.
 * El login nunca se tapa para que el administrador pueda entrar.
 */
export function MantenimientoGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const queryClient = useQueryClient();
  const [bloqueado, setBloqueado] = useState(false);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['mantenimiento'],
    queryFn: getMantenimiento,
    retry: false,
    staleTime: 10_000,
  });

  useEffect(() => {
    const alBloquear = () => {
      setBloqueado(true);
      void refetch();
    };
    window.addEventListener(EVENTO_MANTENIMIENTO, alBloquear);
    return () => window.removeEventListener(EVENTO_MANTENIMIENTO, alBloquear);
  }, [refetch]);

  const reintentar = async () => {
    const { data: actual } = await refetch();
    if (actual && !actual.bloqueando) {
      setBloqueado(false);
      void queryClient.invalidateQueries();
    }
  };

  const enLogin = pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
  const enDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const mostrar = !enLogin && (bloqueado || (!enDashboard && data?.bloqueando === true));

  if (!mostrar) return <>{children}</>;
  return (
    <PantallaMantenimiento
      mensaje={data?.mensaje}
      regresoEstimado={data?.regresoEstimado}
      onReintentar={() => void reintentar()}
      reintentando={isFetching}
    />
  );
}
