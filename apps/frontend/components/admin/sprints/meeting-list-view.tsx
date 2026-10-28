'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminUpcomingMeetings } from '@/hooks/use-admin-meetings';
import {
  describirHorarioReunion,
  diaInicioReunion,
  searchReuniones,
  separarReunionesVisibles,
} from '@/lib/admin/admin-calendar';
import { adminProjectHref, formatDiaConAnio } from '@/lib/admin/sprint-calendar';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';

/**
 * Reuniones de Administración de la vista Lista: la agenda activa (no
 * canceladas que aún no terminan), de la más próxima a la más lejana, tal
 * como la ordena el backend. Mismo esqueleto de tabla que la lista de Sprints
 * (`SprintListView`) y las mismas columnas por ancho del contenedor
 * `@container/sprints`: lo que se oculta como columna reaparece bajo el
 * título. Solo consulta: no hay acciones sobre la reunión.
 */
const COL_FECHA = '@lg/sprints:table-cell';
const COL_MODALIDAD = '@4xl/sprints:table-cell';
const META_FECHA = '@lg/sprints:hidden';
const META_MODALIDAD = '@4xl/sprints:hidden';

const TH =
  'h-auto whitespace-normal px-inline py-tight text-xs font-semibold uppercase tracking-wide text-text-secondary @lg/sprints:px-stack';
const TD = 'whitespace-normal py-tight align-top px-inline @lg/sprints:px-stack';

export function MeetingListView({ busqueda }: { busqueda: string }) {
  const { data, isPending, isError, isFetching, refetch } = useAdminUpcomingMeetings();
  const { visibles, inconsistentes } = useMemo(() => separarReunionesVisibles(data?.reuniones ?? []), [data]);
  const reuniones = useMemo(() => searchReuniones(visibles, busqueda), [visibles, busqueda]);

  return (
    <section aria-labelledby="reuniones-lista-titulo" className="flex flex-col gap-tight">
      <h2 id="reuniones-lista-titulo" className="type-section text-text-primary">
        Reuniones administrativas próximas
      </h2>

      {isError ? (
        <div role="alert" className="card-base flex flex-wrap items-center justify-between gap-inline">
          <p className="type-body flex items-center gap-tight text-text-primary">
            <AlertCircle className="size-4 shrink-0 text-status-error" aria-hidden="true" />
            No se pudieron cargar las reuniones administrativas.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      ) : isPending ? (
        <SkeletonRegion label="Cargando las reuniones administrativas">
          <div className="card-base space-y-tight">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-2/3" />
            ))}
          </div>
        </SkeletonRegion>
      ) : reuniones.length === 0 ? (
        <p className="card-base type-body text-text-secondary">
          {visibles.length === 0
            ? 'No hay reuniones administrativas próximas.'
            : 'Ninguna reunión próxima coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="card-base overflow-hidden p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-outline-variant/50 bg-surface-container-low hover:bg-surface-container-low">
                <TableHead scope="col" className={TH}>
                  Reunión
                </TableHead>
                <TableHead scope="col" className={`${TH} hidden w-52 ${COL_FECHA}`}>
                  Fecha y horario
                </TableHead>
                <TableHead scope="col" className={`${TH} hidden w-32 ${COL_MODALIDAD}`}>
                  Modalidad
                </TableHead>
                <TableHead scope="col" className={`${TH} w-[40%]`}>
                  Proyectos convocados
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reuniones.map((reunion) => {
                const { contenido } = reunion;
                const fecha = formatDiaConAnio(diaInicioReunion(contenido));
                const horario = describirHorarioReunion(contenido);
                const modalidad = MODALIDAD_ESTILO[contenido.modalidad].label;
                return (
                  <TableRow key={reunion.idReunion} className="border-outline-variant/50 hover:bg-surface-container-low">
                    <TableCell className={`${TD} min-w-0`}>
                      <p className="type-body break-words font-semibold text-text-primary">{contenido.tituloEvento}</p>
                      <p className={`type-meta mt-micro flex flex-wrap gap-x-tight gap-y-micro ${META_MODALIDAD}`}>
                        <span className={`tabular-nums ${META_FECHA}`}>
                          {fecha} · {horario}
                        </span>
                        <span>{modalidad}</span>
                      </p>
                    </TableCell>
                    <TableCell className={`${TD} hidden ${COL_FECHA}`}>
                      <span className="flex flex-col gap-micro">
                        <span className="type-body whitespace-nowrap tabular-nums text-text-primary">{fecha}</span>
                        <span className="type-meta tabular-nums">{horario}</span>
                      </span>
                    </TableCell>
                    <TableCell className={`${TD} hidden ${COL_MODALIDAD}`}>
                      <span className="type-body text-text-primary">{modalidad}</span>
                    </TableCell>
                    <TableCell className={TD}>
                      <ul className="flex flex-col gap-micro">
                        {reunion.proyectos.map((proyecto) => (
                          <li key={proyecto.idProyecto}>
                            <Link
                              href={adminProjectHref(proyecto.idProyecto)}
                              aria-label={`Ver proyecto ${proyecto.tituloProyecto}`}
                              className="type-meta break-words rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              {proyecto.tituloProyecto}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data && (data.completo === false || inconsistentes > 0) && (
        <p role="status" className="type-meta">
          {data.completo === false && 'Hay más reuniones próximas de las que se pudieron cargar. '}
          {inconsistentes > 0 &&
            `${inconsistentes === 1 ? '1 reunión no se muestra' : `${inconsistentes} reuniones no se muestran`} porque sus datos no son consistentes.`}
        </p>
      )}
    </section>
  );
}
