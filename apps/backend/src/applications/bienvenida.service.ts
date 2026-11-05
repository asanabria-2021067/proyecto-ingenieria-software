import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { CANAL_GENERAL } from '../chat/chat-canales.service';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';

export const MENSAJE_BIENVENIDA_DEFECTO = '¡Bienvenido/a {nombre} al equipo de {proyecto}! Qué gusto tenerte con nosotros.';
export const MAX_BIENVENIDA = 1000;

/** Sustituye {nombre} y {proyecto}; cualquier otra llave queda como texto. */
export function armarBienvenida(plantilla: string | null, nombre: string, proyecto: string): string {
  return (plantilla?.trim() || MENSAJE_BIENVENIDA_DEFECTO).replaceAll('{nombre}', nombre).replaceAll('{proyecto}', proyecto);
}

/** MEJ-102: al aceptar a alguien, el lider le da la bienvenida en #general con un texto editable del proyecto. */
@Injectable()
export class BienvenidaService {
  private readonly logger = new Logger(BienvenidaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  private async proyectoDelLider(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true, tituloProyecto: true, mensajeBienvenida: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    if (proyecto.creadoPor !== userId) throw new ForbiddenException('Solo el líder del proyecto edita el mensaje de bienvenida');
    return proyecto;
  }

  async obtener(idProyecto: number, userId: number) {
    const proyecto = await this.proyectoDelLider(idProyecto, userId);
    return { mensaje: proyecto.mensajeBienvenida, porDefecto: MENSAJE_BIENVENIDA_DEFECTO };
  }

  /** Texto vacio o null vuelve al mensaje por defecto. */
  async guardar(idProyecto: number, userId: number, mensaje: string | null | undefined) {
    const proyecto = await this.proyectoDelLider(idProyecto, userId);
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO) throw new ForbiddenException('Este proyecto ya cerró');
    await this.prisma.proyecto.update({ where: { idProyecto }, data: { mensajeBienvenida: mensaje?.trim() || null } });
    return this.obtener(idProyecto, userId);
  }

  /** Mensaje del lider en #general. Un fallo del chat nunca revierte ni rompe la aceptacion ya hecha. */
  async enviarSinFallar(idProyecto: number, idNuevo: number) {
    if (!this.chat) return;
    try {
      const [proyecto, nuevo, general] = await Promise.all([
        this.prisma.proyecto.findFirst({
          where: { idProyecto, eliminadoEn: null },
          select: { creadoPor: true, tituloProyecto: true, mensajeBienvenida: true },
        }),
        this.prisma.usuario.findUnique({ where: { idUsuario: idNuevo }, select: { nombre: true } }),
        this.prisma.conversacion.findFirst({
          where: { idProyecto, esCanal: true, nombreCanal: CANAL_GENERAL, eliminadaEn: null },
          select: { idConversacion: true },
        }),
      ]);
      if (!proyecto || !nuevo || !general || proyecto.creadoPor === idNuevo) return;
      const texto = armarBienvenida(proyecto.mensajeBienvenida, nuevo.nombre, proyecto.tituloProyecto);
      await this.chat.createMessage(idProyecto, general.idConversacion, proyecto.creadoPor, texto);
    } catch (error) {
      this.logger.warn(`No se pudo enviar la bienvenida del proyecto ${idProyecto}: ${String(error)}`);
    }
  }
}
