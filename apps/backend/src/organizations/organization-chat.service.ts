import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EstadoMembresia, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService, MENSAJE_CON_CITA_SELECT, conResumenDeCita } from '../chat/chat.service';
import { ROLES_GESTION, assertActiva, assertRol, assertVisible, cargarContexto } from './organization-access';

export const CANAL_GENERAL_ORGANIZACION = 'general';

/**
 * Chat de la organización: un canal `#general` (Conversacion con idOrganizacion)
 * con todos los miembros activos, Lectura incluido. Reusa Conversacion,
 * MensajeChat y el gateway del chat de proyecto. La membresía se verifica en
 * vivo al leer y escribir, así que `sincronizar` solo mantiene la lista de
 * participantes al día (idempotente).
 */
@Injectable()
export class OrganizationChatService {
  private readonly logger = new Logger(OrganizationChatService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
    private chat: ChatService,
  ) {}

  /** Crea `#general` si falta, agrega a los miembros activos y saca a quien ya no lo es. */
  async sincronizar(idOrganizacion: number): Promise<number> {
    const org = await this.prisma.organizacion.findUniqueOrThrow({
      where: { idOrganizacion },
      select: { creadaPor: true },
    });
    const miembros = await this.prisma.usuarioOrganizacion.findMany({
      where: { idOrganizacion, estadoMembresia: EstadoMembresia.ACTIVA },
      select: { idUsuario: true },
    });
    const ids = miembros.map((m) => m.idUsuario);

    let general = await this.prisma.conversacion.findFirst({
      where: { idOrganizacion, esCanal: true, nombreCanal: CANAL_GENERAL_ORGANIZACION },
      select: { idConversacion: true },
    });
    if (!general) {
      try {
        general = await this.prisma.conversacion.create({
          data: {
            idOrganizacion,
            tipo: 'GRUPAL',
            nombre: CANAL_GENERAL_ORGANIZACION,
            nombreCanal: CANAL_GENERAL_ORGANIZACION,
            esCanal: true,
            creadaPor: org.creadaPor,
          },
          select: { idConversacion: true },
        });
      } catch (error) {
        // Carrera entre dos accesos simultáneos: el unique deja ganar a uno solo.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        general = await this.prisma.conversacion.findFirstOrThrow({
          where: { idOrganizacion, esCanal: true, nombreCanal: CANAL_GENERAL_ORGANIZACION },
          select: { idConversacion: true },
        });
      }
    }
    const { idConversacion } = general;

    const actuales = await this.prisma.conversacionParticipante.findMany({
      where: { idConversacion },
      select: { idUsuario: true },
    });
    const yaEstan = new Set(actuales.map((p) => p.idUsuario));
    const nuevos = ids.filter((id) => !yaEstan.has(id));
    if (nuevos.length > 0) {
      await this.prisma.conversacionParticipante.createMany({
        data: nuevos.map((idUsuario) => ({ idConversacion, idUsuario })),
        skipDuplicates: true,
      });
      this.gateway.notifyConversationCreated(idConversacion, nuevos);
    }
    const sobran = [...yaEstan].filter((id) => !ids.includes(id));
    if (sobran.length > 0) {
      await this.prisma.conversacionParticipante.deleteMany({ where: { idConversacion, idUsuario: { in: sobran } } });
      this.gateway.removeFromConversation(idConversacion, sobran);
    }
    return idConversacion;
  }

  /** Para engancharse tras el commit de otro flujo: un fallo del chat nunca rompe la operación principal. */
  async sincronizarSinFallar(idOrganizacion: number): Promise<void> {
    try {
      await this.sincronizar(idOrganizacion);
    } catch (error) {
      this.logger.warn(`No se pudo sincronizar el chat de la organización ${idOrganizacion}: ${String(error)}`);
    }
  }

  private async asegurarMiembro(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertVisible(ctx);
    if (!ctx.rol) throw new ForbiddenException('Solo los miembros pueden usar el chat de la organización');
    return ctx;
  }

  async obtenerCanal(userId: number, idOrganizacion: number) {
    const ctx = await this.asegurarMiembro(userId, idOrganizacion);
    const idConversacion = await this.sincronizar(idOrganizacion);
    const canal = await this.prisma.conversacion.findUniqueOrThrow({
      where: { idConversacion },
      select: {
        idConversacion: true,
        nombreCanal: true,
        participantes: { select: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } } },
      },
    });
    return {
      idConversacion: canal.idConversacion,
      idOrganizacion,
      nombre: canal.nombreCanal,
      archivada: ctx.org.estadoOrganizacion !== 'ACTIVA',
      miembros: canal.participantes.map((p) => p.usuario),
    };
  }

  async mensajes(userId: number, idOrganizacion: number, cursorId?: number) {
    await this.asegurarMiembro(userId, idOrganizacion);
    const idConversacion = await this.sincronizar(idOrganizacion);
    return this.chat.mensajesDe(idConversacion, userId, cursorId);
  }

  async fijados(userId: number, idOrganizacion: number) {
    await this.asegurarMiembro(userId, idOrganizacion);
    return this.chat.fijadosDe(await this.sincronizar(idOrganizacion));
  }

  /** Solo Propietario y Administradores fijan o desfijan en el chat de la organización. */
  async fijar(userId: number, idOrganizacion: number, idMensaje: number, fijar: boolean) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario y los administradores pueden fijar mensajes');
    assertActiva(ctx);
    const idConversacion = await this.sincronizar(idOrganizacion);
    const participantes = await this.prisma.conversacionParticipante.findMany({
      where: { idConversacion },
      select: { idUsuario: true },
    });
    return this.chat.aplicarFijado(idConversacion, idMensaje, fijar, participantes.map((p) => p.idUsuario));
  }

  async enviar(userId: number, idOrganizacion: number, contenido: string) {
    assertActiva(await this.asegurarMiembro(userId, idOrganizacion));
    const idConversacion = await this.sincronizar(idOrganizacion);
    const mensaje = conResumenDeCita(
      await this.prisma.$transaction(async (tx) => {
        const creado = await tx.mensajeChat.create({
          data: { idConversacion, idRemitente: userId, contenido },
          select: MENSAJE_CON_CITA_SELECT,
        });
        await tx.conversacionParticipante.update({
          where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
          data: { ultimaLecturaEn: creado.enviadoEn },
        });
        return creado;
      }),
    );
    const participantes = await this.prisma.conversacionParticipante.findMany({
      where: { idConversacion },
      select: { idUsuario: true },
    });
    this.gateway.broadcastMessage(
      idConversacion,
      participantes.map((p) => p.idUsuario).filter((id) => id !== userId),
      mensaje,
    );
    return mensaje;
  }
}
