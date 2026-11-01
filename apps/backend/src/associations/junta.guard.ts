import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JUNTA_FORBIDDEN_MESSAGE, membresiaJunta } from './junta-access';

/**
 * Exige que el usuario autenticado sea de la junta de `:idAsociacion`. Va después de `JwtAuthGuard`
 * y deja la membresía en `request.junta` para el handler (rutas del dashboard de asociación).
 */
@Injectable()
export class JuntaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const idAsociacion = Number(req.params?.idAsociacion);
    const userId = req.user?.userId;
    if (!Number.isInteger(idAsociacion) || typeof userId !== 'number') throw new ForbiddenException(JUNTA_FORBIDDEN_MESSAGE);
    const m = await membresiaJunta(this.prisma, idAsociacion, userId);
    if (!m) throw new ForbiddenException(JUNTA_FORBIDDEN_MESSAGE);
    req.junta = m;
    return true;
  }
}
