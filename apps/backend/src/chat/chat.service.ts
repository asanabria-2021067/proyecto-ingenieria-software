import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';

const USUARIO_SELECT = {
  select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
} as const;

const MENSAJE_SELECT = {
  idMensaje: true,
  idConversacion: true,
  contenido: true,
  enviadoEn: true,
  remitente: USUARIO_SELECT,
} as const;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
  ) {}

  /** Líder o participante con participación ACTIVO en algún rol del proyecto. */
  private async assertProjectMember(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    if (proyecto.creadoPor === userId) return proyecto;

    const participa = await this.prisma.participacionProyecto.findFirst({
      where: { idUsuario: userId, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
      select: { idParticipacion: true },
    });
    if (!participa) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }
    return proyecto;
  }

  private async getConversacionOrThrow(idProyecto: number, idConversacion: number, userId: number) {
    const conversacion = await this.prisma.conversacion.findFirst({
      where: { idConversacion, idProyecto },
      include: { participantes: { select: { idUsuario: true } } },
    });
    if (!conversacion) {
      throw new NotFoundException(`Conversación con id ${idConversacion} no encontrada`);
    }
    if (!conversacion.participantes.some((p) => p.idUsuario === userId)) {
      throw new ForbiddenException('No participas en esta conversación');
    }
    return conversacion;
  }

  async listConversations(idProyecto: number, userId: number) {
    await this.assertProjectMember(idProyecto, userId);

    const conversaciones = await this.prisma.conversacion.findMany({
      where: { idProyecto, participantes: { some: { idUsuario: userId } } },
      include: {
        participantes: { select: { idUsuario: true, ultimaLecturaEn: true, usuario: USUARIO_SELECT } },
        mensajes: { orderBy: { enviadoEn: 'desc' }, take: 1, select: MENSAJE_SELECT },
      },
      orderBy: { creadaEn: 'desc' },
    });

    return Promise.all(
      conversaciones.map(async (c) => {
        const propia = c.participantes.find((p) => p.idUsuario === userId);
        const noLeidos = await this.prisma.mensajeChat.count({
          where: {
            idConversacion: c.idConversacion,
            idRemitente: { not: userId },
            ...(propia?.ultimaLecturaEn ? { enviadoEn: { gt: propia.ultimaLecturaEn } } : {}),
          },
        });
        return {
          idConversacion: c.idConversacion,
          tipo: c.tipo,
          nombre: c.nombre,
          participantes: c.participantes.map((p) => p.usuario),
          ultimoMensaje: c.mensajes[0] ?? null,
          noLeidos,
        };
      }),
    );
  }

  async createConversation(idProyecto: number, userId: number, dto: CreateConversationDto) {
    const proyecto = await this.assertProjectMember(idProyecto, userId);

    const idsUnicos = Array.from(new Set([...dto.idsParticipantes, userId]));
    if (idsUnicos.length < 2) {
      throw new BadRequestException('Selecciona al menos un participante además de ti');
    }
    if (dto.tipo === 'INDIVIDUAL' && idsUnicos.length !== 2) {
      throw new BadRequestException('Una conversación individual debe tener exactamente dos participantes');
    }

    for (const idUsuario of idsUnicos) {
      if (idUsuario === proyecto.creadoPor) continue;
      const participa = await this.prisma.participacionProyecto.findFirst({
        where: { idUsuario, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
        select: { idParticipacion: true },
      });
      if (!participa) {
        throw new BadRequestException(`El usuario ${idUsuario} no participa activamente en este proyecto`);
      }
    }

    if (dto.tipo === 'INDIVIDUAL') {
      const existente = await this.prisma.conversacion.findFirst({
        where: {
          idProyecto,
          tipo: 'INDIVIDUAL',
          AND: idsUnicos.map((idUsuario) => ({ participantes: { some: { idUsuario } } })),
        },
        include: { participantes: { select: { idUsuario: true, usuario: USUARIO_SELECT } } },
      });
      if (existente) return existente;
    }

    return this.prisma.conversacion.create({
      data: {
        idProyecto,
        tipo: dto.tipo,
        nombre: dto.tipo === 'GRUPAL' ? dto.nombre?.trim() || 'Grupo' : null,
        creadaPor: userId,
        participantes: { create: idsUnicos.map((idUsuario) => ({ idUsuario })) },
      },
      include: { participantes: { select: { idUsuario: true, usuario: USUARIO_SELECT } } },
    });
  }

  /** Historial paginado: 30 mensajes más recientes, o los 30 anteriores a `cursorId`. */
  async getMessages(idProyecto: number, idConversacion: number, userId: number, cursorId?: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const mensajes = await this.prisma.mensajeChat.findMany({
      where: { idConversacion, ...(cursorId ? { idMensaje: { lt: cursorId } } : {}) },
      orderBy: { idMensaje: 'desc' },
      take: 30,
      select: MENSAJE_SELECT,
    });
    return mensajes.reverse();
  }

  async createMessage(idProyecto: number, idConversacion: number, userId: number, contenido: string) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);

    const mensaje = await this.prisma.mensajeChat.create({
      data: { idConversacion, idRemitente: userId, contenido: contenido.trim() },
      select: MENSAJE_SELECT,
    });

    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { ultimaLecturaEn: mensaje.enviadoEn },
    });

    const destinatarios = conversacion.participantes.map((p) => p.idUsuario).filter((id) => id !== userId);
    this.gateway.broadcastMessage(idConversacion, destinatarios, mensaje);

    return mensaje;
  }

  async markRead(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { ultimaLecturaEn: new Date() },
    });
  }
}
