import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoUsuario, type Prisma } from '@prisma/client';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SECURITY_EVENTS_DEFAULT_LIMIT,
  type ListSecurityEventsQueryDto,
} from './dto/list-security-events-query.dto';
import {
  cuentaAfectadaId,
  toSecurityEventDto,
  type SecurityEventDto,
  type SecurityEventRow,
  type SecurityEventsPageDto,
} from './dto/security-event.dto';
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

  async list(actorId: number, query: ListSecurityEventsQueryDto = {}): Promise<SecurityEventsPageDto> {
    await this.assertAdminVigente(actorId);

    const page = query.page ?? 1;
    const limit = query.limit ?? SECURITY_EVENTS_DEFAULT_LIMIT;
    const where = this.where(query);
    // Una sola transacción: la página y el total salen de la misma foto.
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.bitacoraAuditoria.findMany({
        where,
        // `detalleJson` se lee para proyectarlo; nunca sale tal cual (ver security-event.dto.ts).
        select: {
          idAuditoria: true,
          accion: true,
          idUsuario: true,
          idObjeto: true,
          detalleJson: true,
          ipOrigen: true,
          fechaEvento: true,
        },
        // idAuditoria desempata eventos del mismo instante: el orden es total y la paginación estable.
        orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bitacoraAuditoria.count({ where }),
    ]);

    const nombres = await this.nombres(filas);
    const data = filas
      .map((fila) => toSecurityEventDto(fila, nombres))
      .filter((evento): evento is SecurityEventDto => evento !== null);

    return { data, total, page, totalPages: Math.ceil(total / limit), tipos: [...TipoEventoSeguridad.VALORES] };
  }

  /** Nombres de actores y cuentas afectadas de la página, en una sola consulta. */
  private async nombres(filas: SecurityEventRow[]): Promise<Map<number, string>> {
    const ids = new Set<number>();
    for (const fila of filas) {
      const afectada = cuentaAfectadaId(fila.idObjeto);
      if (fila.idUsuario !== null) ids.add(fila.idUsuario);
      if (afectada !== null) ids.add(afectada);
    }
    if (ids.size === 0) return new Map();
    const usuarios = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: [...ids] } },
      select: { idUsuario: true, nombre: true, apellido: true },
    });
    return new Map(usuarios.map((usuario) => [usuario.idUsuario, `${usuario.nombre} ${usuario.apellido}`.trim()]));
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
