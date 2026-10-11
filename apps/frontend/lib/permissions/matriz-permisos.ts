export const ROLES_ACCESO = [
  'estudiante',
  'lider_asociacion',
  'mentor',
  'coordinador_academico',
  'administrador',
] as const;

export type RolAccesoNombre = (typeof ROLES_ACCESO)[number];

export const PERFILES_PERMISO = ['estudiante', 'lider', 'mentor', 'coordinador', 'administracion'] as const;

export type PerfilPermiso = (typeof PERFILES_PERMISO)[number];

const TODOS: readonly PerfilPermiso[] = PERFILES_PERMISO;
const SIN_ADMINISTRACION: readonly PerfilPermiso[] = ['estudiante', 'lider', 'mentor', 'coordinador'];
const SIN_LIDER_NI_ADMINISTRACION: readonly PerfilPermiso[] = ['estudiante', 'mentor', 'coordinador'];
const SOLO_LIDER: readonly PerfilPermiso[] = ['lider'];
const SOLO_ADMINISTRACION: readonly PerfilPermiso[] = ['administracion'];

export const MATRIZ_PERMISOS = {
  'dashboard.inicio': SIN_ADMINISTRACION,
  'admin.panel': SOLO_ADMINISTRACION,
  'admin.usuarios': SOLO_ADMINISTRACION,
  'admin.solicitudesRecuperacion': SOLO_ADMINISTRACION,
  'admin.apelaciones': SOLO_ADMINISTRACION,
  'admin.proyectos': SOLO_ADMINISTRACION,
  'admin.cierre': SOLO_ADMINISTRACION,
  'admin.revisiones': SOLO_ADMINISTRACION,
  'perfil.ver': TODOS,
  'notificaciones.ver': TODOS,
  'perfil.editar': SIN_ADMINISTRACION,
  'personal.vistas': SIN_ADMINISTRACION,
  'personas.ver': SIN_ADMINISTRACION,
  'proyectos.explorar': TODOS,
  'proyecto.detalle': TODOS,
  'proyecto.postular': SIN_LIDER_NI_ADMINISTRACION,
  'proyecto.postulaciones.resolver': SOLO_LIDER,
  'proyecto.miembros.gestionar': SOLO_LIDER,
  'proyecto.miembro.detalle': SOLO_LIDER,
  'proyecto.liderazgo': SOLO_LIDER,
  'proyecto.bitacora': SIN_ADMINISTRACION,
  'proyecto.reportes': SOLO_LIDER,
  'proyecto.sprints.ver': SIN_ADMINISTRACION,
  'proyecto.sprints.gestionar': SOLO_LIDER,
  'proyecto.sprints.finalizar': SOLO_LIDER,
  'proyecto.sprints.analitica': SIN_ADMINISTRACION,
  'proyectos.mios': SIN_ADMINISTRACION,
  'proyecto.crear': SIN_ADMINISTRACION,
  'proyecto.editar': SOLO_LIDER,
  'proyecto.vistaDueno': SOLO_LIDER,
  'proyecto.workspace': TODOS,
  'proyecto.tablero': SIN_ADMINISTRACION,
  'proyecto.cierre.preparar': SOLO_LIDER,
  'proyecto.salida.preparar': SIN_LIDER_NI_ADMINISTRACION,
  'proyectos.listadosLegacy': SIN_ADMINISTRACION,
} as const satisfies Record<string, readonly PerfilPermiso[]>;

export type AccionPermiso = keyof typeof MATRIZ_PERMISOS;

export function resolverPerfil(roles?: readonly string[] | null, esLider = false): PerfilPermiso {
  const normalizados = (roles ?? []).map((rol) => rol.toLowerCase());
  if (normalizados.includes('administrador')) return 'administracion';
  if (esLider) return 'lider';
  if (normalizados.includes('mentor')) return 'mentor';
  if (normalizados.includes('coordinador_academico')) return 'coordinador';
  return 'estudiante';
}

export function puede(accion: AccionPermiso, roles?: readonly string[] | null, esLider = false): boolean {
  return MATRIZ_PERMISOS[accion].includes(resolverPerfil(roles, esLider));
}
