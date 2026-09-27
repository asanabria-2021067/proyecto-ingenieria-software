import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RoleAdminCard } from '@/components/projects/role-admin-card';
import {
  ProjectRolesSheet,
  type RolesSheetIntent,
} from '@/components/projects/project-roles-sheet';
import type { useProjectRoles } from '@/hooks/use-project-roles';
import type { ProjectRoleDTO } from '@/lib/services/roles';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import { apiFetch } from '@/lib/api/client';
import type { Postulacion } from '@/types';
import uvgSwal from '@/lib/swal';

type ProjectRolesHook = ReturnType<typeof useProjectRoles>;

const CARD = 'card-base';

const ULTIMO_ROL_MSG = 'No puedes abandonar tu último rol desde esta opción.';

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
  // Postulaciones del solicitante, solo relevantes en la rama no-líder (para
  // "Ver mi postulación" por rol); mismo query key que el resto de la app.
  const { data: misPostulaciones = [] } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
    enabled: !isLeader,
  });

  const handleSalirDeRol = async (rol: { idRolProyecto: number; nombreRol: string }) => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'warning',
      title: `¿Salir del rol "${rol.nombreRol}"?`,
      text: 'Dejarás de participar en este rol. Las tareas de este rol que tengas asignadas quedarán sin asignar; conservarás tus demás roles del proyecto.',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    salirDeRol.mutate({ roleId: rol.idRolProyecto });
  };

  return (
    <>
      {/* ROLES (Sección 17-20) */}
      {isLeader ? (
        <div className={CARD}>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="type-section">
              Roles del proyecto ({rolesAdmin.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={abrirCrearRol}
              className="gap-micro self-start border-primary text-primary hover:bg-primary/10 sm:self-auto"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Agregar rol
            </Button>
          </div>
          {rolesAdmin.length === 0 ? (
            <p className="type-body text-text-secondary">No hay roles registrados.</p>
          ) : (
            // Dos columnas según el ancho real de la lista, no de la ventana: en la
            // columna principal 8/12 dos tarjetas por fila no caben hasta ~42rem.
            <div className="@container/roles">
              <div className="grid grid-cols-1 gap-inline @2xl/roles:grid-cols-2">
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
            </div>
          )}
        </div>
      ) : (
        proyecto.roles.length > 0 && (
          <div className={CARD}>
            <h2 className="type-meta mb-stack uppercase tracking-wide">
              Roles disponibles
            </h2>
            <div className="space-y-5">
              {proyecto.roles.map((rol) => {
                const rolAdmin = rolesAdmin.find((r) => r.idRolProyecto === rol.idRolProyecto);
                const esMiRol = rolAdmin?.isMine ?? false;
                const puedeSalir = rolAdmin?.canLeave ?? false;
                const saliendo =
                  salirDeRol.isPending && salirDeRol.variables?.roleId === rol.idRolProyecto;
                const misPostulacionRol = misPostulaciones.find(
                  (p) =>
                    p.rolProyecto.idRolProyecto === rol.idRolProyecto &&
                    p.estadoPostulacion === 'PENDIENTE',
                );

                return (
                  <div key={rol.idRolProyecto} className="border-l-4 border-primary py-0.5 pl-5">
                    <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="type-subtitle">{rol.nombreRol}</h3>
                        {esMiRol && (
                          <span className="pill pill-success">
                            Mi rol
                          </span>
                        )}
                        {rol.cupos > 0 && (
                          <span className="pill pill-accent">
                            Disponible
                          </span>
                        )}
                      </div>

                      {esMiRol ? (
                        puedeSalir ? (
                          <Button
                            size="sm"
                            onClick={() => handleSalirDeRol(rol)}
                            disabled={saliendo}
                            className="shrink-0 self-start gap-micro bg-error text-on-error hover:bg-error/90"
                          >
                            {saliendo ? 'Saliendo…' : 'Salir de este rol'}
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0} aria-label={ULTIMO_ROL_MSG} className="shrink-0 self-start">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="pointer-events-none gap-micro border-outline-variant text-text-disabled"
                                >
                                  Salir de este rol
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{ULTIMO_ROL_MSG}</TooltipContent>
                          </Tooltip>
                        )
                      ) : misPostulacionRol ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="shrink-0 self-start gap-micro border-outline-variant text-text-primary hover:bg-surface-container"
                        >
                          <Link href="/dashboard/mis-postulaciones">Ver mi postulación</Link>
                        </Button>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          className="shrink-0 self-start gap-micro bg-primary text-on-primary hover:bg-primary/90"
                        >
                          <Link href={`/dashboard/proyectos/${proyecto.idProyecto}/postular/${rol.idRolProyecto}`}>
                            Postularme a este rol
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      )}
                    </div>
                    <div className="type-meta mb-inline flex items-center gap-micro">
                      <Users className="size-3.5" />
                      {rol.cupos} {rol.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                    </div>
                    {rol.descripcionRolProyecto && (
                      <p className="type-meta mb-inline">
                        {rol.descripcionRolProyecto}
                      </p>
                    )}
                    {rol.requisitos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {rol.requisitos.map((req) => (
                          <span
                            key={req.idRequisitoHabilidad}
                            className="pill pill-neutral"
                          >
                            {req.habilidad.nombreHabilidad}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
