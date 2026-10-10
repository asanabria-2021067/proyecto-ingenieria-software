'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
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

const HEAD_CLASS = 'px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary';

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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i} className="border-outline-variant/40">
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-40 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-44 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-24 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-36 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-32 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-8 w-40 rounded-lg bg-surface-container-high" />
          </TableCell>
        </TableRow>
      ))}
    </>
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
    <div className="px-4 pb-12 pt-8 md:px-8">
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">
            Administración
          </span>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Cuentas pendientes
          </h1>
          <p className="mt-2 max-w-2xl text-base text-tertiary">
            Cuentas nuevas que esperan verificación. Aprueba las que correspondan a la comunidad
            UVG y rechaza las que no.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary self-start"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </section>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                <TableHead className={HEAD_CLASS}>Nombre completo</TableHead>
                <TableHead className={HEAD_CLASS}>Correo</TableHead>
                <TableHead className={HEAD_CLASS}>Carné</TableHead>
                <TableHead className={HEAD_CLASS}>Carrera</TableHead>
                <TableHead className={HEAD_CLASS}>Fecha de registro</TableHead>
                <TableHead className={HEAD_CLASS}>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <SkeletonRows />}

              {isError && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-6 w-6 text-error" />
                      <p className="text-sm font-medium text-on-surface">
                        No se pudieron cargar las cuentas pendientes.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && cuentas.length === 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm text-tertiary">
                      No hay cuentas pendientes de verificación
                    </p>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !isError &&
                cuentas.map((cuenta) => {
                  const nombreCompleto = `${cuenta.nombre} ${cuenta.apellido}`;
                  return (
                    <TableRow
                      key={cuenta.idUsuario}
                      className="border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                    >
                      <TableCell className="px-4 py-3">
                        <span className="text-sm font-medium text-on-surface">{nombreCompleto}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">{cuenta.correo}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">{cuenta.carne ?? 'Sin carné'}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">
                          {cuenta.carrera?.nombreCarrera ?? 'Sin carrera'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">
                          {formatFecha(cuenta.fechaRegistro)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAccion({ tipo: 'aprobar', cuenta })}
                            disabled={procesando}
                            aria-label={`Aprobar la cuenta de ${nombreCompleto}`}
                            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-all hover:bg-primary/90 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Aprobar
                          </button>
                          <button
                            onClick={() => setAccion({ tipo: 'rechazar', cuenta })}
                            disabled={procesando}
                            aria-label={`Rechazar la cuenta de ${nombreCompleto}`}
                            className="flex items-center gap-1.5 rounded-xl bg-error px-3 py-1.5 text-xs font-bold text-on-error transition-all hover:bg-error/90 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            Rechazar
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
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
