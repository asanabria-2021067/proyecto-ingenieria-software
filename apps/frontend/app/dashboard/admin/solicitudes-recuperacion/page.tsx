'use client';

import { useRef, useState } from 'react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Copy, KeyRound, Link2 } from 'lucide-react';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
import {
  listPasswordResetRequests,
  generatePasswordResetLink,
  type AdminSolicitudRecuperacion,
} from '@/lib/services/admin';

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

/**
 * Vigencia real del token (Sección HU-14: bug de producción — antes se
 * mostraba un texto fijo "Válido por 1 hora" sin relación con el `expiraEn`
 * que ya devolvía el backend). Si el token ya expiró se avisa explícitamente
 * en vez de mostrar una hora pasada sin contexto.
 */
function formatVigencia(expiraEn: string): string {
  const expiraEnMs = new Date(expiraEn).getTime();
  if (Number.isNaN(expiraEnMs)) return 'Vigencia desconocida';
  if (expiraEnMs <= Date.now()) return 'Este enlace ya expiró';
  const hora = new Intl.DateTimeFormat('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(expiraEnMs));
  return `Válido hasta las ${hora}`;
}

interface GeneratedLink {
  idSolicitud: number;
  usuario: AdminSolicitudRecuperacion['usuario'];
  resetUrl: string;
  expiraEn: string;
}

// Misma tabla que las bandejas de Proyectos y Gestión de Usuarios (`data-table`).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-middle';
// Columnas que solo caben desde cierto ancho de la tarjeta; antes van como metadata bajo el nombre.
const COL_CORREO = '@3xl/bandeja:table-cell';
const META_CORREO = '@3xl/bandeja:hidden';
const COL_CARNE = '@xl/bandeja:table-cell';
const META_CARNE = '@xl/bandeja:hidden';
const COL_FECHA = '@2xl/bandeja:table-cell';
const META_FECHA = '@2xl/bandeja:hidden';

function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando solicitudes de recuperación">
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
            <Skeleton className="hidden h-4 w-32 @2xl/bandeja:block" />
            <Skeleton className="h-8 w-28 rounded-tag" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Fallback manual (Sección HU-14: bug de producción — en contexto no seguro,
 * ej. HTTP sin TLS, `navigator.clipboard` ni siquiera existe, así que el
 * `try/catch` original solo mostraba un error genérico sin copiar nada).
 * `document.execCommand('copy')` sigue funcionando en esos contextos porque
 * no depende de la Clipboard API async.
 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let successful = false;
  try {
    successful = document.execCommand('copy');
  } catch {
    successful = false;
  }
  document.body.removeChild(textarea);
  return successful;
}

/**
 * Copia con confirmación visible. Si la Clipboard API no está disponible o
 * falla (contexto no seguro), intenta `execCommand('copy')`; si eso también
 * falla, selecciona el texto del input visible para que el admin lo copie
 * manualmente con Ctrl+C, en vez de dejarlo sin ninguna vía de copiar.
 */
async function copyToClipboard(text: string, inputEl?: HTMLInputElement | null) {
  const clipboardApiDisponible =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function';

  if (clipboardApiDisponible) {
    try {
      await navigator.clipboard.writeText(text);
      uvgSwal.fire({
        icon: 'success',
        title: 'Enlace copiado',
        timer: 1500,
        showConfirmButton: false,
      });
      return;
    } catch {
      // Contexto no seguro o permiso denegado: cae al fallback manual.
    }
  }

  if (copyWithExecCommand(text)) {
    uvgSwal.fire({
      icon: 'success',
      title: 'Enlace copiado',
      timer: 1500,
      showConfirmButton: false,
    });
    return;
  }

  inputEl?.focus();
  inputEl?.select();
  uvgSwal.fire({
    icon: 'warning',
    title: 'Copia manual requerida',
    text: 'El texto quedó seleccionado: presiona Ctrl+C (o Cmd+C) para copiarlo.',
  });
}

