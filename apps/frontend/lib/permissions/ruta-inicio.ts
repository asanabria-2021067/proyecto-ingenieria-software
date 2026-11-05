type ConRoles = { roles?: readonly string[] | null } | null | undefined;

const tiene = (user: ConRoles, rol: string) => (user?.roles ?? []).some((r) => r.toLowerCase() === rol);

/** Coordinador académico que no es administrador: el administrador conserva su propio shell. */
export function isCoordinadorUser(user?: ConRoles): boolean {
  return tiene(user, 'coordinador_academico') && !tiene(user, 'administrador');
}

/** Pantalla de inicio tras iniciar sesión según el rol. */
export function rutaInicioDe(user?: ConRoles): string {
  if (tiene(user, 'administrador')) return '/dashboard/admin';
  return isCoordinadorUser(user) ? '/dashboard/coordinador' : '/dashboard';
}
