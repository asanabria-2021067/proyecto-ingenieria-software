import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * T-234: "archivado" NO es un campo propio de Conversacion — se deriva de
 * `Proyecto.estadoProyecto`. Un proyecto llega a CERRADO por un único camino
 * (ProjectClosureReviewService.approveClosure, dentro de su propia
 * transacción — ver ese archivo), así que derivar el estado del chat de ahí
 * en vez de duplicarlo en una columna propia da dos cosas gratis, sin
 * migración ni escritura adicional: (1) el archivado queda atómico con el
 * cierre por construcción (no hay un segundo write que pueda fallar a
 * medias), y (2) si el proyecto alguna vez vuelve a un estado distinto de
 * CERRADO, el chat queda activo de nuevo sin ningún paso extra — no hace
 * falta un evento de "reapertura" explícito que hoy no existe en el dominio
 * (CERRADO es, hoy, un estado terminal: no hay ningún camino de código que
 * revierta un proyecto ya CERRADO a otro estado).
 */
function chatArchivado(estadoProyecto: EstadoProyecto): boolean {
  return estadoProyecto === EstadoProyecto.CERRADO;
}

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
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true },
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
      include: {
        participantes: { select: { idUsuario: true } },
        proyecto: { select: { estadoProyecto: true } },
      },
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
    const proyecto = await this.assertProjectMember(idProyecto, userId);
    const archivada = chatArchivado(proyecto.estadoProyecto);

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
          archivada,
        };
      }),
    );
  }

  async createConversation(idProyecto: number, userId: number, dto: CreateConversationDto) {
    const proyecto = await this.assertProjectMember(idProyecto, userId);
    // T-234: sin este chequeo, abrir una conversación NUEVA sería una vía
    // libre para seguir mandando mensajes en un proyecto ya cerrado.
    if (chatArchivado(proyecto.estadoProyecto)) {
      throw new ForbiddenException(
        'Este proyecto ya cerró: no se pueden crear conversaciones nuevas.',
      );
    }

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

    const conversacion = await this.prisma.conversacion.create({
      data: {
        idProyecto,
        tipo: dto.tipo,
        nombre: dto.tipo === 'GRUPAL' ? dto.nombre?.trim() || 'Grupo' : null,
        creadaPor: userId,
        participantes: { create: idsUnicos.map((idUsuario) => ({ idUsuario })) },
      },
      include: { participantes: { select: { idUsuario: true, usuario: USUARIO_SELECT } } },
    });

    const destinatarios = idsUnicos.filter((id) => id !== userId);
    this.gateway.notifyConversationCreated(conversacion.idConversacion, destinatarios);

    return conversacion;
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
    // T-234: único punto real de creación de mensajes (REST) — el gateway de
    // socket nunca crea mensajes por su cuenta, solo retransmite los que
    // este método ya persistió (broadcastMessage, más abajo, solo se llama
    // desde aquí). Bloquear acá cubre API y socket a la vez: si esto lanza,
    // broadcastMessage nunca se invoca, así que tampoco sale un evento en
    // vivo para un mensaje que nunca existió.
    if (chatArchivado(conversacion.proyecto.estadoProyecto)) {
      throw new ForbiddenException(
        'Esta conversación está archivada: el proyecto ya cerró y no se pueden enviar mensajes nuevos.',
      );
    }

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
