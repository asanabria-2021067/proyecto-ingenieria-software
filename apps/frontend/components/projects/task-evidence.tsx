'use client';

import { useState } from 'react';
import { ExternalLink, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso, confirmar } from '@/lib/mensajes';
import { useTaskEvidence } from '@/hooks/use-task-extras';

/** Solo https, como el servidor; evita enviar texto que no es un enlace. */
export function esEnlaceHttpsValido(valor: string): boolean {
  try {
    return new URL(valor).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(new Date(iso));
}

interface Props {
  idProyecto: number;
  idTarea: number;
  idUsuarioActual: number | null;
  esLider: boolean;
  /** Líder o asignado activo pueden subir evidencia. */
  puedeSubir: boolean;
}

/** MEJ-49: evidencias de la tarea (enlaces de entrega: repositorio, documento, captura). */
export function TaskEvidence({ idProyecto, idTarea, idUsuarioActual, esLider, puedeSubir }: Props) {
  const { evidencias, isLoading, isError, refetch, subir, eliminar } = useTaskEvidence(idProyecto, idTarea);
  const [url, setUrl] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  const enviar = (event: React.FormEvent) => {
    event.preventDefault();
    const limpia = url.trim();
    if (!esEnlaceHttpsValido(limpia)) {
      setErrorUrl('Escribe un enlace válido que empiece con https://');
      return;
    }
    setErrorUrl(null);
    subir.mutate(
      { tipoEvidencia: 'ENLACE', urlRecurso: limpia, ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}) },
      {
        onSuccess: () => {
          setUrl('');
          setDescripcion('');
          aviso.exito('Evidencia agregada');
        },
        onError: (err) => aviso.error('No se pudo agregar la evidencia', getApiErrorMessage(err, 'task')),
      },
    );
  };

  const quitar = async (idEvidencia: number) => {
    const ok = await confirmar({
      titulo: '¿Quitar esta evidencia?',
      descripcion: 'Dejará de mostrarse en la tarea.',
      textoAccion: 'Quitar evidencia',
      destructiva: true,
    });
    if (!ok) return;
    eliminar.mutate(idEvidencia, {
      onError: (err) => aviso.error('No se pudo quitar la evidencia', getApiErrorMessage(err, 'task')),
    });
  };

  return (
    <section
      className="rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="evidencias-titulo"
    >
      <h2 id="evidencias-titulo" className="type-section mb-3 flex items-center gap-2">
        <Paperclip className="size-4 text-tertiary" aria-hidden="true" />
        Evidencias{evidencias.length > 0 ? ` (${evidencias.length})` : ''}
      </h2>

      {isLoading ? (
        <SkeletonRegion label="Cargando evidencias" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </SkeletonRegion>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          No se pudieron cargar las evidencias.
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : evidencias.length === 0 ? (
        <p className="text-sm italic text-tertiary">
          {puedeSubir
            ? 'Aún no hay evidencias. Agrega un enlace a tu entrega (repositorio, documento o captura).'
            : 'Esta tarea todavía no tiene evidencias.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {evidencias.map((ev) => (
            <li
              key={ev.idEvidencia}
              className="flex items-start gap-2 rounded-md border border-outline-variant/30 bg-surface-container-low p-2.5"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={ev.urlRecurso}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  <span className="truncate">{ev.descripcion || ev.urlRecurso}</span>
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
                <p className="text-xs text-tertiary">
                  {ev.cargador.nombre} {ev.cargador.apellido} · {formatearFecha(ev.fechaEnvio)}
                </p>
              </div>
              {(esLider || ev.idUsuarioCargador === idUsuarioActual) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={eliminar.isPending}
                  onClick={() => void quitar(ev.idEvidencia)}
                  aria-label="Quitar evidencia"
                  className="text-tertiary hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeSubir && (
        <form onSubmit={enviar} noValidate className="mt-3 space-y-2">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            aria-label="Enlace de la evidencia"
            aria-invalid={errorUrl ? true : undefined}
            maxLength={255}
            className="h-9"
          />
          {errorUrl && (
            <p role="alert" className="text-xs text-destructive">
              {errorUrl}
            </p>
          )}
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción (opcional)"
            aria-label="Descripción de la evidencia"
            maxLength={1000}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={subir.isPending || url.trim() === ''}>
            Agregar evidencia
          </Button>
        </form>
      )}
    </section>
  );
}
