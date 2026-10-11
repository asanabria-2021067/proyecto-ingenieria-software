import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_METADATA_KEY, type RolAccesoNombre } from '../decorators/roles.decorator';

/** Mensaje que ya devuelven los services cuando exigen administrador. */
export const ADMIN_ONLY_MESSAGE = 'Acceso restringido a administradores';
export const ROLE_FORBIDDEN_MESSAGE = 'No tienes permisos para realizar esta acción';

/**
 * T-286 (HU-175): guard de autorización por rol de acceso global. Va SIEMPRE
 * después de `JwtAuthGuard`, que resuelve la identidad (401 si no hay sesión);
 * este guard solo decide si ese usuario tiene uno de los roles de `@Roles`.
 *
 * - Sin `@Roles` (o lista vacía) no restringe nada: el guard es un no-op.
 * - El JWT no transporta roles, así que se validan en BD
 *   (`usuario_rol_acceso` → `rol_acceso.nombre_perfil`), igual que el resto
 *   de checks de administrador del backend.
 * - Sin permiso lanza 403, nunca 401/500.
 *
 * No sustituye a `ProjectWriteGuard` ni a la autorización por proyecto de los
 * services; se suma a ellos como primera barrera de la ruta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<RolAccesoNombre[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }

    const message = roles.length === 1 && roles[0] === 'administrador' ? ADMIN_ONLY_MESSAGE : ROLE_FORBIDDEN_MESSAGE;
    const userId = context.switchToHttp().getRequest()?.user?.userId;
    if (typeof userId !== 'number') {
      throw new ForbiddenException(message);
    }

    const record = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario: userId, rolAcceso: { nombrePerfil: { in: roles } } },
      select: { idUsuarioRolAcceso: true },
    });
    if (!record) {
      throw new ForbiddenException(message);
    }
    return true;
  }
}
