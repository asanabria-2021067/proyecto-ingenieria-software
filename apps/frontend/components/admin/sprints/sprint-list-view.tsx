import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  SITUACION_SPRINT_LABEL_CORTA,
  SITUACION_SPRINT_TONE,
  adminProjectHref,
  describeDiasRestantes,
  formatDiaConAnio,
  formatInstanteGuatemala,
} from '@/lib/admin/sprint-calendar';
import type { AdminSprintCalendarItem } from '@/lib/types/admin-sprints';

/**
 * Vista Lista del calendario administrativo de Sprints: una fila por Sprint
 * operable, en el orden de supervisión que recibe (plan vencido primero).
 * Mismo esqueleto de tabla que la bandeja de Proyectos Activos.
 *
 * Columnas por ancho de la tarjeta (el contenedor `@container/sprints` lo
 * pone la página). Siempre: Proyecto, Situación y Ver proyecto. Desde 32rem
 * aparece Finalización esperada, desde 42rem Sprint, desde 56rem Inicio y
 * desde 64rem Líder. Lo que se oculta como columna reaparece como metadata
 * bajo el nombre del proyecto, así ninguna fila pierde información.
 */
const COL_FIN = '@lg/sprints:table-cell';
const COL_SPRINT = '@2xl/sprints:table-cell';
const COL_INICIO = '@4xl/sprints:table-cell';
const COL_LIDER = '@5xl/sprints:table-cell';
const META_FIN = '@lg/sprints:hidden';
const META_SPRINT = '@2xl/sprints:hidden';
const META_LIDER = '@5xl/sprints:hidden';

const TH =
  'h-auto whitespace-normal px-inline py-tight text-xs font-semibold uppercase tracking-wide text-text-secondary @lg/sprints:px-stack';
const TD_BASE = 'whitespace-normal py-tight align-top';
const TD = `${TD_BASE} px-inline @lg/sprints:px-stack`;

export function SprintListView({ items }: { items: readonly AdminSprintCalendarItem[] }) {
  return (
    <div className="card-base overflow-hidden p-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="border-outline-variant/50 bg-surface-container-low hover:bg-surface-container-low">
            <TableHead scope="col" className={TH}>
              Proyecto
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden w-24 ${COL_SPRINT}`}>
              Sprint
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden w-[18%] ${COL_LIDER}`}>
              Líder
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden w-32 ${COL_INICIO}`}>
              Inicio
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden w-36 ${COL_FIN}`}>
              Finalización esperada
            </TableHead>
            <TableHead scope="col" className={`${TH} w-32 @lg/sprints:w-36`}>
              Situación
            </TableHead>
            <TableHead scope="col" className={`${TH} w-12 text-right @2xl/sprints:w-36`}>
              <span className="sr-only">Acción</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* ponytail: filas sin virtualizar; añadir `content-visibility: auto` si los Sprints operables superan unos cientos. */}
          {items.map((item) => {
            const lider = `${item.lider.nombre} ${item.lider.apellido}`.trim();
            const fin = item.fechaFinPlaneada ? formatDiaConAnio(item.fechaFinPlaneada) : null;
            const dias = describeDiasRestantes(item);
            return (
              <TableRow key={item.idSprint} className="border-outline-variant/50 hover:bg-surface-container-low">
                <TableCell className={`${TD} min-w-0`}>
                  <p className="type-body break-words font-semibold text-text-primary">{item.tituloProyecto}</p>
                  <p className={`type-meta mt-micro flex flex-wrap gap-x-tight gap-y-micro ${META_LIDER}`}>
                    <span className={META_SPRINT}>Sprint {item.numero}</span>
                    <span>{lider}</span>
                    <span className={`tabular-nums ${META_FIN}`}>{fin ?? 'Sin fecha'}</span>
                  </p>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_SPRINT}`}>
                  <span className="type-body whitespace-nowrap font-medium text-text-primary">Sprint {item.numero}</span>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_LIDER}`}>
                  <span className="type-body text-text-primary">{lider}</span>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_INICIO}`}>
                  <span className="type-body whitespace-nowrap tabular-nums text-text-secondary">
                    {formatInstanteGuatemala(item.fechaInicio)}
                  </span>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_FIN}`}>
                  {fin ? (
                    <span className="flex flex-col gap-micro">
                      <span className="type-body whitespace-nowrap tabular-nums text-text-primary">{fin}</span>
                      {dias && <span className="type-meta">{dias}</span>}
                    </span>
                  ) : (
                    <span className="type-meta">Sin fecha</span>
                  )}
                </TableCell>
                <TableCell className={TD}>
                  <span className={`pill whitespace-nowrap ${SITUACION_SPRINT_TONE[item.situacion]}`}>
                    {SITUACION_SPRINT_LABEL_CORTA[item.situacion]}
                  </span>
                </TableCell>
                <TableCell className={`${TD_BASE} px-micro text-right @2xl/sprints:px-stack`}>
                  <Link
                    href={adminProjectHref(item.idProyecto)}
                    aria-label={`Ver proyecto ${item.tituloProyecto}`}
                    className="ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary hover:underline"
                  >
                    <span className="hidden @2xl/sprints:inline">Ver proyecto</span>
                    <ChevronRight className="size-4 @2xl/sprints:size-3.5" aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