export default function AdminSolicitudesRecuperacionPage() {
  const queryClient = useQueryClient();
  const [generated, setGenerated] = useState<GeneratedLink[]>([]);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminPasswordResetRequests'],
    queryFn: listPasswordResetRequests,
  });

  const generateMutation = useMutation({
    mutationFn: (idSolicitud: number) => generatePasswordResetLink(idSolicitud),
    onSuccess: (result, idSolicitud) => {
      const solicitud = data?.find((s) => s.idSolicitud === idSolicitud);
      if (solicitud) {
        setGenerated((prev) => [
          { idSolicitud, usuario: solicitud.usuario, resetUrl: result.resetUrl, expiraEn: result.expiraEn },
          ...prev,
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ['adminPasswordResetRequests'] });
    },
    onError: (error: Error) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(error, 'admin', 'No se pudo generar el enlace de recuperación.'),
      });
    },
  });

  const pendientes = (data ?? []).filter(
    (s) => !generated.some((g) => g.idSolicitud === s.idSolicitud),
  );

  return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
        <AdminBreadcrumb seccion="Administración" pagina="Recuperación de contraseña" />
        {/* Header */}
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="type-display text-balance">
              Recuperación de contraseña
            </h1>
            <p className="mt-2 max-w-2xl text-base text-tertiary">
              Solicitudes de recuperación pendientes. Genera un enlace y envíalo manualmente
              al correo institucional del usuario.
            </p>
          </div>
        </section>

        <div className="@container/bandeja flex flex-col gap-stack">
          {!isLoading && !isError && (
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Total de solicitudes pendientes:{' '}
              <span className="font-semibold tabular-nums text-text-primary">{pendientes.length}</span>
            </p>
          )}

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
            <TablaSkeleton />
          ) : pendientes.length === 0 ? (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <KeyRound aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No hay solicitudes pendientes.</EmptyTitle>
                <EmptyDescription>Cuando un usuario pida recuperar su contraseña, aparecerá aquí.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className={DATA_TABLE_CARD}>
              <Table>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>
                      Usuario
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_CARNE}`}>
                      Carné
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_CORREO}`}>
                      Correo de referencia
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_FECHA}`}>
                      Solicitada
                    </TableHead>
                    <TableHead scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.map((s) => (
                    <TableRow key={s.idSolicitud} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                      <TableCell className={`${TD} min-w-0`}>
                        <p className="type-body break-words font-semibold text-text-primary">
                          {s.usuario.nombre} {s.usuario.apellido}
                        </p>
                        <p className={`type-meta break-all ${META_CORREO}`}>{s.correoReferencia}</p>
                        <p className={`type-meta ${META_CARNE}`}>Carné {s.carneReferencia}</p>
                        <p className={`type-meta ${META_FECHA}`}>{formatFecha(s.creadaEn)}</p>
                      </TableCell>
                      <TableCell className={`${TD} hidden ${COL_CARNE}`}>
                        <span className="type-body tabular-nums text-text-secondary">{s.carneReferencia}</span>
                      </TableCell>
                      <TableCell className={`${TD} hidden ${COL_CORREO}`}>
                        <span className="type-body break-all text-text-secondary">{s.correoReferencia}</span>
                      </TableCell>
                      <TableCell className={`${TD} hidden ${COL_FECHA}`}>
                        <span className="type-body text-text-secondary">{formatFecha(s.creadaEn)}</span>
                      </TableCell>
                      <TableCell className={`${TD} text-right`}>
                        <button
                          type="button"
                          onClick={() => generateMutation.mutate(s.idSolicitud)}
                          disabled={generateMutation.isPending}
                          aria-label={`Generar enlace para ${s.usuario.nombre} ${s.usuario.apellido}`}
                          className="ml-auto flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-tag bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-all hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {/* En tarjetas estrechas queda solo el icono: el nombre accesible ya lo dice. */}
                          <span className="hidden @xl/bandeja:inline">Generar enlace</span>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Generated links (this session) */}
        {generated.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 font-headline text-lg font-bold text-on-surface">
              Enlaces generados
            </h2>
            <div className="space-y-3">
              {generated.map((g) => (
                <div
                  key={g.idSolicitud}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
                >
                  <p className="mb-2 text-sm font-medium text-on-surface">
                    {g.usuario.nombre} {g.usuario.apellido}{' '}
                    <span className="text-tertiary">({g.usuario.correo})</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={g.resetUrl}
                      ref={(el) => {
                        inputRefs.current[g.idSolicitud] = el;
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(g.resetUrl, inputRefs.current[g.idSolicitud])}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-tertiary">
                    {formatVigencia(g.expiraEn)}. Envíalo manualmente al correo institucional del usuario.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}
