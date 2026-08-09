import type { ProjectRoleDTO } from '@/lib/services/roles';

interface ProjectMyRolesSectionProps {
  misRoles: ProjectRoleDTO[];
}

export function ProjectMyRolesSection({ misRoles }: ProjectMyRolesSectionProps) {
  return (
    <div>
      <p className="mb-1 text-xs text-tertiary">Mis roles</p>
      {misRoles.length === 0 ? (
        <p className="text-sm font-medium text-on-surface-variant">No asignado</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {misRoles.map((r) => (
            <span
              key={r.idRolProyecto}
              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
            >
              {r.nombreRol}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
