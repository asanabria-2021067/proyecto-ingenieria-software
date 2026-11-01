import type { RolOrganizacion } from '@/lib/types/organizations';

export const ROL_LABEL: Record<RolOrganizacion, string> = {
  PROPIETARIO: 'Propietario',
  ADMINISTRADOR: 'Administrador',
  EDITOR: 'Editor',
  LECTURA: 'Lectura',
};

export const ROL_DESCRIPCION: Record<RolOrganizacion, string> = {
  PROPIETARIO: 'Control total: transfiere, archiva y nombra administradores.',
  ADMINISTRADOR: 'Invita y quita miembros, cambia roles, edita datos y publica proyectos.',
  EDITOR: 'Crea y edita proyectos de la organización y participa en ellos.',
  LECTURA: 'Ve la organización, sus proyectos y su chat, sin editar.',
};

type RolOpcional = RolOrganizacion | null | undefined;

/** Propietario y Administrador gestionan miembros, invitaciones y solicitudes. */
export const puedeGestionar = (rol: RolOpcional) => rol === 'PROPIETARIO' || rol === 'ADMINISTRADOR';

/** Roles desde los que se publica un proyecto a nombre de la organización. */
export const puedePublicarComo = (rol: RolOpcional) => rol === 'PROPIETARIO' || rol === 'ADMINISTRADOR' || rol === 'EDITOR';

/**
 * Espejo de las reglas del servicio: nadie toca al Propietario ni a sí mismo, y el Administrador no
 * cambia ni quita a otros administradores (solo el Propietario nombra o retira administradores).
 */
export function puedeActuarSobre(miRol: RolOpcional, rolObjetivo: RolOrganizacion, esYo: boolean): boolean {
  if (esYo || rolObjetivo === 'PROPIETARIO') return false;
  if (miRol === 'PROPIETARIO') return true;
  return miRol === 'ADMINISTRADOR' && rolObjetivo !== 'ADMINISTRADOR';
}

/** Roles que `miRol` puede asignar: el Administrador no nombra administradores. */
export function rolesQueSePuedenAsignar(miRol: RolOpcional): RolOrganizacion[] {
  if (miRol === 'PROPIETARIO') return ['ADMINISTRADOR', 'EDITOR', 'LECTURA'];
  if (miRol === 'ADMINISTRADOR') return ['EDITOR', 'LECTURA'];
  return [];
}


export const esProyectoCerrado = (estado: string) => estado === 'CERRADO';
