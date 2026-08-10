'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, AlertCircle, Copy, Link2 } from 'lucide-react';
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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i} className="border-outline-variant/40">
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-40 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-24 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-44 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-32 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-8 w-28 rounded-lg bg-surface-container-high" />
          </TableCell>
        </TableRow>
      ))}
    </>
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
        text: error.message || 'No se pudo generar el enlace de recuperación.',
      });
    },
  });

  const pendientes = (data ?? []).filter(
    (s) => !generated.some((g) => g.idSolicitud === s.idSolicitud),
  );

  return (
      <div className="px-4 pb-12 pt-8 md:px-8">
        {/* Header */}
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">
              Administración
            </span>
            <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
              Recuperación de contraseña
            </h1>
            <p className="mt-2 max-w-2xl text-base text-tertiary">
              Solicitudes de recuperación pendientes. Genera un enlace y envíalo manualmente
              al correo institucional del usuario.
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

        {/* Table card */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Usuario
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Carné
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Correo de referencia
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Solicitada
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <SkeletonRows />}

              {isError && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-6 w-6 text-error" />
                      <p className="text-sm font-medium text-on-surface">
                        No se pudieron cargar las solicitudes.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && pendientes.length === 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="px-4 py-10 text-center">
                    <p className="text-sm text-tertiary">No hay solicitudes pendientes.</p>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !isError &&
                pendientes.map((s) => (
                  <TableRow
                    key={s.idSolicitud}
                    className="border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                  >
                    <TableCell className="px-4 py-3">
                      <span className="text-sm font-medium text-on-surface">
                        {s.usuario.nombre} {s.usuario.apellido}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm text-tertiary">{s.carneReferencia}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm text-tertiary">{s.correoReferencia}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm text-tertiary">{formatFecha(s.creadaEn)}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <button
                        onClick={() => generateMutation.mutate(s.idSolicitud)}
                        disabled={generateMutation.isPending}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-all hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Generar enlace
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
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
