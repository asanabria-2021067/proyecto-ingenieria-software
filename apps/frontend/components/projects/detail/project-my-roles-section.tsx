import type { ProjectRoleDTO } from '@/lib/services/roles';

interface ProjectMyRolesSectionProps {
  misRoles: ProjectRoleDTO[];
}

export function ProjectMyRolesSection({ misRoles }: ProjectMyRolesSectionProps) {
  return (
    <div>
      <p className="type-meta mb-micro">Mis roles</p>
      {misRoles.length === 0 ? (
        <p className="type-body text-text-secondary">No asignado</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {misRoles.map((r) => (
            <span
              key={r.idRolProyecto}
              className="pill pill-success"
            >
              {r.nombreRol}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
