import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { CreateChannelDto } from './dto/create-channel.dto';

export const CANAL_GENERAL = 'general';

const USUARIO_SELECT = {
  select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
} as const;

/**
 * Canales del proyecto: Conversacion con `esCanal`. `#general` se crea de forma
 * lazy e idempotente (primer acceso o cambio de membresía) y contiene a todos
 * los miembros; los demás los crea el líder (Proyecto.creadoPor).
 *
 * Invariante: miembros de un canal ⊆ líder + participaciones ACTIVO. La
 * invariante se sostiene con `sincronizar`, que se llama al aceptar/salir de
 * un proyecto y al listar canales, y además se verifica en vivo al leer o
 * escribir (ChatService.getConversacionOrThrow), así que un cambio de
 * membresía nunca deja acceso colgado aunque la sincronización no haya corrido.
 */
@Injectable()
export class ChatCanalesService {
  private readonly logger = new Logger(ChatCanalesService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
  ) {}

  private async getProyecto(idProyecto: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    return proyecto;
  }

  /** Líder + participantes con participación ACTIVO en algún rol del proyecto. */
  private async miembrosDelProyecto(idProyecto: number, creadoPor: number): Promise<Set<number>> {
    const filas = await this.prisma.participacionProyecto.findMany({
      where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
      select: { idUsuario: true },
    });
    return new Set([creadoPor, ...filas.map((f) => f.idUsuario)]);
  }

