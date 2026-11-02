import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';
import { CARGO_ETIQUETA, NIVEL_POR_CARGO } from './associations.rules';
import { CreateAsociacionDto } from './dto/create-asociacion.dto';
import { UpdateAsociacionDto } from './dto/update-asociacion.dto';
import { ActualizarJuntaDto, AsignarJuntaDto } from './dto/junta.dto';

export const ASOCIACION_NOT_FOUND_MESSAGE = 'Asociación no encontrada';
export const ASOCIACION_NOMBRE_DUPLICADO_MESSAGE = 'Ya existe una asociación con ese nombre';
export const CARRERAS_INVALIDAS_MESSAGE = 'Una o más carreras no existen';
export const USUARIO_NO_ELEGIBLE_MESSAGE = 'Solo se puede nombrar a usuarios activos';
export const CARGO_OCUPADO_MESSAGE = 'Ese cargo ya está ocupado en la junta';
export const USUARIO_YA_EN_JUNTA_MESSAGE = 'El usuario ya tiene un cargo en esta junta';
export const MIEMBRO_NO_ENCONTRADO_MESSAGE = 'El usuario no pertenece a la junta';
export const ASOCIACION_ARCHIVADA_JUNTA_MESSAGE = 'No se puede modificar la junta de una asociación archivada';

const incluirDetalle = {
  carreras: { include: { carrera: { select: { idCarrera: true, nombreCarrera: true } } } },
  junta: {
    orderBy: { idJuntaAsociacion: 'asc' },
    include: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } } },
  },
} satisfies Prisma.AsociacionInclude;

