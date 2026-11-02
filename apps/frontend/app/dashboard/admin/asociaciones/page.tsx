'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Landmark, Pencil, Plus, RotateCcw, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { AsociacionFormDialog } from '@/components/associations/asociacion-form-dialog';
import { JuntaFormDialog } from '@/components/associations/junta-form-dialog';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageTitle } from '@/components/ui/page-title';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useAsociacionesAdmin, useAsociacionesAdminMutations } from '@/hooks/use-asociaciones';
import { useRequireCan } from '@/hooks/use-can';
import { CARGO_LABEL, NIVEL_LABEL } from '@/lib/asociaciones/vista';
import type { AsociacionAdmin, CargoJunta, MiembroJunta, NivelPermisoJunta } from '@/lib/services/asociaciones';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import { getApiErrorMessage } from '@/components/projects/api-error';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
const SELECT =
  'h-9 w-full min-w-32 rounded-control border border-input bg-transparent px-2 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none';

/** Gestión de asociaciones oficiales y de su junta directiva. Solo el administrador del sistema. */
export default function AdminAsociacionesPage() {
  const { permitido } = useRequireCan('admin.panel');
  const { data, isLoading, isError, refetch } = useAsociacionesAdmin(permitido);
  const { data: carreras = [] } = useQuery<Carrera[]>({ queryKey: ['carreras'], queryFn: getCarreras });
  const { crear, editar, asignar, cambiar, quitar } = useAsociacionesAdminMutations();
  // `{}` = creando; `{ asociacion }` = editando.
  const [formulario, setFormulario] = useState<{ asociacion?: AsociacionAdmin } | null>(null);
  const [nombrando, setNombrando] = useState<AsociacionAdmin | null>(null);
  const [archivando, setArchivando] = useState<AsociacionAdmin | null>(null);
  const [quitando, setQuitando] = useState<{ asociacion: AsociacionAdmin; miembro: MiembroJunta } | null>(null);

  if (!permitido) return null;

  const resultado = (ok: string, alCerrar?: () => void) => ({
    onSuccess: () => {
      toast.success(ok);
      alCerrar?.();
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e)),
  });

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Usuarios" pagina="Asociaciones y juntas" />
      <section className="mb-8 flex flex-wrap items-end justify-between gap-stack">
        <div>
          <PageTitle className={ADMIN_PAGE_TITLE}>Asociaciones y juntas</PageTitle>
          <p className={ADMIN_PAGE_LEAD}>
            Las asociaciones oficiales representan una o varias carreras. Solo tú nombras a su junta directiva; cada cambio queda en la bitácora y
            avisa a la persona.
          </p>
        </div>
        <Button type="button" onClick={() => setFormulario({})} className="text-xs font-bold">
          <Plus className="size-4" aria-hidden="true" /> Nueva asociación
        </Button>
      </section>

      {isLoading ? (
        <SkeletonRegion className="space-y-tight" label="Cargando asociaciones">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </SkeletonRegion>
      ) : isError ? (
        <Empty tone="danger" role="alert">
          <EmptyHeader>
            <EmptyTitle>No se pudieron cargar las asociaciones.</EmptyTitle>
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
            <Landmark aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Todavía no hay asociaciones.</EmptyTitle>
            <EmptyDescription>Crea la primera con «Nueva asociación».</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-section">
          {data.map((a) => (
            <section key={a.idAsociacion} aria-labelledby={`aso-${a.idAsociacion}`} className="card-base flex flex-col gap-stack">
              <div className="flex flex-wrap items-start justify-between gap-stack">
                <div className="min-w-0">
                  <h2 id={`aso-${a.idAsociacion}`} className="type-subtitle flex flex-wrap items-center gap-tight">
                    {a.nombre}
                    {a.archivada && (
                      <Tag tone="neutral" size="sm">
                        Archivada
                      </Tag>
                    )}
                  </h2>
                  <p className="type-meta mt-micro">Carreras: {a.carreras.map((c) => c.carrera.nombreCarrera).join(', ') || 'ninguna'}</p>
                  {a.descripcion && <p className="type-body mt-tight text-text-secondary">{a.descripcion}</p>}
                </div>
                <div className="flex flex-wrap gap-tight">
                  <Button type="button" variant="outline" size="sm" aria-label={`Editar ${a.nombre}`} onClick={() => setFormulario({ asociacion: a })}>
                    <Pencil className="size-4" aria-hidden="true" /> Editar
                  </Button>
                  {a.archivada ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Restaurar ${a.nombre}`}
                      disabled={editar.isPending}
                      onClick={() => editar.mutate({ id: a.idAsociacion, input: { archivada: false } }, resultado('Asociación restaurada.'))}
                    >
                      <RotateCcw className="size-4" aria-hidden="true" /> Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="sm" aria-label={`Nombrar integrante de ${a.nombre}`} onClick={() => setNombrando(a)}>
                        <UserPlus className="size-4" aria-hidden="true" /> Nombrar integrante
                      </Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Archivar ${a.nombre}`} onClick={() => setArchivando(a)}>
                        <Archive className="size-4" aria-hidden="true" /> Archivar
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {a.junta.length === 0 ? (
                <p className="type-meta">Sin junta directiva todavía.</p>
              ) : (
                <div className={DATA_TABLE_CARD}>
                  <Table>
                    <caption className="sr-only">Junta directiva de {a.nombre}</caption>
                    <TableHeader>
                      <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                        <TableHead scope="col" className={TH}>
                          Integrante
                        </TableHead>
                        <TableHead scope="col" className={TH}>
                          Cargo
                        </TableHead>
                        <TableHead scope="col" className={TH}>
                          Nivel de permiso
                        </TableHead>
                        <TableHead scope="col" className={TH}>
                          <span className="sr-only">Acciones</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.junta.map((m) => {
                        const nombre = `${m.usuario.nombre} ${m.usuario.apellido}`;
                        return (
                          <TableRow key={m.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                            <TableCell className={`${TD} min-w-40`}>
                              <p className="type-body font-semibold">{nombre}</p>
                              <p className="type-meta break-all">{m.usuario.correo}</p>
                            </TableCell>
                            <TableCell className={TD}>
                              <select
                                aria-label={`Cargo de ${nombre}`}
                                className={SELECT}
                                value={m.cargo}
                                disabled={a.archivada || cambiar.isPending}
                                onChange={(e) =>
                                  cambiar.mutate(
                                    { id: a.idAsociacion, idUsuario: m.idUsuario, input: { cargo: e.target.value as CargoJunta } },
                                    resultado('Cargo actualizado.'),
                                  )
                                }
                              >
                                {Object.entries(CARGO_LABEL).map(([valor, etiqueta]) => (
                                  <option key={valor} value={valor}>
                                    {etiqueta}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className={TD}>
                              <select
                                aria-label={`Nivel de permiso de ${nombre}`}
                                className={SELECT}
                                value={m.nivelPermiso}
                                disabled={a.archivada || cambiar.isPending}
                                onChange={(e) =>
                                  cambiar.mutate(
                                    { id: a.idAsociacion, idUsuario: m.idUsuario, input: { nivelPermiso: e.target.value as NivelPermisoJunta } },
                                    resultado('Nivel actualizado.'),
                                  )
                                }
                              >
                                {Object.entries(NIVEL_LABEL).map(([valor, etiqueta]) => (
                                  <option key={valor} value={valor}>
                                    {etiqueta}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className={TD}>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={`Quitar a ${nombre} de la junta`}
                                onClick={() => setQuitando({ asociacion: a, miembro: m })}
                              >
                                <X className="size-4" aria-hidden="true" /> Quitar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {formulario && (
        <AsociacionFormDialog
          asociacion={formulario.asociacion}
          carreras={carreras}
          isPending={crear.isPending || editar.isPending}
          onClose={() => setFormulario(null)}
          onSubmit={(input) => {
            const cerrar = () => setFormulario(null);
            if (formulario.asociacion) editar.mutate({ id: formulario.asociacion.idAsociacion, input }, resultado('Asociación actualizada.', cerrar));
            else crear.mutate(input, resultado('Asociación creada.', cerrar));
          }}
        />
      )}

      {nombrando && (
        <JuntaFormDialog
          isPending={asignar.isPending}
          ocupados={nombrando.junta.map((m) => m.idUsuario)}
          onClose={() => setNombrando(null)}
          onSubmit={(input) => asignar.mutate({ id: nombrando.idAsociacion, input }, resultado('Integrante nombrado.', () => setNombrando(null)))}
        />
      )}

      <ConfirmActionDialog
        open={archivando !== null}
        title="Archivar asociación"
        description={`«${archivando?.nombre ?? ''}» deja de ofrecer su vista a la junta y no se pueden cambiar sus integrantes. Puedes restaurarla después.`}
        actionLabel="Archivar"
        variant="warning"
        isPending={editar.isPending}
        onCancel={() => setArchivando(null)}
        onConfirm={() =>
          archivando && editar.mutate({ id: archivando.idAsociacion, input: { archivada: true } }, resultado('Asociación archivada.', () => setArchivando(null)))
        }
      />

      <ConfirmActionDialog
        open={quitando !== null}
        title="Quitar de la junta"
        description={`${quitando ? `${quitando.miembro.usuario.nombre} ${quitando.miembro.usuario.apellido}` : ''} perderá el acceso al tablero de la asociación y recibirá un aviso.`}
        actionLabel="Quitar"
        variant="destructive"
        isPending={quitar.isPending}
        onCancel={() => setQuitando(null)}
        onConfirm={() =>
          quitando &&
          quitar.mutate(
            { id: quitando.asociacion.idAsociacion, idUsuario: quitando.miembro.idUsuario },
            resultado('Integrante quitado.', () => setQuitando(null)),
          )
        }
      />
    </div>
  );
}
