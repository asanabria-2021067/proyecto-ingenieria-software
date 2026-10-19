import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoProyecto, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CHAT_STORAGE_PORT, type ChatStoragePort } from '../storage/chat-storage.port';
import { ChatGateway } from './chat.gateway';
import { ADJUNTO_MAX_BYTES, validarAdjunto, type ArchivoSubido } from './chat-adjuntos';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListArchivedConversationsQueryDto } from './dto/list-archived-conversations-query.dto';
import { DuracionSilencio } from './dto/silenciar-conversation.dto';
import { ListLinksQueryDto } from './dto/list-links-query.dto';
import { extraerEnlaces } from './extract-links';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { ListSavedMessagesQueryDto } from './dto/list-saved-messages-query.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { estaEnNoMolestar, estaSilenciada } from './chat-silencio.util';
import { UpdateNoMolestarDto } from './dto/update-no-molestar.dto';
import { UpdateChatThemeDto } from './dto/update-chat-theme.dto';
import { ESTADO_CHAT_SELECT, estadoVigente } from './chat-estado.service';

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

// Solo en los listados de participantes de conversaciones del usuario (privacidad del estado).
const PARTICIPANTE_USUARIO = {
  select: { ...USUARIO_SELECT.select, estadoChat: ESTADO_CHAT_SELECT },
} as const;

function conEstado<T extends { estadoChat: Parameters<typeof estadoVigente>[0] }>({ estadoChat, ...usuario }: T) {
  return { ...usuario, estado: estadoVigente(estadoChat) };
}

const MENSAJE_SELECT = {
  idMensaje: true,
  idConversacion: true,
  contenido: true,
  enviadoEn: true,
  editadoEn: true,
  eliminadoEn: true,
  remitente: USUARIO_SELECT,
  // Solo metadatos: la clave de almacenamiento y las URL nunca salen en el listado.
  adjunto: { select: { idAdjunto: true, nombreOriginal: true, mime: true, tamanoBytes: true } },
} as const;

const URL_ADJUNTO_TTL_SEGUNDOS = 60;

const MENSAJE_CON_CITA_SELECT = {
  ...MENSAJE_SELECT,
  idMensajeCitado: true,
  citado: { select: { idMensaje: true, contenido: true, eliminadoEn: true, remitente: USUARIO_SELECT } },
} as const;

const EXTRACTO_CITA_MAX = 120;

/** Reemplaza el mensaje citado completo por un resumen (id, remitente, extracto). */
function conResumenDeCita<
  T extends { citado: { idMensaje: number; contenido: string; eliminadoEn: Date | null; remitente: unknown } | null },
>(
  mensaje: T,
) {
  const { citado, ...resto } = mensaje;
  if (!citado) return { ...resto, citado: null };
  const texto = ocultarEliminado(citado).contenido.replace(/\s+/g, ' ').trim();
  const extracto = texto.length > EXTRACTO_CITA_MAX ? `${texto.slice(0, EXTRACTO_CITA_MAX)}…` : texto;
  return {
    ...resto,
    citado: {
      idMensaje: citado.idMensaje,
      remitente: citado.remitente,
      extracto,
      ...(citado.eliminadoEn ? { eliminado: true } : {}),
    },
  };
}

const REACCIONES_SELECT = {
  select: { emoji: true, idUsuario: true },
  orderBy: { idReaccion: 'asc' },
} as const;

/** Agrupa por emoji, en el orden de la primera reacción de cada uno. */
export function agruparReacciones(filas: { emoji: string; idUsuario: number }[]) {
  const grupos = new Map<string, number[]>();
  for (const { emoji, idUsuario } of filas) grupos.set(emoji, [...(grupos.get(emoji) ?? []), idUsuario]);
  return [...grupos].map(([emoji, idsUsuarios]) => ({ emoji, count: idsUsuarios.length, idsUsuarios }));
}

function reaccionesParaUsuario(grupos: ReturnType<typeof agruparReacciones>, userId: number) {
  return grupos.map(({ emoji, count, idsUsuarios }) => ({
    emoji,
    count,
    reaccionadoPorMi: idsUsuarios.includes(userId),
  }));
}

/** El contenido de un mensaje eliminado nunca sale del servidor. */
function ocultarEliminado<T extends { contenido: string; eliminadoEn: Date | null }>(mensaje: T): T {
  return mensaje.eliminadoEn ? { ...mensaje, contenido: '' } : mensaje;
}

const ARCHIVADOS_PAGE_SIZE = 20;
const GUARDADOS_PAGE_SIZE = 20;

