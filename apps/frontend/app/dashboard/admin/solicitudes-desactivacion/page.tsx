'use client';

import { PageTitle } from '@/components/ui/page-title';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, UserX, X } from 'lucide-react';
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
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import uvgSwal from '@/lib/swal';
import { adminPendientesQueryKey } from '@/lib/query-keys/admin-accounts';
import {
  listSolicitudesDesactivacion,
  resolverSolicitudDesactivacion,
  type AdminSolicitudDesactivacion,
} from '@/lib/services/admin';

const solicitudesQueryKey = ['admin', 'solicitudes-desactivacion'] as const;

interface AccionPendiente {
  tipo: 'aprobar' | 'rechazar';
  solicitud: AdminSolicitudDesactivacion;
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

/** MEJ-85: solicitudes de estudiantes que piden desactivar su cuenta. Aprobar la deja inactiva; las horas y el historial se conservan. */
export default function AdminSolicitudesDesactivacionPage() {
  const queryClient = useQueryClient();
  const [accion, setAccion] = useState<AccionPendiente | null>(null);
  const [comentario, setComentario] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: solicitudesQueryKey,
    queryFn: listSolicitudesDesactivacion,
    refetchInterval: 30 * 1000,
  });

  const resolver = useMutation({
    mutationFn: ({ tipo, solicitud }: AccionPendiente) =>
      resolverSolicitudDesactivacion(solicitud.idSolicitud, tipo, comentario.trim()),
    onSuccess: (_resultado, { tipo, solicitud }) => {
      const nombre = `${solicitud.usuario.nombre} ${solicitud.usuario.apellido}`;
      uvgSwal.fire({
        icon: 'success',
        title: tipo === 'aprobar' ? 'Cuenta desactivada' : 'Solicitud rechazada',
        text:
          tipo === 'aprobar'
            ? `La cuenta de ${nombre} quedó inactiva. Sus horas y su historial se conservan.`
            : `Se rechazó la solicitud de ${nombre}.`,
        timer: 2500,
        showConfirmButton: false,
      });
    },
    onError: (error: Error) => {
      if (getApiErrorStatus(error) === 409) {
        uvgSwal.fire({ icon: 'info', title: 'Solicitud ya atendida', text: 'Otro administrador ya la resolvió. La lista se actualizó.' });
        return;
      }
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(error, 'admin', 'No se pudo resolver la solicitud.'),
      });
    },
    onSettled: () => {
      setAccion(null);
      setComentario('');
      queryClient.invalidateQueries({ queryKey: solicitudesQueryKey });
      queryClient.invalidateQueries({ queryKey: adminPendientesQueryKey });
    },
  });

  const abrir = (siguiente: AccionPendiente) => {
    setComentario('');
    setAccion(siguiente);
  };
  const solicitudes = data ?? [];
  const nombreAccion = accion ? `${accion.solicitud.usuario.nombre} ${accion.solicitud.usuario.apellido}` : '';

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Usuarios" pagina="Desactivación de cuentas" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Desactivación de cuentas</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Estudiantes que piden desactivar su cuenta. Al aprobar, la cuenta queda inactiva y se cierran sus sesiones; las
          horas acreditadas y el historial de sus proyectos se conservan.
        </p>
      </section>

      <div className="flex flex-col gap-stack">
        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar las solicitudes.</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isLoading ? (
          <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando solicitudes de desactivación">
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
                </div>
              ))}
            </div>
          </SkeletonRegion>
        ) : solicitudes.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <UserX aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay solicitudes pendientes.</EmptyTitle>
              <EmptyDescription>Cuando un estudiante pida desactivar su cuenta, aparecerá aquí.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Solicitudes pendientes: <span className="font-semibold tabular-nums text-text-primary">{solicitudes.length}</span>
            </p>
            <div className={DATA_TABLE_CARD}>
              <Table containerLabel="Solicitudes de desactivación">
                <caption className="sr-only">Solicitudes de desactivación de cuenta pendientes</caption>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>Usuario</TableHead>
                    <TableHead scope="col" className={TH}>Motivo</TableHead>
                    <TableHead scope="col" className={TH}>Solicitada</TableHead>
                    <TableHead scope="col" className={TH}>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solicitudes.map((s) => {
                    const nombre = `${s.usuario.nombre} ${s.usuario.apellido}`;
                    return (
                      <TableRow key={s.idSolicitud} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                        <TableCell className={`${TD} min-w-0`}>
                          <p className="type-body break-words font-semibold text-text-primary">{nombre}</p>
                          <p className="type-meta break-all">{s.usuario.correo}</p>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body break-words text-text-secondary">{s.motivo || 'Sin motivo'}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <span className="type-body text-text-secondary">{formatFecha(s.creadaEn)}</span>
                        </TableCell>
                        <TableCell className={TD}>
                          <div className="flex flex-wrap items-center gap-tight">
                            <Button
                              type="button"
                              size="sm"
                              disabled={resolver.isPending}
                              aria-label={`Aprobar la desactivación de ${nombre}`}
                              className="rounded-control"
                              onClick={() => abrir({ tipo: 'aprobar', solicitud: s })}
                            >
                              <Check aria-hidden="true" />
                              Aprobar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={resolver.isPending}
                              aria-label={`Rechazar la desactivación de ${nombre}`}
                              className="rounded-control"
                              onClick={() => abrir({ tipo: 'rechazar', solicitud: s })}
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
          title={accion.tipo === 'aprobar' ? 'Aprobar desactivación' : 'Rechazar solicitud'}
          description={
            accion.tipo === 'aprobar'
              ? `¿Desactivar la cuenta de ${nombreAccion}? Quedará inactiva y no podrá iniciar sesión. Sus horas acreditadas y el historial de sus proyectos se conservan.`
              : `¿Rechazar la solicitud de ${nombreAccion}? Su cuenta seguirá activa.`
          }
          actionLabel={accion.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
          variant={accion.tipo === 'aprobar' ? 'destructive' : 'default'}
          isPending={resolver.isPending}
          onConfirm={() => resolver.mutate(accion)}
          onCancel={() => setAccion(null)}
        >
          <div className="flex flex-col gap-tight">
            <Label htmlFor="desactivacion-comentario">Comentario (opcional)</Label>
            <Textarea
              id="desactivacion-comentario"
              value={comentario}
              maxLength={500}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>
        </ConfirmActionDialog>
      )}
    </div>
  );
}
