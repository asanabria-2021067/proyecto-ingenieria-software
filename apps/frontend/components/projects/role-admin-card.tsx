'use client';

import { useState } from 'react';
import { UserPlus, Users, LogOut, Clock, GraduationCap, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getApiErrorMessage } from '@/components/projects/api-error';
import type { ProjectRoleDTO } from '@/lib/services/roles';
import type { useProjectRoles } from '@/hooks/use-project-roles';

type ProjectRolesHook = ReturnType<typeof useProjectRoles>;

interface RoleAdminCardProps {
  role: ProjectRoleDTO;
  asignarmeRol: ProjectRolesHook['asignarmeRol'];
  salirDeRol: ProjectRolesHook['salirDeRol'];
  /** Abre el Sheet de gestión en modo edición de este rol (Sección 20E). */
  onEditar?: () => void;
}

const NIVEL_LABEL_ROL: Record<string, string> = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
};

const ULTIMO_ROL_MSG = 'No puedes abandonar tu último rol desde esta opción.';

/**
 * Tarjeta de rol para la vista administrativa del líder (Sección 22). Un solo
 * badge "Mi rol" por cada rol activo (nunca la frase singular global). El botón
 * "Salir de este rol" solo aparece cuando el líder conserva otro rol activo
 * (`canLeave`); si es su único rol, se muestra deshabilitado con tooltip. El
 * frontend no dispara una petición que el backend rechazará, pero el backend
 * sigue validando igual.
 */
export function RoleAdminCard({ role, asignarmeRol, salirDeRol, onEditar }: RoleAdminCardProps) {
  const [confirmarSalir, setConfirmarSalir] = useState(false);

  const asignandome =
    asignarmeRol.isPending && asignarmeRol.variables?.roleId === role.idRolProyecto;
  const saliendo = salirDeRol.isPending && salirDeRol.variables?.roleId === role.idRolProyecto;

  const errorAsignar =
    asignarmeRol.isError && asignarmeRol.variables?.roleId === role.idRolProyecto
      ? getApiErrorMessage(asignarmeRol.error, 'role')
      : null;
  const errorSalir =
    salirDeRol.isError && salirDeRol.variables?.roleId === role.idRolProyecto
      ? getApiErrorMessage(salirDeRol.error, 'role')
      : null;

  const handleAsignarme = () => asignarmeRol.mutate({ roleId: role.idRolProyecto });
  const handleSalir = () =>
    salirDeRol.mutate(
      { roleId: role.idRolProyecto },
      { onSuccess: () => setConfirmarSalir(false) },
    );

  return (
    <div className="@container/role-card rounded-control border border-outline-variant/60 bg-card p-stack">
      {/* Nombre y acciones en fila solo si la tarjeta mide al menos 28rem: en la
          columna principal del proyecto la tarjeta puede quedar estrecha. */}
      <div className="flex flex-col gap-tight @md/role-card:flex-row @md/role-card:items-start @md/role-card:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-subtitle">{role.nombreRol}</h3>
            {role.isMine && (
              <span className="pill pill-success">
                Mi rol
              </span>
            )}
            {/* Disponibilidad real (Sección 19): solo si hay cupos disponibles. */}
            {role.cuposDisponibles > 0 ? (
              <span className="pill pill-accent">
                Disponible
              </span>
            ) : (
              <span className="pill pill-neutral">
                Sin cupos
              </span>
            )}
          </div>
          {role.carreraRequerida && (
            <p className="type-meta mt-micro flex items-center gap-micro">
              <GraduationCap className="size-3.5" aria-hidden="true" />
              {role.carreraRequerida.nombreCarrera}
            </p>
          )}
        </div>

        {/* Acciones del líder (Sección 22 A-D) */}
        <div className="flex shrink-0 flex-col items-stretch gap-micro @md/role-card:items-end">
          {!role.isMine ? (
            <Button
              type="button"
              size="sm"
              onClick={handleAsignarme}
              disabled={asignandome}
              className="min-h-9 gap-micro bg-primary text-on-primary hover:bg-primary/90"
            >
              {asignandome ? <Spinner className="size-3.5" /> : <UserPlus className="size-3.5" aria-hidden="true" />}
              Asignarme a este rol
            </Button>
          ) : role.canLeave ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmarSalir(true)}
              disabled={saliendo}
              className="min-h-9 gap-micro border-transparent bg-error text-on-error hover:bg-error/90"
            >
              {saliendo ? <Spinner className="size-3.5" /> : <LogOut className="size-3.5" aria-hidden="true" />}
              Salir de este rol
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span envuelve el botón deshabilitado para que el tooltip reciba foco/hover */}
                <span tabIndex={0} aria-label={ULTIMO_ROL_MSG}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    className="pointer-events-none min-h-9 gap-micro border-outline-variant text-text-disabled"
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    Salir de este rol
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{ULTIMO_ROL_MSG}</TooltipContent>
            </Tooltip>
          )}

          {onEditar && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onEditar}
              aria-label={`Editar rol ${role.nombreRol}`}
              className="min-h-9 gap-micro text-text-secondary"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Editar rol
            </Button>
          )}
        </div>
      </div>

      {role.descripcionRolProyecto && (
        <p className="type-meta mt-tight">
          {role.descripcionRolProyecto}
        </p>
      )}

      {/* Métricas del rol (Sección 22) */}
      <div className="type-meta mt-inline flex flex-wrap items-center gap-x-stack gap-y-micro">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" />
          {role.participantesActivos}/{role.cupos} ocupados
        </span>
        <span>
          {role.cuposDisponibles} {role.cuposDisponibles === 1 ? 'cupo disponible' : 'cupos disponibles'}
        </span>
        {role.horasSemanalesEstimadas != null && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {role.horasSemanalesEstimadas} h/sem
          </span>
        )}
      </div>

      {role.requisitos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {role.requisitos.map((req) => (
            <span
              key={req.idHabilidad}
              className="pill pill-neutral"
            >
              {req.nombreHabilidad}
              <span className="text-text-disabled">
                · {NIVEL_LABEL_ROL[req.nivelMinimo] ?? req.nivelMinimo}
              </span>
            </span>
          ))}
        </div>
      )}

      {(errorAsignar || errorSalir) && (
        <p role="alert" className="type-meta mt-tight text-error">
          {errorAsignar ?? errorSalir}
        </p>
      )}

      {/* Confirmación de salida (cierra las asignaciones de tareas de este rol) */}
      <AlertDialog open={confirmarSalir} onOpenChange={(open) => !open && setConfirmarSalir(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salir del rol “{role.nombreRol}”</AlertDialogTitle>
            <AlertDialogDescription>
              Dejarás de participar en este rol. Las tareas de este rol que tengas asignadas quedarán
              sin asignar; conservarás tus demás roles del proyecto. Esta acción no elimina tareas ni
              cambia su estado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorSalir && (
            <p role="alert" className="type-meta text-error">
              {errorSalir}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saliendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saliendo}
              onClick={(e) => {
                e.preventDefault();
                handleSalir();
              }}
              className="bg-error text-on-error hover:bg-error/90"
            >
              {saliendo ? 'Saliendo…' : 'Salir del rol'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
