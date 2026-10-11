import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoUsuario, type Prisma } from '@prisma/client';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { SECURITY_EVENTS_DEFAULT_LIMIT } from './dto/list-security-events-query.dto';
import { TIPO_OBJETO_SEGURIDAD, TipoEventoSeguridad } from './tipos-evento-seguridad';

/**
 * FG01 (T-310): LECTOR de eventos de seguridad para el visor administrativo.
 *
 * Separado a propósito de `SecurityEventsService`, el writer best-effort: el
 * writer nunca falla hacia el llamador y no autoriza a nadie; el lector hace
 * lo contrario, exige un administrador vigente antes de tocar la bitácora y
 * propaga cualquier error.
 */
@Injectable()
export class SecurityEventsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ProjectPolicyService,
  ) {}

  async list(actorId: number) {
    await this.assertAdminVigente(actorId);
    return this.prisma.bitacoraAuditoria.findMany({
      where: { tipoObjeto: TIPO_OBJETO_SEGURIDAD, accion: { in: [...TipoEventoSeguridad.VALORES] } },
      select: { idAuditoria: true, accion: true, fechaEvento: true },
      orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
      take: SECURITY_EVENTS_DEFAULT_LIMIT,
    });
  }

  /**
   * El JWT solo prueba quién era el usuario al emitirse: la cuenta y el rol se
   * leen de la base en cada consulta. El rol lo decide la misma política que
   * el resto de la administración (`ProjectPolicyService.assertAdminTx`).
   * Una cuenta inexistente, no activa o sin el rol recibe el mismo 403.
   */
  private async assertAdminVigente(actorId: number): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: actorId },
      select: { estado: true },
    });
    if (usuario?.estado !== EstadoUsuario.ACTIVO) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }
    await this.policy.assertAdminTx(this.prisma as unknown as Prisma.TransactionClient, actorId);
  }
}
