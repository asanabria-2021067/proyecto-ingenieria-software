import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoUsuario, type Prisma } from '@prisma/client';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SECURITY_EVENTS_DEFAULT_LIMIT,
  type ListSecurityEventsQueryDto,
} from './dto/list-security-events-query.dto';
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

  async list(actorId: number, query: ListSecurityEventsQueryDto = {}) {
    await this.assertAdminVigente(actorId);

    const page = query.page ?? 1;
    const limit = query.limit ?? SECURITY_EVENTS_DEFAULT_LIMIT;
    const where = this.where(query);
    // Una sola transacción: la página y el total salen de la misma foto.
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bitacoraAuditoria.findMany({
        where,
        select: { idAuditoria: true, accion: true, fechaEvento: true },
        // idAuditoria desempata eventos del mismo instante: el orden es total y la paginación estable.
        orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bitacoraAuditoria.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit), tipos: [...TipoEventoSeguridad.VALORES] };
  }

  /**
   * `tipoObjeto` y el catálogo cerrado de acciones van SIEMPRE en el filtro:
   * la bitácora funcional de proyectos comparte la tabla y nunca sale por aquí.
   * `idUsuario` encuentra a la persona como actor o como cuenta afectada
   * (`idObjeto` guarda el id de la cuenta como texto).
   */
  private where(query: ListSecurityEventsQueryDto): Prisma.BitacoraAuditoriaWhereInput {
    return {
      tipoObjeto: TIPO_OBJETO_SEGURIDAD,
      accion: query.tipo ?? { in: [...TipoEventoSeguridad.VALORES] },
      ...(query.desde || query.hasta
        ? {
            fechaEvento: {
              ...(query.desde ? { gte: new Date(query.desde) } : {}),
              ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
            },
          }
        : {}),
      ...(query.idUsuario
        ? { OR: [{ idUsuario: query.idUsuario }, { idObjeto: String(query.idUsuario) }] }
        : {}),
    };
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
