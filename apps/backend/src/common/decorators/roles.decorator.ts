import { SetMetadata } from '@nestjs/common';

/**
 * T-286 (HU-175): roles de acceso globales tal como existen en
 * `rol_acceso.nombre_perfil`. No incluye "líder de proyecto": ese rol es por
 * proyecto (`Proyecto.creadoPor`) y lo deciden `ProjectWriteGuard` +
 * `ProjectPolicyService`, nunca este decorador.
 */
export type RolAccesoNombre =
  | 'estudiante'
  | 'lider_asociacion'
  | 'mentor'
  | 'coordinador_academico'
  | 'administrador';

/** Clave de Reflector bajo la que `@Roles` guarda los roles admitidos del handler o del controller. */
export const ROLES_METADATA_KEY = 'uvgenius:roles';

/**
 * Declara los roles de acceso admitidos en una ruta. Se combina con
 * `@UseGuards(JwtAuthGuard, RolesGuard)`: basta con que el usuario tenga
 * UNO de los roles listados. La metadata del handler prevalece sobre la del
 * controller.
 */
export const Roles = (...roles: RolAccesoNombre[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
