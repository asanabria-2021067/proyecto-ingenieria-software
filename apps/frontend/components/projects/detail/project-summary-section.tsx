import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  ProjectClosureAction,
  ProjectHeaderCard,
  type ClosureActionProps,
} from '@/components/projects/detail/project-header-card';
import { ProjectOwnerCard } from '@/components/projects/detail/project-owner-card';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

export type { ClosureActionProps };

const MIS_PROYECTOS_HREF = '/dashboard/projects/mine';

interface ProjectSummarySectionProps {
  proyecto: ProyectoDetalleDTO;
  isLeader: boolean;
  isAdmin: boolean;
  puedeVerKanban: boolean;
  children?: ReactNode;
  /** S7 — único punto de entrada a la preparación del cierre (VIEW-13). `undefined` ⇒ no se muestra. */
  closureAction?: ClosureActionProps;
  /** Proyecto `CERRADO`: sin ninguna escritura (ni «Postularme»). */
  readOnly?: boolean;
}

/**
 * Composición transitoria del encabezado del líder sobre las tarjetas
 * compartidas (ProjectHeaderCard + ProjectOwnerCard). HU-154 la retira cuando
 * ProjectDetailClient pase al esqueleto compartido.
 */
export function ProjectSummarySection({
  proyecto,
  isLeader,
  isAdmin,
  puedeVerKanban,
  children,
  closureAction,
  readOnly = false,
}: ProjectSummarySectionProps) {
  const mostrarPostularme = !isLeader && !puedeVerKanban && !isAdmin && !readOnly;

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <ProjectHeaderCard
          breadcrumb={{ href: MIS_PROYECTOS_HREF, label: 'Mis proyectos' }}
          titulo={proyecto.tituloProyecto}
          descripcion={proyecto.descripcionProyecto}
          tipoProyecto={proyecto.tipoProyecto}
          estadoProyecto={proyecto.estadoProyecto}
          modalidadProyecto={proyecto.modalidadProyecto}
          etiquetas={proyecto.intereses.map((pi) => pi.interes.nombreInteres)}
          lider={isLeader ? proyecto.creador : null}
          acciones={
            mostrarPostularme || closureAction ? (
              <>
                {mostrarPostularme && <Button className="shrink-0 bg-primary text-on-primary hover:bg-primary/90">Postularme</Button>}
                {closureAction && <ProjectClosureAction action={closureAction} />}
              </>
            ) : undefined
          }
        />
        <ProjectOwnerCard
          nombre={proyecto.creador.nombre}
          apellido={proyecto.creador.apellido}
          correo={proyecto.creador.correo}
        />
      </div>
      {children}
    </>
  );
}
