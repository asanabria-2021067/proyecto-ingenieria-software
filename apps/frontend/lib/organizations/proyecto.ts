import { puedePublicarComo } from '@/lib/organizations/roles';
import type { MiembroOrganizacion, MiOrganizacion } from '@/lib/types/organizations';

/** Miembro elegido como participante: `idRol` es el `id` local del rol del formulario. */
export interface ParticipanteForm {
  idUsuario: number;
  idRol: string;
}

interface RolBasico {
  id: string;
  nombreRol: string;
  cupos: number | '';
}

/** «¿A nombre de quién?»: las organizaciones activas donde puedo publicar (Propietario, Administrador o Editor). */
export function organizacionesParaPublicar(organizaciones: MiOrganizacion[]): MiOrganizacion[] {
  return organizaciones.filter((o) => !o.archivada && o.puedePublicar && puedePublicarComo(o.miRol));
}

/** Pueden participar Propietario, Administrador y Editor, salvo el propio líder. Lectura solo observa. */
export function miembrosElegibles(miembros: MiembroOrganizacion[], idLider: number | null): MiembroOrganizacion[] {
  return miembros.filter((m) => m.idUsuario !== idLider && puedePublicarComo(m.rolOrganizacion));
}

const cuposDe = (rol: RolBasico) => (rol.cupos === '' ? 0 : Number(rol.cupos));

/** Cupos libres de cada rol según los participantes ya elegidos. */
export function cuposLibres(roles: RolBasico[], participantes: ParticipanteForm[]): Map<string, number> {
  const libres = new Map(roles.map((r) => [r.id, cuposDe(r)]));
  for (const p of participantes) libres.set(p.idRol, (libres.get(p.idRol) ?? 0) - 1);
  return libres;
}

/** Primer rol con cupo libre, o null si no queda ninguno. */
export function primerRolConCupo(roles: RolBasico[], participantes: ParticipanteForm[]): string | null {
  const libres = cuposLibres(roles, participantes);
  return roles.find((r) => (libres.get(r.id) ?? 0) > 0)?.id ?? null;
}

/** Mismas reglas que el servicio: rol existente por participante y sin pasarse de los cupos. */
export function errorParticipantes(roles: RolBasico[], participantes: ParticipanteForm[]): string | null {
  for (const p of participantes) {
    if (!roles.some((r) => r.id === p.idRol)) return 'Elige un rol de proyecto para cada participante.';
  }
  for (const rol of roles) {
    if ((cuposLibres(roles, participantes).get(rol.id) ?? 0) < 0) {
      return `Hay más participantes que cupos en el rol «${rol.nombreRol}».`;
    }
  }
  return null;
}

/** El servicio recibe la posición del rol dentro de `roles`, no su id local. */
export function participantesPayload(roles: RolBasico[], participantes: ParticipanteForm[]) {
  return participantes.map((p) => ({ idUsuario: p.idUsuario, indiceRol: roles.findIndex((r) => r.id === p.idRol) }));
}
