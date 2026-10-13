'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, UserCheck, X } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCuentasPendientes } from '@/hooks/use-cuentas-pendientes';
import { adminCuentasPendientesQueryKey } from '@/lib/query-keys/admin-accounts';
import {
  aprobarCuentaPendiente,
  rechazarCuentaPendiente,
  type AdminCuentaPendiente,
} from '@/lib/services/admin';

type TipoAccion = 'aprobar' | 'rechazar';

interface AccionPendiente {
  tipo: TipoAccion;
  cuenta: AdminCuentaPendiente;
}

// Misma tabla que las demás bandejas administrativas (`data-table`).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-middle';

function formatFecha(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return 'Sin fecha';
  }
}

function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando cuentas pendientes">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-24 rounded-control" />
            <Skeleton className="h-8 w-24 rounded-control" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCuentasPendientesPage() {
  const queryClient = useQueryClient();
  const [accion, setAccion] = useState<AccionPendiente | null>(null);

  const { data, isLoading, isError, refetch } = useCuentasPendientes();

  const resolverMutation = useMutation({
    mutationFn: ({ tipo, cuenta }: AccionPendiente) =>
      tipo === 'aprobar'
        ? aprobarCuentaPendiente(cuenta.idUsuario)
        : rechazarCuentaPendiente(cuenta.idUsuario),
    onSuccess: (_result, { tipo, cuenta }) => {
      uvgSwal.fire({
        icon: 'success',
        title: tipo === 'aprobar' ? 'Cuenta aprobada' : 'Cuenta rechazada',
        text:
          tipo === 'aprobar'
            ? `${cuenta.nombre} ${cuenta.apellido} ya puede usar la plataforma.`
            : `La cuenta de ${cuenta.nombre} ${cuenta.apellido} fue rechazada.`,
        timer: 2000,
        showConfirmButton: false,
      });
    },
    onError: (error: Error, { tipo }) => {
      if ((error as Error & { statusCode?: number }).statusCode === 409) {
        uvgSwal.fire({
          icon: 'info',
          title: 'Cuenta ya atendida',
          text: 'Esta cuenta ya fue atendida. La lista se actualizó.',
        });
        return;
      }
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(
          error,
          'admin',
          tipo === 'aprobar' ? 'No se pudo aprobar la cuenta.' : 'No se pudo rechazar la cuenta.',
        ),
      });
    },
    onSettled: () => {
      setAccion(null);
      queryClient.invalidateQueries({ queryKey: adminCuentasPendientesQueryKey });
    },
  });

  const cuentas = data?.cuentas ?? [];
  const procesando = resolverMutation.isPending;

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Verificación y seguridad" pagina="Cuentas pendientes" />
      {/* Sin botón «Actualizar» propio: el de la barra superior del shell vuelve a pedir esta consulta. */}
      <section className="mb-8">
        <h1 className={ADMIN_PAGE_TITLE}>Cuentas pendientes</h1>
        <p className={ADMIN_PAGE_LEAD}>
          Cuentas nuevas que esperan verificación. Aprueba las que correspondan a la comunidad
          UVG y rechaza las que no.
        </p>
      </section>

      <div className="flex flex-col gap-stack">
        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar las cuentas pendientes.</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isLoading ? (
          <TablaSkeleton />
        ) : cuentas.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <UserCheck aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay cuentas pendientes de verificación</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Cuentas pendientes: <span className="font-semibold tabular-nums text-text-primary">{cuentas.length}</span>
            </p>
            <div className={DATA_TABLE_CARD}>
              <Table>
                <caption className="sr-only">Cuentas que esperan verificación</caption>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>Nombre completo</TableHead>
                    <TableHead scope="col" className={TH}>Correo</TableHead>
                    <TableHead scope="col" className={TH}>Carné</TableHead>
                    <TableHead scope="col" className={TH}>Carrera</TableHead>
                    <TableHead scope="col" className={TH}>Fecha de registro</TableHead>
                    <TableHead scope="col" className={TH}>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentas.map((cuenta) => {
                    const nombreCompleto = `${cuenta.nombre} ${cuenta.apellido}`;
                    return (
                      <TableRow key={cuenta.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                        <TableCell className={TD}>
                          <span className="type-body break-words font-semibold text-text-primary">{nombreCompleto}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body break-all text-text-secondary">{cuenta.correo}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body tabular-nums text-text-secondary">{cuenta.carne ?? 'Sin carné'}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body break-words text-text-secondary">
                            {cuenta.carrera?.nombreCarrera ?? 'Sin carrera'}
                          </span>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body text-text-secondary">{formatFecha(cuenta.fechaRegistro)}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <div className="flex items-center gap-tight">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setAccion({ tipo: 'aprobar', cuenta })}
                              disabled={procesando}
                              aria-label={`Aprobar la cuenta de ${nombreCompleto}`}
                              className="rounded-control"
                            >
                              <Check aria-hidden="true" />
                              Aprobar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setAccion({ tipo: 'rechazar', cuenta })}
                              disabled={procesando}
                              aria-label={`Rechazar la cuenta de ${nombreCompleto}`}
                              className="rounded-control"
                            >
                              <X aria-hidden="true" />
                              Rechazar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {accion && (
        <ConfirmActionDialog
          open
          title={accion.tipo === 'aprobar' ? 'Aprobar cuenta' : 'Rechazar cuenta'}
          description={
            accion.tipo === 'aprobar'
              ? `¿Aprobar la cuenta de ${accion.cuenta.nombre} ${accion.cuenta.apellido}? Podrá iniciar sesión y usar la plataforma.`
              : `¿Rechazar la cuenta de ${accion.cuenta.nombre} ${accion.cuenta.apellido}? Quedará inactiva y no podrá iniciar sesión.`
          }
          actionLabel={accion.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
          variant={accion.tipo === 'aprobar' ? 'default' : 'destructive'}
          isPending={procesando}
          onConfirm={() => resolverMutation.mutate(accion)}
          onCancel={() => setAccion(null)}
        />
      )}
    </div>
  );
}
