import type { ReactNode } from 'react';
import { Building2, Calendar, CalendarCheck2 } from 'lucide-react';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
} from '@/components/projects/available-project-card';
import { MODALIDAD_LABEL } from '@/types';
import { ProjectMyRolesSection } from '@/components/projects/detail/project-my-roles-section';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { ProjectRoleDTO } from '@/lib/services/roles';

const CARD = 'card-base';

function formatDate(date: string | null): string {
  if (!date) return 'Por definir';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'No disponible.';
  return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });
}

function DetalleFila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="type-meta">{label}</dt>
      <dd className="type-body text-right font-medium">{children}</dd>
    </div>
  );
}

function ResumenFila({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="type-meta">{label}</span>
      <span className="type-body font-bold">{value}</span>
    </div>
  );
}

interface ProjectDetailsSectionProps {
  proyecto: ProyectoDetalleDTO;
  isLeader: boolean;
  misRoles: ProjectRoleDTO[];
  participantesConfirmados: number;
  rolesDisponiblesCount: number;
  cuposTotales: number;
}

export function ProjectDetailsSection({
  proyecto,
  isLeader,
  misRoles,
  participantesConfirmados,
  rolesDisponiblesCount,
  cuposTotales,
}: ProjectDetailsSectionProps) {
  const organizacionPrincipal = proyecto.organizaciones[0] ?? null;

  // Las tarjetas se apilan en la columna lateral del esqueleto compartido
  // (ProjectGridAside), que ya da la separación entre ellas.
  return (
    <>
      {/* Detalles del proyecto */}
      <div className={CARD}>
        <h2 className="type-subtitle mb-stack">
          Detalles del proyecto
        </h2>
        <dl className="flex flex-col gap-inline">
          <DetalleFila label="Estado">
            <span className={`pill ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
              {estadoBadgeLabel(proyecto.estadoProyecto)}
            </span>
          </DetalleFila>
          <DetalleFila label="Tipo de proyecto">{tipoBadgeLabel(proyecto.tipoProyecto)}</DetalleFila>
          <DetalleFila label="Modalidad">
            {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ?? proyecto.modalidadProyecto}
          </DetalleFila>
          {organizacionPrincipal && (
            <DetalleFila label="Organización">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5 text-outline" aria-hidden="true" />
                {organizacionPrincipal.organizacion.nombreOrganizacion}
              </span>
            </DetalleFila>
          )}
          <DetalleFila label="Fecha de inicio">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 text-outline" aria-hidden="true" />
              {formatDate(proyecto.fechaInicio)}
            </span>
          </DetalleFila>
          <DetalleFila label="Fecha final estimada">
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck2 className="size-3.5 text-outline" aria-hidden="true" />
              {formatDate(proyecto.fechaFinEstimada)}
            </span>
          </DetalleFila>
        </dl>
      </div>

      {/* Resumen del equipo (Sección 24) — solo con datos enriquecidos del líder */}
      {isLeader && (
        <div className={CARD}>
          <h2 className="type-subtitle mb-stack">
            Resumen del equipo
          </h2>
          <div className="flex flex-col gap-inline">
            <ProjectMyRolesSection misRoles={misRoles} />
            <ResumenFila label="Participantes confirmados" value={participantesConfirmados} />
            <ResumenFila label="Roles disponibles" value={rolesDisponiblesCount} />
            <ResumenFila label="Cupos totales" value={cuposTotales} />
          </div>
        </div>
      )}
    </>
  );
}
