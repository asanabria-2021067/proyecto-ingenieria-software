import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ESTADOS_CON_DETALLE } from '../projects/projects.read-model';
import { ChatService } from './chat.service';
import { parsearEnlaceInterno } from './chat-tarjetas';

export interface TarjetaEnlace {
  ruta: string;
  tipo: 'PROYECTO' | 'TAREA';
  /** false: no existe o el usuario no tiene permiso; no se revela ningun dato. */
  accesible: boolean;
  titulo?: string;
  estado?: string;
  /** Tarea: titulo del proyecto. Proyecto: tipo de horas/modalidad no se expone. */
  proyecto?: string;
}

/**
 * MEJ-45: tarjetas de enlaces internos. Los permisos son los del USUARIO QUE LEE, no
 * los del autor del mensaje: tarea = lider o participante ACTIVO de su proyecto;
 * proyecto = ademas, cualquiera si el proyecto tiene detalle publico.
 */
@Injectable()
export class ChatTarjetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  private async esMiembro(idProyecto: number, userId: number, creadoPor: number): Promise<boolean> {
    if (creadoPor === userId) return true;
    const p = await this.prisma.participacionProyecto.findFirst({
      where: { idUsuario: userId, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
      select: { idParticipacion: true },
    });
    return p !== null;
  }

  async resolver(idProyecto: number, idConversacion: number, userId: number, rutas: string[]): Promise<TarjetaEnlace[]> {
    await this.chat.assertConversationParticipant(idProyecto, idConversacion, userId);
    const tarjetas: TarjetaEnlace[] = [];
    for (const ruta of rutas) {
      const enlace = parsearEnlaceInterno(ruta);
      if (!enlace) continue; // no es un enlace interno: el cliente lo trata como texto
      tarjetas.push(
        enlace.tipo === 'TAREA'
          ? await this.tarjetaTarea(ruta, enlace.idProyecto, enlace.idTarea, userId)
          : await this.tarjetaProyecto(ruta, enlace.idProyecto, userId),
      );
    }
    return tarjetas;
  }

  private async tarjetaProyecto(ruta: string, idProyecto: number, userId: number): Promise<TarjetaEnlace> {
    const oculta: TarjetaEnlace = { ruta, tipo: 'PROYECTO', accesible: false };
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { tituloProyecto: true, estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) return oculta;
    const permitido =
      ESTADOS_CON_DETALLE.includes(proyecto.estadoProyecto) || (await this.esMiembro(idProyecto, userId, proyecto.creadoPor));
    if (!permitido) return oculta;
    return { ruta, tipo: 'PROYECTO', accesible: true, titulo: proyecto.tituloProyecto, estado: proyecto.estadoProyecto };
  }

  private async tarjetaTarea(ruta: string, idProyecto: number, idTarea: number, userId: number): Promise<TarjetaEnlace> {
    const oculta: TarjetaEnlace = { ruta, tipo: 'TAREA', accesible: false };
    const tarea = await this.prisma.tarea.findFirst({
      where: { idTarea, idProyecto, eliminadoEn: null },
      select: {
        tituloTarea: true,
        estadoTarea: true,
        proyecto: { select: { tituloProyecto: true, creadoPor: true, eliminadoEn: true } },
      },
    });
    if (!tarea || tarea.proyecto.eliminadoEn || !(await this.esMiembro(idProyecto, userId, tarea.proyecto.creadoPor))) {
      return oculta;
    }
    return {
      ruta,
      tipo: 'TAREA',
      accesible: true,
      titulo: tarea.tituloTarea,
      estado: tarea.estadoTarea,
      proyecto: tarea.proyecto.tituloProyecto,
    };
  }
}
