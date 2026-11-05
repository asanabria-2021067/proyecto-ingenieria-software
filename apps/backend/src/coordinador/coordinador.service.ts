import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuardarAlcanceDto } from './dto/alcance-coordinador.dto';
import {
  alcanceDelActor,
  carrerasCubiertas,
  proyectoEnAlcanceWhere,
  REGLA_ALCANCE_COORDINADOR,
  ROL_COORDINADOR,
} from './coordinador-alcance';

export const ALCANCE_ADMIN_ONLY_MESSAGE = 'Solo un administrador asigna el alcance de un coordinador';

@Injectable()
export class CoordinadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async requireAdmin(idUsuario: number) {
    const rol = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    if (!rol) throw new ForbiddenException(ALCANCE_ADMIN_ONLY_MESSAGE);
  }

  private async coordinadorOrThrow(idUsuario: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: { rolesAcceso: { where: { rolAcceso: { nombrePerfil: ROL_COORDINADOR } }, select: { idUsuarioRolAcceso: true } } },
    });
    if (!usuario) throw new NotFoundException(`Usuario ${idUsuario} no encontrado`);
    if (usuario.rolesAcceso.length === 0) throw new BadRequestException('El usuario no es coordinador académico');
  }

  private async detalle(idUsuario: number) {
    const asignaciones = await this.prisma.alcanceCoordinador.findMany({
      where: { idUsuario },
      select: { idCarrera: true, facultad: true },
    });
    const carreraIds = asignaciones.flatMap((a) => (a.idCarrera === null ? [] : [a.idCarrera]));
    const facultades = asignaciones.flatMap((a) => (a.facultad === null ? [] : [a.facultad]));
    const catalogo = await this.prisma.carrera.findMany({
      where: { OR: [{ idCarrera: { in: carreraIds } }, { facultad: { in: facultades } }] },
      orderBy: { nombreCarrera: 'asc' },
      select: { idCarrera: true, nombreCarrera: true, facultad: true },
    });
    const cubiertas = new Set(carrerasCubiertas(asignaciones, catalogo));
    return {
      idUsuario,
      carreraIds,
      facultades,
      carreras: catalogo.filter((c) => cubiertas.has(c.idCarrera)),
      regla: REGLA_ALCANCE_COORDINADOR,
    };
  }

  async leerAlcance(actorId: number, idUsuario: number) {
    await this.requireAdmin(actorId);
    await this.coordinadorOrThrow(idUsuario);
    return this.detalle(idUsuario);
  }

  /** Reemplaza el alcance completo. Solo un administrador; queda en bitácora y se avisa al coordinador. */
  async guardarAlcance(actorId: number, idUsuario: number, dto: GuardarAlcanceDto) {
    await this.requireAdmin(actorId);
    await this.coordinadorOrThrow(idUsuario);

    const [carreras, facultades] = await Promise.all([
      this.prisma.carrera.findMany({ where: { idCarrera: { in: dto.carreraIds } }, select: { nombreCarrera: true } }),
      this.prisma.carrera.findMany({
        where: { facultad: { in: dto.facultades } },
        distinct: ['facultad'],
        select: { facultad: true },
      }),
    ]);
    if (carreras.length !== dto.carreraIds.length) throw new BadRequestException('Alguna carrera no existe');
    if (facultades.length !== dto.facultades.length) throw new BadRequestException('Alguna facultad no existe');

    const antes = await this.detalle(idUsuario);
    const igual =
      antes.carreraIds.length === dto.carreraIds.length &&
      antes.carreraIds.every((c) => dto.carreraIds.includes(c)) &&
      antes.facultades.length === dto.facultades.length &&
      antes.facultades.every((f) => dto.facultades.includes(f));
    if (!igual) {
      await this.prisma.$transaction(async (tx) => {
        await tx.alcanceCoordinador.deleteMany({ where: { idUsuario } });
        await tx.alcanceCoordinador.createMany({
          data: [
            ...dto.carreraIds.map((idCarrera) => ({ idUsuario, idCarrera, asignadoPor: actorId })),
            ...dto.facultades.map((facultad) => ({ idUsuario, facultad, asignadoPor: actorId })),
          ],
        });
        await tx.bitacoraAuditoria.create({
          data: {
            idUsuario: actorId,
            accion: 'COORDINADOR_ALCANCE_ASIGNADO',
            tipoObjeto: 'USUARIO',
            idObjeto: String(idUsuario),
            detalleJson: {
              anterior: { carreraIds: antes.carreraIds, facultades: antes.facultades },
              nuevo: { carreraIds: dto.carreraIds, facultades: dto.facultades },
            },
          },
        });
        await this.notifications.notifyFromTemplate(
          [idUsuario],
          'ALCANCE_COORDINADOR',
          { carreras: carreras.map((c) => c.nombreCarrera), facultades: dto.facultades },
          tx,
        );
      });
    }
    return this.detalle(idUsuario);
  }

  /** Alcance del propio actor (administrador: `todas`, sin restricción). */
  async miAlcance(userId: number) {
    const ids = await alcanceDelActor(this.prisma, userId);
    if (ids === undefined) return { todas: true, carreras: [], regla: REGLA_ALCANCE_COORDINADOR };
    const carreras = await this.prisma.carrera.findMany({
      where: { idCarrera: { in: ids } },
      orderBy: { nombreCarrera: 'asc' },
      select: { idCarrera: true, nombreCarrera: true, facultad: true },
    });
    return { todas: false, carreras, regla: REGLA_ALCANCE_COORDINADOR };
  }

  /**
   * Mismos conteos que el panel del admin (revisiones `EN_REVISION`, cierres todo `EN_SOLICITUD_CIERRE`), filtrados
   * al alcance; la bandeja de cierres del coordinador lista esa misma población.
   */
  async pendientes(userId: number) {
    const ids = await alcanceDelActor(this.prisma, userId);
    const enAlcance = ids ? proyectoEnAlcanceWhere(ids, userId) : {};
    const [revisiones, cierres] = await Promise.all([
      this.prisma.proyecto.count({ where: { estadoProyecto: EstadoProyecto.EN_REVISION, eliminadoEn: null, ...enAlcance } }),
      this.prisma.proyecto.count({
        where: {
          estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
          eliminadoEn: null,
          ...enAlcance,
        },
      }),
    ]);
    const items = [
      { clave: 'revisiones', total: revisiones },
      { clave: 'cierres', total: cierres },
    ];
    return { total: revisiones + cierres, items };
  }
}
