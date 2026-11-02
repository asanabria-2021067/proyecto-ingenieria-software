import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { Tag } from '@/components/ui/tag';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { TIPO_LABEL } from '@/types';
import type { TipoProyecto } from '@/types';
import type { ProyectoDeOrganizacion } from '@/lib/types/organizations';

function Fila({ proyecto }: { proyecto: ProyectoDeOrganizacion }) {
  const { avance } = proyecto;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/dashboard/proyectos/${proyecto.idProyecto}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface hover:underline"
        >
          {proyecto.tituloProyecto}
        </Link>
        <Tag size="sm" tone="subtle">
          {TIPO_LABEL[proyecto.tipoProyecto as TipoProyecto] ?? proyecto.tipoProyecto}
        </Tag>
        <span className={`pill pill-sm ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
          {estadoBadgeLabel(proyecto.estadoProyecto)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Progress value={avance.porcentaje} aria-label={`Avance de ${proyecto.tituloProyecto}`} className="h-2 flex-1" />
        <span className="w-28 shrink-0 text-right text-xs text-on-surface-variant">
          {avance.porcentaje}% ({avance.hecho}/{avance.total} tareas)
        </span>
      </div>
    </li>
  );
}

function Grupo({ titulo, proyectos, vacio }: { titulo: string; proyectos: ProyectoDeOrganizacion[]; vacio: string }) {
  return (
    <section aria-label={titulo}>
      <h3 className="type-subtitle mb-3">
        {titulo} ({proyectos.length})
      </h3>
      {proyectos.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{vacio}</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {proyectos.map((p) => (
            <Fila key={p.idProyecto} proyecto={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Proyectos de la organización: activos y cerrados, cada uno con su avance por tareas. */
export function OrgProyectos({ proyectos }: { proyectos: ProyectoDeOrganizacion[] }) {
  const cerrados = proyectos.filter((p) => p.estadoProyecto === 'CERRADO');
  const activos = proyectos.filter((p) => p.estadoProyecto !== 'CERRADO');
  return (
    <div className="space-y-8">
      <Grupo titulo="Proyectos activos" proyectos={activos} vacio="Aún no hay proyectos activos." />
      <Grupo titulo="Proyectos cerrados" proyectos={cerrados} vacio="Todavía no se ha cerrado ningún proyecto." />
    </div>
  );
}