/** Escapa los comodines de LIKE (%, _, \) — mismo criterio que GlobalSearchService. */
function likePattern(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Apodos privados: solo se leen los que definió el usuario autenticado. */
const apodosPropios = (userId: number) => ({
  where: { idUsuarioDefine: userId },
  select: { idUsuarioObjetivo: true, apodo: true },
});

function participantesConApodo<U extends { estadoChat: Parameters<typeof estadoVigente>[0] }>(
  participantes: { idUsuario: number; usuario: U }[],
  apodos: { idUsuarioObjetivo: number; apodo: string }[],
) {
  const porUsuario = new Map(apodos.map((a) => [a.idUsuarioObjetivo, a.apodo]));
  return participantes.map((p) => ({ ...conEstado(p.usuario), apodo: porUsuario.get(p.idUsuario) ?? null }));
}

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
    @Inject(CHAT_STORAGE_PORT) private storage: ChatStoragePort,
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
    // Canales: además de la fila de participante, la membresía del proyecto
    // debe seguir vigente (si salió del proyecto pierde acceso al instante).
    if (conversacion.esCanal) await this.assertProjectMember(idProyecto, userId);
    return conversacion;
  }

  async assertConversationParticipant(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
  }

  async listConversations(idProyecto: number, userId: number) {
    const proyecto = await this.assertProjectMember(idProyecto, userId);
    const archivada = chatArchivado(proyecto.estadoProyecto);

    const conversaciones = await this.prisma.conversacion.findMany({
      where: { idProyecto, eliminadaEn: null, participantes: { some: { idUsuario: userId } } },
      include: {
        apodos: apodosPropios(userId),
        participantes: {
          select: {
            idUsuario: true,
            ultimaLecturaEn: true,
            silenciadaHasta: true,
            silenciadaSiempre: true,
            temaColor: true,
            usuario: PARTICIPANTE_USUARIO,
          },
        },
        mensajes: { orderBy: { enviadoEn: 'desc' }, take: 1, select: MENSAJE_SELECT },
      },
      orderBy: { creadaEn: 'desc' },
    });

    const mapeadas = await Promise.all(
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
          nombrePersonalizado: c.nombrePersonalizado,
          esCanal: c.esCanal,
          participantes: participantesConApodo(c.participantes, c.apodos),
          ultimoMensaje: c.mensajes[0] ? ocultarEliminado(c.mensajes[0]) : null,
          noLeidos,
          archivada,
          esFavorita: c.esFavorita,
          archivadaManual: c.archivadaEn !== null,
          silenciada: c.silenciada,
          silenciadaPorMi: estaSilenciada(propia),
          silenciadaHasta: propia?.silenciadaHasta ?? null,
          silenciadaSiempre: propia?.silenciadaSiempre ?? false,
          esPrioritaria: c.esPrioritaria,
          temaColor: propia?.temaColor ?? null,
        };
      }),
    );

    // Favoritas primero; entre el resto, las archivadas manualmente al final.
    // `Array.prototype.sort` es estable, así que el orden por `creadaEn desc`
    // de la consulta se conserva dentro de cada grupo.
    return mapeadas.sort((a, b) => {
      if (a.esFavorita !== b.esFavorita) return a.esFavorita ? -1 : 1;
      if (a.archivadaManual !== b.archivadaManual) return a.archivadaManual ? 1 : -1;
      return 0;
    });
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
      select: {
        ...MENSAJE_CON_CITA_SELECT,
        reacciones: REACCIONES_SELECT,
        guardadoPor: { where: { idUsuario: userId }, select: { idUsuario: true } },
      },
    });
    const apodos = await this.prisma.apodoConversacion.findMany({
      where: { idConversacion, idUsuarioDefine: userId },
      select: { idUsuarioObjetivo: true, apodo: true },
    });
    const porUsuario = new Map(apodos.map((a) => [a.idUsuarioObjetivo, a.apodo]));
    // `guardado` es solo del usuario autenticado: nunca se expone quién más guardó.
    return mensajes.reverse().map(({ reacciones, guardadoPor, ...m }) => ({
      ...ocultarEliminado(conResumenDeCita(m)),
      reacciones: reaccionesParaUsuario(agruparReacciones(reacciones), userId),
      apodoRemitente: porUsuario.get(m.remitente.idUsuario) ?? null,
      guardado: guardadoPor.length > 0,
    }));
  }

  /** Define o actualiza como ve `idObjetivo` el usuario autenticado (privado). */
  async setApodo(idProyecto: number, idConversacion: number, userId: number, idObjetivo: number, apodo: string) {
    await this.assertApodoTarget(idProyecto, idConversacion, userId, idObjetivo);
    await this.prisma.apodoConversacion.upsert({
      where: {
        idConversacion_idUsuarioDefine_idUsuarioObjetivo: {
          idConversacion,
          idUsuarioDefine: userId,
          idUsuarioObjetivo: idObjetivo,
        },
      },
      create: { idConversacion, idUsuarioDefine: userId, idUsuarioObjetivo: idObjetivo, apodo },
      update: { apodo },
    });
  }

  async removeApodo(idProyecto: number, idConversacion: number, userId: number, idObjetivo: number) {
    await this.assertApodoTarget(idProyecto, idConversacion, userId, idObjetivo);
    await this.prisma.apodoConversacion.deleteMany({
      where: { idConversacion, idUsuarioDefine: userId, idUsuarioObjetivo: idObjetivo },
    });
  }

  /** Quien define y el objetivo deben ser participantes de la conversación. */
  private async assertApodoTarget(idProyecto: number, idConversacion: number, userId: number, idObjetivo: number) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    if (!conversacion.participantes.some((p) => p.idUsuario === idObjetivo)) {
      throw new BadRequestException('El usuario no participa en esta conversación');
    }
  }

  /** Alterna la reacción del usuario: la crea si no existe y la quita si ya estaba. */
  async toggleReaction(
    idProyecto: number,
    idConversacion: number,
    idMensaje: number,
    userId: number,
    emoji: string,
  ) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    if (chatArchivado(conversacion.proyecto.estadoProyecto)) {
      throw new ForbiddenException('Esta conversación está archivada: no se puede reaccionar.');
    }
    const mensaje = await this.prisma.mensajeChat.findFirst({
      where: { idMensaje, idConversacion },
      select: { idMensaje: true },
    });
    if (!mensaje) {
      throw new NotFoundException(`Mensaje con id ${idMensaje} no encontrado`);
    }

    const clave = { idMensaje, idUsuario: userId, emoji };
    const existente = await this.prisma.reaccionMensajeChat.findUnique({
      where: { idMensaje_idUsuario_emoji: clave },
      select: { idReaccion: true },
    });
    if (existente) {
      await this.prisma.reaccionMensajeChat.delete({ where: { idReaccion: existente.idReaccion } });
    } else {
      await this.prisma.reaccionMensajeChat.create({ data: clave });
    }

    const filas = await this.prisma.reaccionMensajeChat.findMany({ where: { idMensaje }, ...REACCIONES_SELECT });
    const grupos = agruparReacciones(filas);
    this.gateway.broadcastReactionUpdated(idConversacion, idMensaje, grupos);
    return reaccionesParaUsuario(grupos, userId);
  }

  /**
   * Galeria de enlaces: se extraen del texto de los mensajes, sin tabla propia.
   * ponytail: cada pagina escanea hasta `limite` mensajes que contienen "http"
   * (no `limite` enlaces), asi que una pagina puede traer menos items; el cursor
   * es el ultimo idMensaje escaneado. Si hay conversaciones con muchisimos
   * mensajes, conviene una tabla `enlace_mensaje` indexada (idConversacion,
   * idMensaje) poblada al crear el mensaje. Los duplicados se eliminan por
   * mensaje y dentro de la pagina, no entre paginas.
   */
  async getLinks(idProyecto: number, idConversacion: number, userId: number, query: ListLinksQueryDto = {}) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const limite = query.limite ?? 20;
    const mensajes = await this.prisma.mensajeChat.findMany({
      where: {
        idConversacion,
        eliminadoEn: null,
        contenido: { contains: 'http', mode: 'insensitive' },
        ...(query.cursor ? { idMensaje: { lt: query.cursor } } : {}),
      },
      orderBy: { idMensaje: 'desc' },
      take: limite,
      select: { idMensaje: true, contenido: true, enviadoEn: true, remitente: USUARIO_SELECT },
    });

    const vistos = new Set<string>();
    const items: { url: string; dominio: string; idMensaje: number; remitente: (typeof mensajes)[number]['remitente']; enviadoEn: Date }[] = [];
    for (const m of mensajes) {
      for (const url of extraerEnlaces(m.contenido)) {
        if (vistos.has(url)) continue;
        vistos.add(url);
        items.push({ url, dominio: new URL(url).hostname, idMensaje: m.idMensaje, remitente: m.remitente, enviadoEn: m.enviadoEn });
      }
    }
    const nextCursor = mensajes.length === limite ? mensajes[mensajes.length - 1].idMensaje : null;
    return { items, nextCursor };
  }

  /** Galeria de archivos compartidos, paginada por idAdjunto descendente. */
  async getArchivos(idProyecto: number, idConversacion: number, userId: number, query: ListLinksQueryDto = {}) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const limite = query.limite ?? 20;
    const filas = await this.prisma.adjuntoMensajeChat.findMany({
      where: { idConversacion, ...(query.cursor ? { idAdjunto: { lt: query.cursor } } : {}) },
      orderBy: { idAdjunto: 'desc' },
      take: limite,
      select: {
        idAdjunto: true,
        idMensaje: true,
        nombreOriginal: true,
        mime: true,
        tamanoBytes: true,
        creadoEn: true,
        mensaje: { select: { remitente: USUARIO_SELECT } },
      },
    });
    const items = filas.map(({ mensaje, ...a }) => ({ ...a, remitente: mensaje.remitente }));
    const nextCursor = filas.length === limite ? filas[filas.length - 1].idAdjunto : null;
    return { items, nextCursor };
  }

  /** URL firmada de vida corta; solo participantes de la conversacion. */
  async getAdjuntoUrl(idProyecto: number, idConversacion: number, idAdjunto: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const adjunto = await this.prisma.adjuntoMensajeChat.findFirst({
      where: { idAdjunto, idConversacion },
      select: { claveAlmacenamiento: true, nombreOriginal: true, mime: true },
    });
    if (!adjunto) throw new NotFoundException('Archivo no encontrado');
    const url = await this.storage.signedUrl(adjunto.claveAlmacenamiento, URL_ADJUNTO_TTL_SEGUNDOS);
    return { url, nombreOriginal: adjunto.nombreOriginal, mime: adjunto.mime, expiraEnSegundos: URL_ADJUNTO_TTL_SEGUNDOS };
  }

  /**
   * Bytes de una imagen adjunta para la miniatura. Se descargan en el servidor
   * (URL firmada de uso unico) para que el navegador solo hable con el mismo
   * origen; solo participantes, solo imagenes y con el tope de ADJUNTO_MAX_BYTES.
   */
  async getAdjuntoImagen(idProyecto: number, idConversacion: number, idAdjunto: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const adjunto = await this.prisma.adjuntoMensajeChat.findFirst({
      where: { idAdjunto, idConversacion },
      select: { claveAlmacenamiento: true, mime: true, tamanoBytes: true },
    });
    if (!adjunto) throw new NotFoundException('Archivo no encontrado');
    if (!adjunto.mime.startsWith('image/') || adjunto.tamanoBytes > ADJUNTO_MAX_BYTES) {
      throw new BadRequestException('El archivo no tiene miniatura');
    }
    const url = await this.storage.signedUrl(adjunto.claveAlmacenamiento, URL_ADJUNTO_TTL_SEGUNDOS);
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new NotFoundException('Archivo no disponible');
    const datos = Buffer.from(await respuesta.arrayBuffer());
    if (datos.length > ADJUNTO_MAX_BYTES) throw new BadRequestException('El archivo no tiene miniatura');
    return { datos, mime: adjunto.mime };
  }

  /** Busca en una conversación por texto (parcial, sin acentos ni mayúsculas), autor y rango de fechas. */
  async searchMessages(idProyecto: number, idConversacion: number, userId: number, filtros: SearchMessagesQueryDto) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const { q, idAutor, desde, hasta, pagina = 1, limite = 20 } = filtros;
    if (desde && hasta && new Date(desde) > new Date(hasta)) {
      throw new BadRequestException('desde no puede ser posterior a hasta');
    }

    const condiciones = [Prisma.sql`id_conversacion = ${idConversacion}`, Prisma.sql`eliminado_en IS NULL`];
    if (q) {
      condiciones.push(
        Prisma.sql`immutable_unaccent(lower(contenido)) LIKE immutable_unaccent(lower(${likePattern(q)})) ESCAPE '\\'`,
      );
    }
    if (idAutor) condiciones.push(Prisma.sql`id_remitente = ${idAutor}`);
    if (desde) condiciones.push(Prisma.sql`enviado_en >= ${new Date(desde)}`);
    if (hasta) condiciones.push(Prisma.sql`enviado_en <= ${new Date(hasta)}`);

    // limite + 1 para saber si hay otra página sin un COUNT aparte.
    const filas = await this.prisma.$queryRaw<{ id_mensaje: number }[]>(Prisma.sql`
      SELECT id_mensaje FROM mensaje_chat
      WHERE ${Prisma.join(condiciones, ' AND ')}
      ORDER BY enviado_en DESC, id_mensaje DESC
      LIMIT ${limite + 1} OFFSET ${(pagina - 1) * limite}
    `);
    const hasMore = filas.length > limite;
    const ids = filas.slice(0, limite).map((f) => f.id_mensaje);

    const mensajes = await this.prisma.mensajeChat.findMany({
      where: { idMensaje: { in: ids }, idConversacion },
      select: MENSAJE_SELECT,
    });
    mensajes.sort((a, b) => ids.indexOf(a.idMensaje) - ids.indexOf(b.idMensaje));

    return { items: mensajes, hasMore, pagina, termino: q ?? null };
  }

  async createMessage(
    idProyecto: number,
    idConversacion: number,
    userId: number,
    contenido: string,
    archivo?: ArchivoSubido,
    idMensajeCitado?: number,
  ) {
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

    if (idMensajeCitado !== undefined) {
      // Filtrar por idConversacion impide citar un mensaje de otra conversación.
      const citado = await this.prisma.mensajeChat.findFirst({
        where: { idMensaje: idMensajeCitado, idConversacion },
        select: { idMensaje: true },
      });
      if (!citado) {
        throw new BadRequestException('El mensaje citado no existe en esta conversación');
      }
    }

    let adjunto: Prisma.AdjuntoMensajeChatCreateWithoutMensajeInput | undefined;
    if (archivo) {
      const { mime, nombre } = validarAdjunto(archivo);
      const clave = `chat/${idConversacion}/${randomUUID()}.${nombre.split('.').pop()!.toLowerCase()}`;
      await this.storage.upload(clave, archivo.buffer);
      adjunto = {
        conversacion: { connect: { idConversacion } },
        nombreOriginal: nombre,
        mime,
        tamanoBytes: archivo.buffer.length,
        claveAlmacenamiento: clave,
      };
    }

    let mensaje;
    try {
      mensaje = conResumenDeCita(
        await this.prisma.mensajeChat.create({
          data: {
            idConversacion,
            idRemitente: userId,
            contenido: contenido.trim(),
            idMensajeCitado,
            ...(adjunto ? { adjunto: { create: adjunto } } : {}),
          },
          select: MENSAJE_CON_CITA_SELECT,
        }),
      );
    } catch (error) {
      if (adjunto) await this.storage.destroy(adjunto.claveAlmacenamiento);
      throw error;
    }

    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { ultimaLecturaEn: mensaje.enviadoEn },
    });

    const destinatarios = conversacion.participantes.map((p) => p.idUsuario).filter((id) => id !== userId);
    this.gateway.broadcastMessage(idConversacion, destinatarios, mensaje);

    return mensaje;
  }

  /** Solo el remitente toca su mensaje; un mensaje eliminado ya no se edita ni se vuelve a eliminar. */
  private async getOwnMessageOrThrow(
    idProyecto: number,
    idConversacion: number,
    idMensaje: number,
    userId: number,
  ) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    if (chatArchivado(conversacion.proyecto.estadoProyecto)) {
      throw new ForbiddenException('Esta conversación está archivada: no se pueden modificar mensajes.');
    }
    const mensaje = await this.prisma.mensajeChat.findFirst({
      where: { idMensaje, idConversacion },
      select: { idRemitente: true, eliminadoEn: true },
    });
    if (!mensaje) throw new NotFoundException(`Mensaje con id ${idMensaje} no encontrado`);
    if (mensaje.idRemitente !== userId) {
      throw new ForbiddenException('Solo puedes modificar tus propios mensajes');
    }
    if (mensaje.eliminadoEn) throw new BadRequestException('El mensaje ya fue eliminado');
    return conversacion;
  }

  async editMessage(
    idProyecto: number,
    idConversacion: number,
    idMensaje: number,
    userId: number,
    contenido: string,
  ) {
    const conversacion = await this.getOwnMessageOrThrow(idProyecto, idConversacion, idMensaje, userId);
    const mensaje = conResumenDeCita(
      await this.prisma.mensajeChat.update({
        where: { idMensaje },
        data: { contenido: contenido.trim(), editadoEn: new Date() },
        select: MENSAJE_CON_CITA_SELECT,
      }),
    );
    const destinatarios = conversacion.participantes.map((p) => p.idUsuario).filter((id) => id !== userId);
    this.gateway.broadcastMessageChange('messageUpdated', idConversacion, destinatarios, mensaje);
    return mensaje;
  }

  async deleteMessage(idProyecto: number, idConversacion: number, idMensaje: number, userId: number) {
    const conversacion = await this.getOwnMessageOrThrow(idProyecto, idConversacion, idMensaje, userId);
    const mensaje = ocultarEliminado(
      conResumenDeCita(
        await this.prisma.mensajeChat.update({
          where: { idMensaje },
          data: { eliminadoEn: new Date() },
          select: MENSAJE_CON_CITA_SELECT,
        }),
      ),
    );
    const destinatarios = conversacion.participantes.map((p) => p.idUsuario).filter((id) => id !== userId);
    this.gateway.broadcastMessageChange('messageDeleted', idConversacion, destinatarios, mensaje);
    return mensaje;
  }

  /** Menú de 3 puntos: archivar/desarchivar, renombrar o (des)marcar favorita. */
  async updateConversation(
    idProyecto: number,
    idConversacion: number,
    userId: number,
    dto: UpdateConversationDto,
  ) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    if (conversacion.esCanal && dto.nombrePersonalizado !== undefined) {
      throw new ForbiddenException('Los canales no se pueden renombrar');
    }

    const data: Prisma.ConversacionUpdateInput = {};
    if (dto.archivada !== undefined) data.archivadaEn = dto.archivada ? new Date() : null;
    if (dto.esFavorita !== undefined) data.esFavorita = dto.esFavorita;
    if (dto.silenciada !== undefined) data.silenciada = dto.silenciada;
    if (dto.esPrioritaria !== undefined) data.esPrioritaria = dto.esPrioritaria;
    if (dto.nombrePersonalizado !== undefined) {
      data.nombrePersonalizado = dto.nombrePersonalizado?.trim() || null;
    }

    await this.prisma.conversacion.update({ where: { idConversacion }, data });
  }

  /** Tema de color propio: solo toca la fila del participante autenticado. */
  async updateTheme(idProyecto: number, idConversacion: number, userId: number, dto: UpdateChatThemeDto) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { temaColor: dto.temaColor },
    });
  }

  /** Borrar conversación desde el dock de chat: soft-delete (mismo patrón que
   * archivadaEn), notifica en vivo al resto de participantes para que
   * desaparezca de su lista sin que tengan que recargar. */
  async deleteConversation(idProyecto: number, idConversacion: number, userId: number) {
    const conversacion = await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    if (conversacion.esCanal) throw new ForbiddenException('Los canales no se pueden eliminar');
    await this.prisma.conversacion.update({
      where: { idConversacion },
      data: { eliminadaEn: new Date() },
    });
    const destinatarios = conversacion.participantes.map((p) => p.idUsuario).filter((id) => id !== userId);
    this.gateway.notifyConversationCreated(idConversacion, destinatarios);
  }

  /**
   * Dock global de chat: todas las conversaciones activas del usuario A
   * TRAVÉS DE TODOS sus proyectos (mismo espíritu que listArchivedConversations,
   * pero para las NO archivadas/eliminadas). La búsqueda cubre nombre del
   * chat, nombre de la otra persona y contenido de mensajes enviados.
   */
  async listAllConversations(userId: number, q?: string) {
    const query = (q ?? '').trim();

    const conversaciones = await this.prisma.conversacion.findMany({
      where: {
        eliminadaEn: null,
        participantes: { some: { idUsuario: userId } },
        proyecto: { estadoProyecto: { not: EstadoProyecto.CERRADO } },
        // Un canal solo se ve mientras la persona siga en el proyecto.
        AND: [
          {
            OR: [
              { esCanal: false },
              {
                proyecto: {
                  OR: [
                    { creadoPor: userId },
                    {
                      roles: {
                        some: { participaciones: { some: { idUsuario: userId, estadoParticipacion: 'ACTIVO' } } },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
        ...(query
          ? {
              OR: [
                { nombre: { contains: query, mode: 'insensitive' } },
                { nombrePersonalizado: { contains: query, mode: 'insensitive' } },
                {
                  participantes: {
                    some: {
                      idUsuario: { not: userId },
                      usuario: {
                        OR: [
                          { nombre: { contains: query, mode: 'insensitive' } },
                          { apellido: { contains: query, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
                { mensajes: { some: { eliminadoEn: null, contenido: { contains: query, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        proyecto: { select: { idProyecto: true, tituloProyecto: true } },
        apodos: apodosPropios(userId),
        participantes: {
          select: {
            idUsuario: true,
            ultimaLecturaEn: true,
            silenciadaHasta: true,
            silenciadaSiempre: true,
            temaColor: true,
            usuario: PARTICIPANTE_USUARIO,
          },
        },
        mensajes: { orderBy: { enviadoEn: 'desc' }, take: 1, select: MENSAJE_SELECT },
      },
      orderBy: { creadaEn: 'desc' },
    });

    const mapeadas = await Promise.all(
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
          idProyecto: c.idProyecto,
          proyecto: c.proyecto,
          tipo: c.tipo,
          nombre: c.nombre,
          nombrePersonalizado: c.nombrePersonalizado,
          esCanal: c.esCanal,
          participantes: participantesConApodo(c.participantes, c.apodos),
          ultimoMensaje: c.mensajes[0] ? ocultarEliminado(c.mensajes[0]) : null,
          ultimoMensajeEsPropio: c.mensajes[0]?.remitente.idUsuario === userId,
          noLeidos,
          esFavorita: c.esFavorita,
          archivadaManual: c.archivadaEn !== null,
          silenciada: c.silenciada,
          silenciadaPorMi: estaSilenciada(propia),
          silenciadaHasta: propia?.silenciadaHasta ?? null,
          silenciadaSiempre: propia?.silenciadaSiempre ?? false,
          esPrioritaria: c.esPrioritaria,
          temaColor: propia?.temaColor ?? null,
        };
      }),
    );

    return mapeadas.sort((a, b) => {
      if (a.esFavorita !== b.esFavorita) return a.esFavorita ? -1 : 1;
      return 0;
    });
  }

  /** Marcador personal: alterna guardado/no guardado. Solo participantes de la conversación. */
  async toggleSavedMessage(idProyecto: number, idConversacion: number, idMensaje: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const mensaje = await this.prisma.mensajeChat.findFirst({
      where: { idMensaje, idConversacion },
      select: { idMensaje: true },
    });
    if (!mensaje) {
      throw new NotFoundException(`Mensaje con id ${idMensaje} no encontrado`);
    }

    const { count } = await this.prisma.mensajeGuardado.deleteMany({ where: { idUsuario: userId, idMensaje } });
    if (count > 0) return { guardado: false };
    await this.prisma.mensajeGuardado.createMany({ data: [{ idUsuario: userId, idMensaje }], skipDuplicates: true });
    return { guardado: true };
  }

  /**
   * Guardados propios, más recientes primero. El filtro por participación
   * ACTUAL va en el WHERE: si el usuario salió de la conversación (o esta se
   * borró) su guardado sigue en la tabla pero ya no devuelve contenido.
   */
  async listSavedMessages(userId: number, filtros: ListSavedMessagesQueryDto = {}) {
    const page = filtros.page ?? 1;
    const guardados = await this.prisma.mensajeGuardado.findMany({
      where: {
        idUsuario: userId,
        mensaje: { conversacion: { eliminadaEn: null, participantes: { some: { idUsuario: userId } } } },
      },
      orderBy: [{ guardadoEn: 'desc' }, { idMensaje: 'desc' }],
      skip: (page - 1) * GUARDADOS_PAGE_SIZE,
      take: GUARDADOS_PAGE_SIZE + 1,
      select: {
        guardadoEn: true,
        mensaje: {
          select: {
            idMensaje: true,
            contenido: true,
            enviadoEn: true,
            remitente: USUARIO_SELECT,
            conversacion: {
              select: {
                idConversacion: true,
                idProyecto: true,
                tipo: true,
                nombre: true,
                nombrePersonalizado: true,
                participantes: { select: { usuario: USUARIO_SELECT } },
              },
            },
          },
        },
      },
    });

    const hasMore = guardados.length > GUARDADOS_PAGE_SIZE;
    const pagina = hasMore ? guardados.slice(0, GUARDADOS_PAGE_SIZE) : guardados;

    return {
      items: pagina.map(({ guardadoEn, mensaje: { conversacion: c, ...m } }) => ({
        ...m,
        guardadoEn,
        conversacion: {
          idConversacion: c.idConversacion,
          idProyecto: c.idProyecto,
          tipo: c.tipo,
          nombre: c.nombre,
          nombrePersonalizado: c.nombrePersonalizado,
          participantes: c.participantes.map((p) => p.usuario),
        },
      })),
      hasMore,
    };
  }

  /** Silencio por usuario (no el campo global `silenciada`): 1 h, 8 h o siempre. */
  async silenciar(idProyecto: number, idConversacion: number, userId: number, duracion: DuracionSilencio) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const horas = duracion === '1h' ? 1 : duracion === '8h' ? 8 : 0;
    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: {
        silenciadaSiempre: duracion === 'siempre',
        silenciadaHasta: horas ? new Date(Date.now() + horas * 3_600_000) : null,
      },
    });
  }

  async activarSonido(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { silenciadaSiempre: false, silenciadaHasta: null },
    });
  }

  private async leerNoMolestar(userId: number) {
    const pref = await this.prisma.preferenciaNoMolestar.findUnique({ where: { idUsuario: userId } });
    return {
      activo: pref?.activo ?? false,
      horaInicio: pref?.horaInicio ?? '22:00',
      horaFin: pref?.horaFin ?? '07:00',
      diasSemana: pref?.diasSemana ?? [0, 1, 2, 3, 4, 5, 6],
      zona: pref?.zona ?? 'America/Guatemala',
    };
  }

  /** Modo no molestar del usuario (valores por defecto si nunca lo configuro). */
  async getNoMolestar(userId: number) {
    const pref = await this.leerNoMolestar(userId);
    return { ...pref, enHorarioAhora: estaEnNoMolestar(pref) };
  }

  async updateNoMolestar(userId: number, dto: UpdateNoMolestarDto) {
    if (dto.horaInicio === dto.horaFin) {
      throw new BadRequestException('La hora de inicio y la de fin no pueden ser iguales');
    }
    const data = {
      activo: dto.activo,
      horaInicio: dto.horaInicio,
      horaFin: dto.horaFin,
      diasSemana: [...dto.diasSemana].sort((a, b) => a - b),
      zona: dto.zona ?? 'America/Guatemala',
    };
    await this.prisma.preferenciaNoMolestar.upsert({
      where: { idUsuario: userId },
      create: { idUsuario: userId, ...data },
      update: data,
    });
    return this.getNoMolestar(userId);
  }

  async markRead(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    const leidoEn = new Date();
    await this.prisma.conversacionParticipante.update({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      data: { ultimaLecturaEn: leidoEn },
    });
    this.gateway.notifyMessagesRead(idConversacion, userId, leidoEn);
  }

  /** "Visto por": hasta cuándo leyó la conversación cada uno de los demás participantes. */
  async getReadReceipts(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionOrThrow(idProyecto, idConversacion, userId);
    return this.prisma.conversacionParticipante.findMany({
      where: { idConversacion, idUsuario: { not: userId } },
      select: { idUsuario: true, ultimaLecturaEn: true },
    });
  }

  /**
   * T-236: conversaciones archivadas del usuario A TRAVÉS DE TODOS sus
   * proyectos (a diferencia de listConversations, que solo mira uno). Nunca
   * puede devolver una conversación activa: el filtro por
   * `proyecto.estadoProyecto = CERRADO` es parte del WHERE, no un chequeo
   * posterior — así que aunque un proyecto se reabra entre que el cliente
   * pagina, esa página ya no la va a incluir.
   */
  async listArchivedConversations(userId: number, filtros: ListArchivedConversationsQueryDto = {}) {
    const query = (filtros.q ?? '').trim();
    const page = filtros.page ?? 1;

    const busquedaPorPersona: Prisma.ConversacionWhereInput = {
      participantes: {
        some: {
          idUsuario: { not: userId },
          usuario: {
            OR: [
              { nombre: { contains: query, mode: 'insensitive' } },
              { apellido: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
    };

    const conversaciones = await this.prisma.conversacion.findMany({
      where: {
        participantes: { some: { idUsuario: userId } },
        proyecto: { estadoProyecto: EstadoProyecto.CERRADO },
        ...(query
          ? {
              OR: [
                { nombre: { contains: query, mode: 'insensitive' } },
                busquedaPorPersona,
              ],
            }
          : {}),
      },
      include: {
        proyecto: { select: { idProyecto: true, tituloProyecto: true } },
        participantes: { select: { idUsuario: true, usuario: USUARIO_SELECT } },
        mensajes: { orderBy: { enviadoEn: 'desc' }, take: 1, select: MENSAJE_SELECT },
      },
      orderBy: { creadaEn: 'desc' },
      skip: (page - 1) * ARCHIVADOS_PAGE_SIZE,
      take: ARCHIVADOS_PAGE_SIZE + 1,
    });

    const hasMore = conversaciones.length > ARCHIVADOS_PAGE_SIZE;
    const pagina = hasMore ? conversaciones.slice(0, ARCHIVADOS_PAGE_SIZE) : conversaciones;

    return {
      items: pagina.map((c) => ({
        idConversacion: c.idConversacion,
        tipo: c.tipo,
        nombre: c.nombre,
        proyecto: c.proyecto,
        participantes: c.participantes.map((p) => p.usuario),
        ultimoMensaje: c.mensajes[0] ? ocultarEliminado(c.mensajes[0]) : null,
        archivada: true as const,
      })),
      hasMore,
    };
  }
}
