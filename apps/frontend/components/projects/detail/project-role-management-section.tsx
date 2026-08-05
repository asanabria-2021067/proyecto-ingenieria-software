import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoleAdminCard } from '@/components/projects/role-admin-card';
import {
  ProjectRolesSheet,
  type RolesSheetIntent,
} from '@/components/projects/project-roles-sheet';
import type { useProjectRoles } from '@/hooks/use-project-roles';
import type { ProjectRoleDTO } from '@/lib/services/roles';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

type ProjectRolesHook = ReturnType<typeof useProjectRoles>;

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

interface ProjectRoleManagementSectionProps {
  isLeader: boolean;
  proyecto: ProyectoDetalleDTO;
  rolesAdmin: ProjectRoleDTO[];
  asignarmeRol: ProjectRolesHook['asignarmeRol'];
  salirDeRol: ProjectRolesHook['salirDeRol'];
  crearRol: ProjectRolesHook['crearRol'];
  editarRol: ProjectRolesHook['editarRol'];
  eliminarRol: ProjectRolesHook['eliminarRol'];
  abrirCrearRol: () => void;
  abrirEditarRol: (role: ProjectRoleDTO) => void;
  rolesSheetAbierto: boolean;
  setRolesSheetAbierto: (open: boolean) => void;
  rolesSheetIntent: RolesSheetIntent;
}

export function ProjectRoleManagementSection({
  isLeader,
  proyecto,
  rolesAdmin,
  asignarmeRol,
  salirDeRol,
  crearRol,
  editarRol,
  eliminarRol,
  abrirCrearRol,
  abrirEditarRol,
  rolesSheetAbierto,
  setRolesSheetAbierto,
  rolesSheetIntent,
}: ProjectRoleManagementSectionProps) {
  return (
    <>
      {/* ROLES (Sección 17-20) */}
      {isLeader ? (
        <div className={CARD}>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="font-headline text-sm font-black text-on-surface">
              Roles del proyecto ({rolesAdmin.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={abrirCrearRol}
              className="gap-1.5 self-start rounded-md border-primary text-xs font-bold text-primary hover:bg-primary/10 sm:self-auto"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Agregar rol
            </Button>
          </div>
          {rolesAdmin.length === 0 ? (
            <p className="text-sm text-tertiary">No hay roles registrados.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
              {rolesAdmin.map((role) => (
                <RoleAdminCard
                  key={role.idRolProyecto}
                  role={role}
                  asignarmeRol={asignarmeRol}
                  salirDeRol={salirDeRol}
                  onEditar={() => abrirEditarRol(role)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        proyecto.roles.length > 0 && (
          <div className={CARD}>
            <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
              Roles disponibles
            </h2>
            <div className="space-y-5">
              {proyecto.roles.map((rol) => (
                <div key={rol.idRolProyecto} className="border-l-4 border-primary py-0.5 pl-5">
                  <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <h3 className="font-headline text-sm font-black text-on-surface">{rol.nombreRol}</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 self-start rounded-md border-primary text-xs font-bold text-primary transition-all hover:bg-primary/10"
                    >
                      Postularme a este rol
                    </Button>
                  </div>
                  <div className="mb-3 flex items-center gap-1.5 text-xs text-tertiary">
                    <Users className="size-3.5" />
                    {rol.cupos} {rol.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                  </div>
                  {rol.descripcionRolProyecto && (
                    <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
                      {rol.descripcionRolProyecto}
                    </p>
                  )}
                  {rol.requisitos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {rol.requisitos.map((req) => (
                        <span
                          key={req.idRequisitoHabilidad}
                          className="rounded-md bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface"
                        >
                          {req.habilidad.nombreHabilidad}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Sheet de gestión de roles (solo líder) */}
      {isLeader && (
        <ProjectRolesSheet
          open={rolesSheetAbierto}
          onOpenChange={setRolesSheetAbierto}
          intent={rolesSheetIntent}
          roles={rolesAdmin}
          crearRol={crearRol}
          editarRol={editarRol}
          eliminarRol={eliminarRol}
        />
      )}
    </>
  );
}