@Injectable()
export class AssociationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.asociacion.findMany({ orderBy: { nombre: 'asc' }, include: incluirDetalle });
  }

  async get(idAsociacion: number) {
    const a = await this.prisma.asociacion.findUnique({ where: { idAsociacion }, include: incluirDetalle });
    if (!a) throw new NotFoundException(ASOCIACION_NOT_FOUND_MESSAGE);
    return a;
  }

  async create(dto: CreateAsociacionDto, idAdmin: number) {
    await this.assertCarreras(dto.idsCarreras);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.asociacion.create({
          data: {
            nombre: dto.nombre,
            descripcion: dto.descripcion,
            logoUrl: dto.logoUrl,
            carreras: { create: dto.idsCarreras.map((idCarrera) => ({ idCarrera })) },
          },
          include: incluirDetalle,
        });
        await this.auditar(tx, idAdmin, 'ASOCIACION_CREADA', a.idAsociacion, { nombre: a.nombre, idsCarreras: dto.idsCarreras });
        return a;
      });
    } catch (e) {
      throw this.traducir(e);
    }
  }

  async update(idAsociacion: number, dto: UpdateAsociacionDto, idAdmin: number) {
    const actual = await this.get(idAsociacion);
    if (dto.idsCarreras) await this.assertCarreras(dto.idsCarreras);
    const { idsCarreras, ...campos } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (idsCarreras) {
          await tx.asociacionCarrera.deleteMany({ where: { idAsociacion } });
          await tx.asociacionCarrera.createMany({ data: idsCarreras.map((idCarrera) => ({ idAsociacion, idCarrera })) });
        }
        const a = await tx.asociacion.update({
          where: { idAsociacion },
          data: { ...campos, fechaActualizacion: new Date() },
          include: incluirDetalle,
        });
        const accion =
          dto.archivada === undefined || dto.archivada === actual.archivada
            ? 'ASOCIACION_EDITADA'
            : dto.archivada
              ? 'ASOCIACION_ARCHIVADA'
              : 'ASOCIACION_RESTAURADA';
        await this.auditar(tx, idAdmin, accion, idAsociacion, { cambios: { ...campos, idsCarreras } as Prisma.InputJsonObject });
        return a;
      });
    } catch (e) {
      throw this.traducir(e);
    }
  }

  async asignarJunta(idAsociacion: number, dto: AsignarJuntaDto, idAdmin: number) {
    const asociacion = await this.get(idAsociacion);
    if (asociacion.archivada) throw new BadRequestException(ASOCIACION_ARCHIVADA_JUNTA_MESSAGE);
    const usuario = await this.prisma.usuario.findUnique({ where: { idUsuario: dto.idUsuario }, select: { estado: true } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (usuario.estado !== 'ACTIVO') throw new BadRequestException(USUARIO_NO_ELEGIBLE_MESSAGE);
    const nivelPermiso = dto.nivelPermiso ?? NIVEL_POR_CARGO[dto.cargo];
    const effects: PostCommitEffect[] = [];
    try {
      const miembro = await this.prisma.$transaction(async (tx) => {
        const m = await tx.juntaAsociacion.create({
          data: { idAsociacion, idUsuario: dto.idUsuario, cargo: dto.cargo, nivelPermiso, asignadoPor: idAdmin },
        });
        await this.auditar(tx, idAdmin, 'JUNTA_ASIGNADA', idAsociacion, { idUsuario: dto.idUsuario, cargo: dto.cargo, nivelPermiso });
        await this.avisar(tx, effects, asociacion, dto.idUsuario, 'ASIGNADA', dto.cargo, nivelPermiso);
        return m;
      });
      await this.notifications.publishEffects(effects);
      return miembro;
    } catch (e) {
      throw this.traducir(e);
    }
  }

  async actualizarJunta(idAsociacion: number, idUsuario: number, dto: ActualizarJuntaDto, idAdmin: number) {
    const asociacion = await this.get(idAsociacion);
    if (asociacion.archivada) throw new BadRequestException(ASOCIACION_ARCHIVADA_JUNTA_MESSAGE);
    const actual = asociacion.junta.find((j) => j.idUsuario === idUsuario);
    if (!actual) throw new NotFoundException(MIEMBRO_NO_ENCONTRADO_MESSAGE);
    const cargo = dto.cargo ?? actual.cargo;
    // Cambiar de cargo sin indicar nivel reinicia al nivel por defecto del nuevo cargo.
    const nivelPermiso = dto.nivelPermiso ?? (dto.cargo ? NIVEL_POR_CARGO[cargo] : actual.nivelPermiso);
    const effects: PostCommitEffect[] = [];
    try {
      const miembro = await this.prisma.$transaction(async (tx) => {
        const m = await tx.juntaAsociacion.update({
          where: { idAsociacion_idUsuario: { idAsociacion, idUsuario } },
          data: { cargo, nivelPermiso, asignadoPor: idAdmin },
        });
        await this.auditar(tx, idAdmin, 'JUNTA_ACTUALIZADA', idAsociacion, {
          idUsuario,
          anterior: { cargo: actual.cargo, nivelPermiso: actual.nivelPermiso },
          nuevo: { cargo, nivelPermiso },
        });
        await this.avisar(tx, effects, asociacion, idUsuario, 'ACTUALIZADA', cargo, nivelPermiso);
        return m;
      });
      await this.notifications.publishEffects(effects);
      return miembro;
    } catch (e) {
      throw this.traducir(e);
    }
  }

  async quitarJunta(idAsociacion: number, idUsuario: number, idAdmin: number) {
    const asociacion = await this.get(idAsociacion);
    const actual = asociacion.junta.find((j) => j.idUsuario === idUsuario);
    if (!actual) throw new NotFoundException(MIEMBRO_NO_ENCONTRADO_MESSAGE);
    const effects: PostCommitEffect[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.juntaAsociacion.delete({ where: { idAsociacion_idUsuario: { idAsociacion, idUsuario } } });
      await this.auditar(tx, idAdmin, 'JUNTA_REMOVIDA', idAsociacion, { idUsuario, cargo: actual.cargo, nivelPermiso: actual.nivelPermiso });
      await this.avisar(tx, effects, asociacion, idUsuario, 'REMOVIDA', actual.cargo, null);
    });
    await this.notifications.publishEffects(effects);
    return { idAsociacion, idUsuario };
  }

  /** Juntas del usuario para el cambio de vista Estudiante/Asociación (las archivadas no se ofrecen). */
  async misJuntas(idUsuario: number) {
    const juntas = await this.prisma.juntaAsociacion.findMany({
      where: { idUsuario, asociacion: { archivada: false } },
      orderBy: { asociacion: { nombre: 'asc' } },
      include: { asociacion: { select: { idAsociacion: true, nombre: true, logoUrl: true } } },
    });
    return juntas.map((j) => ({
      idAsociacion: j.asociacion.idAsociacion,
      nombre: j.asociacion.nombre,
      logoUrl: j.asociacion.logoUrl,
      cargo: j.cargo,
      nivelPermiso: j.nivelPermiso,
    }));
  }

  private async assertCarreras(ids: number[]) {
    const n = await this.prisma.carrera.count({ where: { idCarrera: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException(CARRERAS_INVALIDAS_MESSAGE);
  }

  private auditar(tx: Prisma.TransactionClient, idAdmin: number, accion: string, idAsociacion: number, detalle: Prisma.InputJsonObject) {
    return tx.bitacoraAuditoria.create({
      data: { idUsuario: idAdmin, accion, tipoObjeto: 'ASOCIACION', idObjeto: String(idAsociacion), detalleJson: detalle },
    });
  }

  private avisar(
    tx: Prisma.TransactionClient,
    effects: PostCommitEffect[],
    asociacion: { idAsociacion: number; nombre: string },
    idUsuario: number,
    accion: 'ASIGNADA' | 'ACTUALIZADA' | 'REMOVIDA',
    cargo: keyof typeof CARGO_ETIQUETA,
    nivelPermiso: string | null,
  ) {
    return this.notifications.persistTemplateTx(
      tx,
      [idUsuario],
      'JUNTA_ASOCIACION',
      { idAsociacion: asociacion.idAsociacion, nombreAsociacion: asociacion.nombre, accion, cargo: CARGO_ETIQUETA[cargo], nivelPermiso },
      { add: (e) => effects.push(e) },
    );
  }

  private traducir(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const campos = String((e.meta as { target?: unknown })?.target ?? '');
      if (campos.includes('cargo')) return new ConflictException(CARGO_OCUPADO_MESSAGE);
      if (campos.includes('id_usuario')) return new ConflictException(USUARIO_YA_EN_JUNTA_MESSAGE);
      return new ConflictException(ASOCIACION_NOMBRE_DUPLICADO_MESSAGE);
    }
    return e;
  }
}
