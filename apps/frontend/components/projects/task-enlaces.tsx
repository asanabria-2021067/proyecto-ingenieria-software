'use client';

import { useState } from 'react';
import { Figma, Github, HardDrive, Link2, Trash2 } from 'lucide-react';
import { LinkPreviewView } from '@/components/chat-dock/link-preview-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { esEnlaceHttpsValido } from '@/components/projects/task-evidence';
import { useTaskLinks } from '@/hooks/use-task-extras';
import { aviso, confirmar } from '@/lib/mensajes';
import type { TipoEnlaceTarea } from '@/lib/types/tasks';

const ICONO_TIPO: Record<TipoEnlaceTarea, typeof Link2> = {
  DRIVE: HardDrive,
  FIGMA: Figma,
  GITHUB: Github,
  GENERICO: Link2,
};

interface Props {
  idProyecto: number;
  idTarea: number;
  /** Líder o responsables de la tarea (el servidor lo vuelve a validar). */
  puedeEditar: boolean;
}

/** MEJ-107: enlaces https de la tarea con vista previa (título, sitio e icono según el tipo). */
export function TaskEnlaces({ idProyecto, idTarea, puedeEditar }: Props) {
  const { enlaces, isLoading, isError, refetch, agregar, quitar } = useTaskLinks(idProyecto, idTarea);
  const [url, setUrl] = useState('');
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  const enviar = (event: React.FormEvent) => {
    event.preventDefault();
    const limpia = url.trim();
    if (!esEnlaceHttpsValido(limpia)) {
      setErrorUrl('Escribe un enlace válido que empiece con https://');
      return;
    }
    setErrorUrl(null);
    agregar.mutate(limpia, {
      onSuccess: () => {
        setUrl('');
        aviso.exito('Enlace agregado');
      },
      onError: (err) => aviso.error('No se pudo agregar el enlace', getApiErrorMessage(err, 'task')),
    });
  };

  const quitarEnlace = async (idEnlace: number) => {
    const ok = await confirmar({
      titulo: '¿Quitar este enlace?',
      descripcion: 'Dejará de mostrarse en la tarea.',
      textoAccion: 'Quitar enlace',
      destructiva: true,
    });
    if (!ok) return;
    quitar.mutate(idEnlace, {
      onError: (err) => aviso.error('No se pudo quitar el enlace', getApiErrorMessage(err, 'task')),
    });
  };

  return (
    <section
      className="rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="enlaces-titulo"
    >
      <h2 id="enlaces-titulo" className="type-section mb-3 flex items-center gap-2">
        <Link2 className="size-4 text-tertiary" aria-hidden="true" />
        Enlaces{enlaces.length > 0 ? ` (${enlaces.length})` : ''}
      </h2>

      {isLoading ? (
        <SkeletonRegion label="Cargando enlaces" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </SkeletonRegion>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          No se pudieron cargar los enlaces.
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : enlaces.length === 0 ? (
        <p className="text-sm italic text-tertiary">
          {puedeEditar
            ? 'Aún no hay enlaces. Agrega uno a un documento, diseño o repositorio.'
            : 'Esta tarea todavía no tiene enlaces.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {enlaces.map((enlace) => {
            const Icono = ICONO_TIPO[enlace.tipo] ?? Link2;
            return (
              <li key={enlace.idEnlace} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <LinkPreviewView
                    url={enlace.url}
                    sitio={enlace.sitio}
                    titulo={enlace.titulo}
                    icono={<Icono className="size-4" aria-hidden="true" />}
                  />
                </div>
                {puedeEditar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={quitar.isPending}
                    onClick={() => void quitarEnlace(enlace.idEnlace)}
                    aria-label={`Quitar el enlace ${enlace.titulo ?? enlace.url}`}
                    className="mt-2 text-tertiary hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {puedeEditar && (
        <form onSubmit={enviar} noValidate className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              aria-label="Enlace de la tarea"
              aria-invalid={errorUrl ? true : undefined}
              maxLength={2048}
              className="h-9 flex-1"
            />
            <Button type="submit" size="sm" disabled={agregar.isPending || url.trim() === ''} className="h-9">
              Agregar enlace
            </Button>
          </div>
          {errorUrl && (
            <p role="alert" className="text-xs text-destructive">
              {errorUrl}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
