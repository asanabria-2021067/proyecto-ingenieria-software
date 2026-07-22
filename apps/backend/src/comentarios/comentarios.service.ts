import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { UpdateComentarioDto } from './dto/update-comentario.dto';

@Injectable()
export class ComentariosService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Tarea 28: los comentarios de tarea ya no se crean mediante esta ruta
   * genérica (proyecto implícito vía `idTarea` en el body). Se rechazan
   * aquí mismo, antes de resolver cualquier contexto, para que la única vía
   * de creación de un comentario de tarea sea la ruta anidada y
   * contextualizada `POST /proyectos/:projectId/tareas/:taskId/comentarios`
   * (ver `createForTask`). Los comentarios de proyecto e hito conservan
   * exactamente el mismo comportamiento que tenían antes de esta tarea.
   */
  async create(userId: number, dto: CreateComentarioDto) {
    if (dto.idTarea) {
      throw new BadRequestException(
        'Los comentarios de tarea deben crearse mediante POST /proyectos/:projectId/tareas/:taskId/comentarios',
      );
    }

    const parentCount = Number(!!dto.idProyecto) + Number(!!dto.idHito);
    if (parentCount !== 1) {
      throw new BadRequestException('Debes enviar exactamente una entidad destino: idProyecto o idHito');
    }

    const contexto = await this.resolveProjectContext(dto);
    await this.assertChannelAWriteAllowed(contexto.idProyecto, userId);

    const tipo = dto.idProyecto ? TipoNotificacion.COMENTARIO_PROYECTO : TipoNotificacion.COMENTARIO_HITO;
    return this.persistAndNotify(userId, contexto.idProyecto, dto, tipo);
  }

  /**
   * Único punto de creación de comentarios de tarea (Tarea 28): valida
   * proyecto+tarea en base de datos (`getTareaEnProyectoOrThrow`, con
   * `proyecto.eliminadoEn: null` incluido) antes de reutilizar la misma
   * regla de autorización de escritura (`assertChannelAWriteAllowed`) que
   * ya usan los comentarios de proyecto e hito. No duplica la lógica de
   * creación/notificación: delega en `persistAndNotify`, compartida con
   * `create()`.
   */
  async createForTask(
    projectId: number,
    taskId: number,
    userId: number,
    contenido: string,
  ) {
    await this.getTareaEnProyectoOrThrow(projectId, taskId);
    await this.assertChannelAWriteAllowed(projectId, userId);

    return this.persistAndNotify(
      userId,
      projectId,
      { idTarea: taskId, contenido },
      TipoNotificacion.COMENTARIO_TAREA,
    );
  }

  /**
   * Lógica de persistencia y notificación compartida entre `create` (rutas
   * de proyecto/hito) y `createForTask` (ruta anidada de tarea), para no
   * duplicar el bloque de `comentario.create` + `notifyProjectActiveParticipants`.
   */
  private async persistAndNotify(
    userId: number,
    idProyecto: number,
    data: { idProyecto?: number; idTarea?: number; idHito?: number; contenido: string },
    tipo: TipoNotificacion,
  ) {
    const comentario = await this.prisma.comentario.create({
      data: {
        idAutor: userId,
        idProyecto: data.idProyecto,
        idTarea: data.idTarea,
        idHito: data.idHito,
        contenido: data.contenido.trim(),
      },
    });

    await this.notifications.notifyProjectActiveParticipants(idProyecto, userId, {
      tipoNotificacion: tipo,
      tituloNotificacion: 'Nuevo comentario',
      mensajeNotificacion: 'Se agregó un comentario nuevo en el proyecto.',
      datosJson: {
        idProyecto,
        idComentario: comentario.idComentario,
        idTarea: data.idTarea ?? null,
        idHito: data.idHito ?? null,
      },
    });

    return comentario;
  }

  private readonly autorSelect = {
    select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
  } as const;

  async findByProyecto(idProyecto: number, userId: number) {
    await this.assertChannelAReadAllowed(idProyecto, userId);
    return this.prisma.comentario.findMany({
      where: { idProyecto, eliminadoEn: null },
      include: { autor: this.autorSelect },
      orderBy: { creadoEn: 'asc' },
    });
  }

  /**
   * Único listado de comentarios de tarea (Tarea 28.C): valida proyecto+tarea
   * igual que `createForTask`/`updateForTask`/`removeForTask` antes de
   * reutilizar `assertChannelAReadAllowed`. Reemplaza por completo a las
   * antiguas `findByTarea`/`findByTareaDesc` (sin `projectId`), retiradas
   * junto con la ruta genérica `GET /comentarios/tarea/:idTarea`.
   */
  async findByTareaEnProyecto(projectId: number, taskId: number, userId: number) {
    await this.getTareaEnProyectoOrThrow(projectId, taskId);
    await this.assertChannelAReadAllowed(projectId, userId);
    return this.prisma.comentario.findMany({
      where: { idTarea: taskId, eliminadoEn: null },
      include: { autor: this.autorSelect },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async findByHito(idHito: number, userId: number) {
    const hito = await this.prisma.hito.findUnique({
      where: { idHito },
      select: { idProyecto: true },
    });
    if (!hito) throw new NotFoundException('Hito no encontrado');
    await this.assertChannelAReadAllowed(hito.idProyecto, userId);
    return this.prisma.comentario.findMany({
      where: { idHito, eliminadoEn: null },
      include: { autor: this.autorSelect },
      orderBy: { creadoEn: 'asc' },
    });
  }

  /**
   * Validación contextual estricta para la ruta anidada de comentarios de
   * tarea (Tarea 28): la tarea debe pertenecer exactamente a `projectId`,
   * no estar eliminada, y su proyecto tampoco debe estar eliminado. Una
   * consulta en base de datos (no una comparación en memoria tras traer la
   * tarea globalmente), para que una tarea de otro proyecto sea
   * indistinguible de una inexistente.
   */
  private async getTareaEnProyectoOrThrow(projectId: number, taskId: number) {
    const tarea = await this.prisma.tarea.findFirst({
      where: {
        idTarea: taskId,
        idProyecto: projectId,
        eliminadoEn: null,
        proyecto: { eliminadoEn: null },
      },
      select: { idTarea: true, idProyecto: true },
    });
    if (!tarea) {
      throw new NotFoundException(`Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`);
    }
    return tarea;
  }

  /**
   * Comprueba que `commentId` pertenezca exactamente a `taskId` (no a otra
   * tarea del mismo proyecto, ni a una tarea de otro proyecto, ni a un
   * comentario de proyecto o hito) y que no esté eliminado lógicamente.
   * Se llama únicamente después de `getTareaEnProyectoOrThrow`, así que un
   * comentario cruzado nunca revela su existencia en otro contexto: se
   * comporta exactamente igual que un `commentId` inexistente.
   */
  private async getComentarioEnTareaOrThrow(taskId: number, commentId: number) {
    const comentario = await this.prisma.comentario.findFirst({
      where: { idComentario: commentId, idTarea: taskId, eliminadoEn: null },
      select: { idComentario: true, idAutor: true },
    });
    if (!comentario) {
      throw new NotFoundException(
        `Comentario con id ${commentId} no encontrado en la tarea ${taskId}`,
      );
    }
    return comentario;
  }

  /**
   * Lectura de comentarios permitida solo al líder real del proyecto o a un
   * participante con participación activa. A diferencia de la escritura, no
   * depende del estado del proyecto.
   */
  private async assertChannelAReadAllowed(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    if (proyecto.creadoPor === userId) return;

    const participa = await this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
    if (!participa) {
      throw new ForbiddenException('No tienes acceso a los comentarios de este proyecto');
    }
  }

  /**
   * Tarea 28.B: las rutas genéricas (`PATCH`/`DELETE /comentarios/:idComentario`)
   * ya no pueden operar sobre un comentario de tarea, sin importar autoría o
   * liderazgo. Se lanza el mismo `NotFoundException` que usa la ausencia real
   * del comentario, para que un comentario de tarea sea indistinguible de uno
   * inexistente en el canal genérico. La única vía válida para un comentario
   * de tarea es la ruta anidada (`updateForTask`/`removeForTask`).
   */
  private assertNotTaskComment(comentario: { idTarea: number | null }): void {
    if (comentario.idTarea !== null) {
      throw new NotFoundException('Comentario no encontrado');
    }
  }

  async update(idComentario: number, userId: number, dto: UpdateComentarioDto) {
    const comentario = await this.prisma.comentario.findUnique({
      where: { idComentario },
      select: {
        idComentario: true,
        idAutor: true,
        eliminadoEn: true,
        idProyecto: true,
        idTarea: true,
        hito: { select: { idProyecto: true } },
      },
    });
    if (!comentario || comentario.eliminadoEn) {
      throw new NotFoundException('Comentario no encontrado');
    }
    this.assertNotTaskComment(comentario);
    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede editar este comentario');
    }

    const idProyecto = comentario.idProyecto ?? comentario.hito?.idProyecto;
    if (!idProyecto) throw new NotFoundException('Proyecto de comentario no encontrado');

    await this.assertChannelAWriteAllowed(idProyecto, userId);
    return this.prisma.comentario.update({
      where: { idComentario },
      data: { contenido: dto.contenido.trim(), editadoEn: new Date() },
    });
  }

  async remove(idComentario: number, userId: number) {
    const comentario = await this.prisma.comentario.findUnique({
      where: { idComentario },
      select: {
        idComentario: true,
        idAutor: true,
        eliminadoEn: true,
        idProyecto: true,
        idTarea: true,
        hito: { select: { idProyecto: true } },
      },
    });
    if (!comentario || comentario.eliminadoEn) {
      throw new NotFoundException('Comentario no encontrado');
    }
    this.assertNotTaskComment(comentario);
    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede eliminar este comentario');
    }

    const idProyecto = comentario.idProyecto ?? comentario.hito?.idProyecto;
    if (!idProyecto) throw new NotFoundException('Proyecto de comentario no encontrado');

    await this.assertChannelAWriteAllowed(idProyecto, userId);
    return this.prisma.comentario.update({
      where: { idComentario },
      data: { eliminadoEn: new Date() },
    });
  }

  /**
   * Actualización contextualizada (Tarea 28). Orden obligatorio: proyecto y
   * tarea válidos → el comentario pertenece exactamente a esa tarea →
   * autorización (misma política real: solo el autor, luego
   * `assertChannelAWriteAllowed`) → escritura. Un comentario de otra tarea,
   * de otro proyecto o de un hito/proyecto nunca llega a la comprobación de
   * autoría: `getComentarioEnTareaOrThrow` ya lo trata como inexistente.
   */
  async updateForTask(
    projectId: number,
    taskId: number,
    commentId: number,
    userId: number,
    dto: UpdateComentarioDto,
  ) {
    await this.getTareaEnProyectoOrThrow(projectId, taskId);
    const comentario = await this.getComentarioEnTareaOrThrow(taskId, commentId);

    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede editar este comentario');
    }

    await this.assertChannelAWriteAllowed(projectId, userId);
    return this.prisma.comentario.update({
      where: { idComentario: commentId },
      data: { contenido: dto.contenido.trim(), editadoEn: new Date() },
    });
  }

  /**
   * Eliminación contextualizada (Tarea 28): mismo orden y mismo mecanismo
   * real (soft delete vía `eliminadoEn`, nunca borrado físico) que
   * `updateForTask`.
   */
  async removeForTask(projectId: number, taskId: number, commentId: number, userId: number) {
    await this.getTareaEnProyectoOrThrow(projectId, taskId);
    const comentario = await this.getComentarioEnTareaOrThrow(taskId, commentId);

    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede eliminar este comentario');
    }

    await this.assertChannelAWriteAllowed(projectId, userId);
    return this.prisma.comentario.update({
      where: { idComentario: commentId },
      data: { eliminadoEn: new Date() },
    });
  }

  private async resolveProjectContext(dto: CreateComentarioDto) {
    if (dto.idProyecto) {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { idProyecto: dto.idProyecto },
        select: { idProyecto: true },
      });
      if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
      return proyecto;
    }
    if (dto.idHito) {
      const hito = await this.prisma.hito.findUnique({
        where: { idHito: dto.idHito },
        select: { idProyecto: true },
      });
      if (!hito) throw new NotFoundException('Hito no encontrado');
      return { idProyecto: hito.idProyecto };
    }
    throw new BadRequestException('Entidad de comentario inválida');
  }

  private async assertChannelAWriteAllowed(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    if (
      proyecto.estadoProyecto === EstadoProyecto.BORRADOR ||
      proyecto.estadoProyecto === EstadoProyecto.EN_REVISION ||
      proyecto.estadoProyecto === EstadoProyecto.OBSERVADO
    ) {
      if (proyecto.creadoPor !== userId) {
        throw new ForbiddenException('Solo el líder puede comentar en este estado');
      }
      return;
    }

    if (
      proyecto.estadoProyecto === EstadoProyecto.PUBLICADO ||
      proyecto.estadoProyecto === EstadoProyecto.EN_PROGRESO
    ) {
      const participa = await this.prisma.participacionProyecto.findFirst({
        where: {
          idUsuario: userId,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        select: { idParticipacion: true },
      });
      if (!participa) {
        throw new ForbiddenException('Debes ser participante activo para comentar');
      }
      return;
    }

    throw new ForbiddenException('El proyecto está en modo solo lectura');
  }
}
