'use client';

import { useState } from 'react';
import { EyeOff, Megaphone, Plus } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { NIVEL_ANUNCIO } from '@/components/anuncios/anuncio-banner';
import { ESTADO_ANUNCIO_LABEL, estadoAnuncio, type EstadoAnuncio } from '@/components/anuncios/anuncio-form';
import { AnuncioFormDialog } from '@/components/anuncios/anuncio-form-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SkeletonList } from '@/components/ui/skeleton';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useAnunciosEntidad, useAnunciosEntidadMutations } from '@/hooks/use-anuncios';
import { aviso } from '@/lib/mensajes';
import type { AnuncioEntidad, AnuncioInput, TipoEntidadAnuncio } from '@/lib/services/anuncios';

const NIVEL_TONE: Record<AnuncioEntidad['nivel'], TagTone> = { INFO: 'blue', ADVERTENCIA: 'amber', URGENTE: 'red' };
const ESTADO_TONE: Record<EstadoAnuncio, TagTone> = { VIGENTE: 'success', PROGRAMADO: 'slate', VENCIDO: 'neutral', DESPUBLICADO: 'neutral' };
const fecha = (iso: string) => new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

const AUDIENCIA: Record<TipoEntidadAnuncio, string> = {
  organizaciones: 'Lo ven los miembros de la organización como banner en su dashboard.',
  asociaciones: 'Lo ven los estudiantes de las carreras de la asociación como banner en su dashboard.',
};

/** MEJ-66: anuncios de una organización o asociación; reutiliza el formulario y los niveles del banner de administración. */
export function AnunciosEntidad({
  tipo,
  id,
  puedePublicar,
}: {
  tipo: TipoEntidadAnuncio;
  id: number;
  puedePublicar: boolean;
}) {
  const { data, isLoading, isError, refetch } = useAnunciosEntidad(tipo, id);
  const { crear, despublicar } = useAnunciosEntidadMutations(tipo, id);
  const [creando, setCreando] = useState(false);
  const [porDespublicar, setPorDespublicar] = useState<AnuncioEntidad | null>(null);

  // La audiencia la define la entidad: el backend rechaza el campo.
  const guardar = (i: AnuncioInput) =>
    crear.mutate(
      { titulo: i.titulo, mensaje: i.mensaje, nivel: i.nivel, fechaInicio: i.fechaInicio, fechaFin: i.fechaFin },
      {
        onSuccess: () => {
          aviso.exito('Anuncio publicado');
          setCreando(false);
        },
        onError: () => aviso.error('No se pudo publicar el anuncio', 'Revisa los datos e intenta de nuevo.'),
      },
    );

  const nuevo = puedePublicar && (
    <Button type="button" onClick={() => setCreando(true)}>
      <Plus aria-hidden="true" />
      Nuevo anuncio
    </Button>
  );

  return (
    <section className="card-base space-y-stack" aria-labelledby={`anuncios-${tipo}-titulo`}>
      <div className="flex flex-wrap items-start justify-between gap-stack">
        <div>
          <h2 id={`anuncios-${tipo}-titulo`} className="type-subtitle">Anuncios</h2>
          <p className="type-meta">{AUDIENCIA[tipo]}</p>
        </div>
        {nuevo}
      </div>

      {isLoading ? (
        <SkeletonList label="Cargando anuncios" count={2} lines={2} layout="rows" />
      ) : isError ? (
        <Empty tone="danger" role="alert">
          <EmptyHeader>
            <EmptyTitle>No se pudieron cargar los anuncios.</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : !data || data.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Megaphone aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Todavía no hay anuncios.</EmptyTitle>
            <EmptyDescription>
              {puedePublicar ? 'Publica el primero para avisar al grupo.' : 'Cuando se publique uno, lo verás aquí y en tu dashboard.'}
            </EmptyDescription>
          </EmptyHeader>
          {puedePublicar && <EmptyContent>{nuevo}</EmptyContent>}
        </Empty>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {data.map((a) => {
            const estado = estadoAnuncio(a);
            return (
              <li key={a.idAnuncio} className="flex flex-wrap items-start gap-stack py-stack first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="type-body font-semibold">{a.titulo}</p>
                  <p className="type-body break-words text-text-secondary">{a.mensaje}</p>
                  <p className="type-meta tabular-nums">
                    {fecha(a.fechaInicio)} a {fecha(a.fechaFin)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-tight">
                  <Tag tone={NIVEL_TONE[a.nivel]} size="sm">{NIVEL_ANUNCIO[a.nivel].etiqueta}</Tag>
                  <Tag tone={ESTADO_TONE[estado]} size="sm">{ESTADO_ANUNCIO_LABEL[estado]}</Tag>
                  {puedePublicar && a.activo && (
                    <Button type="button" variant="outline" size="sm" aria-label={`Despublicar ${a.titulo}`} onClick={() => setPorDespublicar(a)}>
                      <EyeOff aria-hidden="true" /> Despublicar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creando && <AnuncioFormDialog conAudiencia={false} isPending={crear.isPending} onSubmit={guardar} onClose={() => setCreando(false)} />}

      <ConfirmActionDialog
        open={!!porDespublicar}
        title="Despublicar anuncio"
        description={`«${porDespublicar?.titulo ?? ''}» dejará de mostrarse. El anuncio no se borra.`}
        actionLabel="Despublicar"
        variant="warning"
        isPending={despublicar.isPending}
        onCancel={() => setPorDespublicar(null)}
        onConfirm={() =>
          porDespublicar &&
          despublicar.mutate(porDespublicar.idAnuncio, {
            onSuccess: () => {
              aviso.exito('Anuncio despublicado');
              setPorDespublicar(null);
            },
            onError: () => aviso.error('No se pudo despublicar el anuncio'),
          })
        }
      />
    </section>
  );
}