  private async assertLider(idProyecto: number, userId: number) {
    const proyecto = await this.getProyecto(idProyecto);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('Solo el líder del proyecto puede administrar canales');
    }
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO) {
      throw new ForbiddenException('Este proyecto ya cerró: no se pueden administrar canales.');
    }
    return proyecto;
  }

  private async getCanalOrThrow(idProyecto: number, idConversacion: number) {
    const canal = await this.prisma.conversacion.findFirst({
      where: { idConversacion, idProyecto, esCanal: true, eliminadaEn: null },
      select: { idConversacion: true, nombreCanal: true, participantes: { select: { idUsuario: true } } },
    });
    if (!canal) throw new NotFoundException(`Canal con id ${idConversacion} no encontrado`);
    return canal;
  }

  private assertMiembrosDelProyecto(ids: number[], miembros: Set<number>) {
    const ajeno = ids.find((id) => !miembros.has(id));
    if (ajeno !== undefined) {
      throw new BadRequestException(`El usuario ${ajeno} no participa activamente en este proyecto`);
    }
  }

  /**
   * Crea `#general` si falta, agrega al resto de miembros a `#general` y saca
   * de TODOS los canales a quien ya no es miembro del proyecto. Idempotente.
   */
  async sincronizar(idProyecto: number) {
    const proyecto = await this.getProyecto(idProyecto);
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO) return;
    const miembros = await this.miembrosDelProyecto(idProyecto, proyecto.creadoPor);

    let general = await this.prisma.conversacion.findFirst({
      where: { idProyecto, esCanal: true, nombreCanal: CANAL_GENERAL },
      select: { idConversacion: true },
    });
    if (!general) {
      try {
        general = await this.prisma.conversacion.create({
          data: {
            idProyecto,
            tipo: 'GRUPAL',
            nombre: CANAL_GENERAL,
            nombreCanal: CANAL_GENERAL,
            esCanal: true,
            creadaPor: proyecto.creadoPor,
          },
          select: { idConversacion: true },
        });
      } catch (error) {
        // Carrera entre dos accesos simultáneos: el unique deja ganar a uno solo.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        general = await this.prisma.conversacion.findFirstOrThrow({
          where: { idProyecto, esCanal: true, nombreCanal: CANAL_GENERAL },
          select: { idConversacion: true },
        });
      }
    }

    await this.prisma.conversacionParticipante.createMany({
      data: [...miembros].map((idUsuario) => ({ idConversacion: general.idConversacion, idUsuario })),
      skipDuplicates: true,
    });

    const obsoletos = await this.prisma.conversacionParticipante.findMany({
      where: {
        idUsuario: { notIn: [...miembros] },
        conversacion: { idProyecto, esCanal: true, eliminadaEn: null },
      },
      select: { idConversacion: true, idUsuario: true },
    });
    if (obsoletos.length === 0) return;
    await this.prisma.conversacionParticipante.deleteMany({
      where: { OR: obsoletos.map((o) => ({ idConversacion: o.idConversacion, idUsuario: o.idUsuario })) },
    });
    for (const o of obsoletos) this.gateway.removeFromConversation(o.idConversacion, [o.idUsuario]);
  }

  /** Para engancharse a flujos ajenos (post-commit): un fallo del chat nunca revierte ni rompe la operación principal. */
  async sincronizarSinFallar(idProyecto: number) {
    try {
      await this.sincronizar(idProyecto);
    } catch (error) {
      this.logger.warn(`No se pudo sincronizar los canales del proyecto ${idProyecto}: ${String(error)}`);
    }
  }

  /** Crea `#general` en los proyectos activos del usuario que aún no lo tienen (p. ej. proyectos nuevos). */
  async asegurarGeneral(userId: number) {
    const faltantes = await this.prisma.proyecto.findMany({
      where: {
        eliminadoEn: null,
        estadoProyecto: { not: EstadoProyecto.CERRADO },
        OR: [
          { creadoPor: userId },
          { roles: { some: { participaciones: { some: { idUsuario: userId, estadoParticipacion: 'ACTIVO' } } } } },
        ],
        conversaciones: { none: { esCanal: true, nombreCanal: CANAL_GENERAL } },
      },
      select: { idProyecto: true },
    });
    for (const { idProyecto } of faltantes) await this.sincronizarSinFallar(idProyecto);
  }

  /** Canales del proyecto que integra el usuario (los demás no son visibles). */
  async listarCanales(idProyecto: number, userId: number) {
    const proyecto = await this.getProyecto(idProyecto);
    const miembros = await this.miembrosDelProyecto(idProyecto, proyecto.creadoPor);
    if (!miembros.has(userId)) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }
    await this.sincronizar(idProyecto);

    const canales = await this.prisma.conversacion.findMany({
      where: {
        idProyecto,
        esCanal: true,
        eliminadaEn: null,
        participantes: { some: { idUsuario: userId } },
      },
      include: { participantes: { select: { idUsuario: true, usuario: USUARIO_SELECT } } },
      orderBy: { creadaEn: 'asc' },
    });
    return canales.map((c) => ({
      idConversacion: c.idConversacion,
      idProyecto: c.idProyecto,
      nombre: c.nombreCanal,
      esGeneral: c.nombreCanal === CANAL_GENERAL,
      miembros: c.participantes.map((p) => p.usuario),
    }));
  }

  async crearCanal(idProyecto: number, userId: number, dto: CreateChannelDto) {
    const proyecto = await this.assertLider(idProyecto, userId);
    const miembros = await this.miembrosDelProyecto(idProyecto, proyecto.creadoPor);
    const ids = Array.from(new Set([...(dto.idsMiembros ?? []), userId]));
    this.assertMiembrosDelProyecto(ids, miembros);

    try {
      const canal = await this.prisma.conversacion.create({
        data: {
          idProyecto,
          tipo: 'GRUPAL',
          nombre: dto.nombre,
          nombreCanal: dto.nombre,
          esCanal: true,
          creadaPor: userId,
          participantes: { create: ids.map((idUsuario) => ({ idUsuario })) },
        },
        select: { idConversacion: true, nombreCanal: true },
      });
      this.gateway.notifyConversationCreated(
        canal.idConversacion,
        ids.filter((id) => id !== userId),
      );
      return { idConversacion: canal.idConversacion, idProyecto, nombre: canal.nombreCanal, esGeneral: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe un canal llamado #${dto.nombre}`);
      }
      throw error;
    }
  }

  async agregarMiembros(idProyecto: number, idConversacion: number, userId: number, idsUsuarios: number[]) {
    const proyecto = await this.assertLider(idProyecto, userId);
    const canal = await this.getCanalOrThrow(idProyecto, idConversacion);
    const miembros = await this.miembrosDelProyecto(idProyecto, proyecto.creadoPor);
    this.assertMiembrosDelProyecto(idsUsuarios, miembros);

    const nuevos = idsUsuarios.filter((id) => !canal.participantes.some((p) => p.idUsuario === id));
    if (nuevos.length === 0) return;
    await this.prisma.conversacionParticipante.createMany({
      data: nuevos.map((idUsuario) => ({ idConversacion, idUsuario })),
      skipDuplicates: true,
    });
    this.gateway.notifyConversationCreated(idConversacion, nuevos);
  }

  async quitarMiembro(idProyecto: number, idConversacion: number, userId: number, idUsuario: number) {
    const proyecto = await this.assertLider(idProyecto, userId);
    const canal = await this.getCanalOrThrow(idProyecto, idConversacion);
    if (canal.nombreCanal === CANAL_GENERAL) {
      throw new ForbiddenException('#general contiene a todos los integrantes del proyecto');
    }
    // El líder siempre queda: así un canal nunca se queda sin miembros.
    if (idUsuario === proyecto.creadoPor) {
      throw new BadRequestException('El líder del proyecto no puede salir de los canales');
    }
    if (!canal.participantes.some((p) => p.idUsuario === idUsuario)) {
      throw new NotFoundException('El usuario no es miembro de este canal');
    }
    await this.prisma.conversacionParticipante.delete({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario } },
    });
    this.gateway.removeFromConversation(idConversacion, [idUsuario]);
  }
}
