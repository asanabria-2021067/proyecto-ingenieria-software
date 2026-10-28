'use client';

import { useState } from 'react';
import { Megaphone, Pencil, Plus, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { AnuncioFormDialog } from '@/components/anuncios/anuncio-form-dialog';
import { ESTADO_ANUNCIO_LABEL, estadoAnuncio, type EstadoAnuncio } from '@/components/anuncios/anuncio-form';
import { NIVEL_ANUNCIO } from '@/components/anuncios/anuncio-banner';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useRequireCan } from '@/hooks/use-can';
import { useAdminAnuncios, useAnunciosAdminMutations } from '@/hooks/use-anuncios';
import type { AnuncioAdmin, AnuncioInput } from '@/lib/services/anuncios';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
const NIVEL_TONE: Record<AnuncioAdmin['nivel'], TagTone> = { INFO: 'blue', ADVERTENCIA: 'amber', URGENTE: 'red' };
const ESTADO_TONE: Record<EstadoAnuncio, TagTone> = { VIGENTE: 'success', PROGRAMADO: 'slate', VENCIDO: 'neutral', DESPUBLICADO: 'neutral' };
const AUDIENCIA_LABEL = { TODOS: 'Todos', ESTUDIANTES: 'Solo estudiantes' } as const;
const fecha = (iso: string) => new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

/** T-352: administración de anuncios (crear, editar y despublicar). */
export default function AdminAnunciosPage() {
  const { permitido } = useRequireCan('admin.panel');
  const { data, isLoading, isError, refetch } = useAdminAnuncios(permitido);
  const { crear, editar, despublicar } = useAnunciosAdminMutations();
  // `null` = cerrado; `{}` = creando; `{ anuncio }` = editando.
  const [formulario, setFormulario] = useState<{ anuncio?: AnuncioAdmin } | null>(null);
  const [porDespublicar, setPorDespublicar] = useState<AnuncioAdmin | null>(null);

  if (!permitido) return null;

  const guardar = (input: AnuncioInput) => {
    const anuncio = formulario?.anuncio;
    const opciones = {
      onSuccess: () => {
        toast.success(anuncio ? 'Anuncio actualizado.' : 'Anuncio creado.');
        setFormulario(null);
      },
      onError: (e: Error) => toast.error(e.message || 'No se pudo guardar el anuncio.'),
    };
    if (anuncio) editar.mutate({ id: anuncio.idAnuncio, input }, opciones);
    else crear.mutate(input, opciones);
  };

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Comunicación" pagina="Anuncios" />
      <section className="mb-8 flex flex-wrap items-end justify-between gap-stack">
        <div>
          <h1 className={ADMIN_PAGE_TITLE}>Anuncios</h1>
          <p className={ADMIN_PAGE_LEAD}>
            Avisos que aparecen como banner en el dashboard. Cada persona puede cerrarlos y no vuelven a mostrársele.
          </p>
        </div>
        <Button type="button" onClick={() => setFormulario({})} className="text-xs font-bold">
          <Plus className="size-4" aria-hidden="true" /> Nuevo anuncio
        </Button>
      </section>

      {isLoading ? (
        <SkeletonRegion className="space-y-tight" label="Cargando anuncios">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </SkeletonRegion>
      ) : isError ? (
        <Empty tone="danger" role="alert">
          <EmptyHeader>
            <EmptyTitle>No se pudieron cargar los anuncios.</EmptyTitle>
            <EmptyDescription>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !data || data.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Megaphone aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Todavía no hay anuncios.</EmptyTitle>
            <EmptyDescription>Crea el primero con «Nuevo anuncio».</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={DATA_TABLE_CARD}>
          <Table>
            <caption className="sr-only">Anuncios, del más reciente al más antiguo</caption>
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>Anuncio</TableHead>
                <TableHead scope="col" className={TH}>Nivel</TableHead>
                <TableHead scope="col" className={TH}>Audiencia</TableHead>
                <TableHead scope="col" className={TH}>Vigencia</TableHead>
                <TableHead scope="col" className={TH}>Estado</TableHead>
                <TableHead scope="col" className={TH}>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => {
                const estado = estadoAnuncio(a);
                return (
                  <TableRow key={a.idAnuncio} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                    <TableCell className={`${TD} min-w-0`}>
                      <p className="type-body font-semibold">{a.titulo}</p>
                      <p className="type-meta line-clamp-2 break-words">{a.mensaje}</p>
                    </TableCell>
                    <TableCell className={TD}>
                      <Tag tone={NIVEL_TONE[a.nivel]} size="sm">{NIVEL_ANUNCIO[a.nivel].etiqueta}</Tag>
                    </TableCell>
                    <TableCell className={TD}>{AUDIENCIA_LABEL[a.audiencia]}</TableCell>
                    <TableCell className={`${TD} type-meta tabular-nums`}>
                      {fecha(a.fechaInicio)} a {fecha(a.fechaFin)}
                    </TableCell>
                    <TableCell className={TD}>
                      <Tag tone={ESTADO_TONE[estado]} size="sm">{ESTADO_ANUNCIO_LABEL[estado]}</Tag>
                    </TableCell>
                    <TableCell className={TD}>
                      <div className="flex gap-tight">
                        <Button type="button" variant="outline" size="sm" aria-label={`Editar ${a.titulo}`} onClick={() => setFormulario({ anuncio: a })}>
                          <Pencil className="size-4" aria-hidden="true" /> Editar
                        </Button>
                        {a.activo && (
                          <Button type="button" variant="outline" size="sm" aria-label={`Despublicar ${a.titulo}`} onClick={() => setPorDespublicar(a)}>
                            <EyeOff className="size-4" aria-hidden="true" /> Despublicar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {formulario && (
        <AnuncioFormDialog
          anuncio={formulario.anuncio}
          isPending={crear.isPending || editar.isPending}
          onSubmit={guardar}
          onClose={() => setFormulario(null)}
        />
      )}

      <ConfirmActionDialog
        open={!!porDespublicar}
        title="Despublicar anuncio"
        description={`«${porDespublicar?.titulo ?? ''}» dejará de mostrarse a todas las personas. El anuncio no se borra.`}
        actionLabel="Despublicar"
        variant="warning"
        isPending={despublicar.isPending}
        onCancel={() => setPorDespublicar(null)}
        onConfirm={() =>
          porDespublicar &&
          despublicar.mutate(porDespublicar.idAnuncio, {
            onSuccess: () => {
              toast.success('Anuncio despublicado.');
              setPorDespublicar(null);
            },
            onError: () => toast.error('No se pudo despublicar el anuncio.'),
          })
        }
      />
    </div>
  );
}
