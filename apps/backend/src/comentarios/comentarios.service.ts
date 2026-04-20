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

  async create(userId: number, dto: CreateComentarioDto) {
    const parentCount = Number(!!dto.idProyecto) + Number(!!dto.idTarea) + Number(!!dto.idHito);
    if (parentCount !== 1) {
      throw new BadRequestException(
        'Debes enviar exactamente una entidad destino: idProyecto, idTarea o idHito',
      );
    }

    const contexto = await this.resolveProjectContext(dto);
    await this.assertChannelAWriteAllowed(contexto.idProyecto, userId);

    const comentario = await this.prisma.comentario.create({
      data: {
        idAutor: userId,
        idProyecto: dto.idProyecto,
        idTarea: dto.idTarea,
        idHito: dto.idHito,
        contenido: dto.contenido.trim(),
      },
    });

    const tipo = dto.idProyecto
      ? TipoNotificacion.COMENTARIO_PROYECTO
      : dto.idTarea
        ? TipoNotificacion.COMENTARIO_TAREA
        : TipoNotificacion.COMENTARIO_HITO;

    await this.notifications.notifyProjectActiveParticipants(
      contexto.idProyecto,
      userId,
      {
        tipoNotificacion: tipo,
        tituloNotificacion: 'Nuevo comentario',
        mensajeNotificacion: 'Se agregó un comentario nuevo en el proyecto.',
        datosJson: {
          idProyecto: contexto.idProyecto,
          idComentario: comentario.idComentario,
          idTarea: dto.idTarea ?? null,
          idHito: dto.idHito ?? null,
        },
      },
    );

    return comentario;
  }

  findByProyecto(idProyecto: number) {
    return this.prisma.comentario.findMany({
      where: { idProyecto, eliminadoEn: null },
      include: { autor: { select: { idUsuario: true, nombre: true, apellido: true } } },
      orderBy: { creadoEn: 'asc' },
    });
  }

  findByTarea(idTarea: number) {
    return this.prisma.comentario.findMany({
      where: { idTarea, eliminadoEn: null },
      include: { autor: { select: { idUsuario: true, nombre: true, apellido: true } } },
      orderBy: { creadoEn: 'asc' },
    });
  }

  findByHito(idHito: number) {
    return this.prisma.comentario.findMany({
      where: { idHito, eliminadoEn: null },
      include: { autor: { select: { idUsuario: true, nombre: true, apellido: true } } },
      orderBy: { creadoEn: 'asc' },
    });
  }

  async update(idComentario: number, userId: number, dto: UpdateComentarioDto) {
    const comentario = await this.prisma.comentario.findUnique({
      where: { idComentario },
      select: {
        idComentario: true,
        idAutor: true,
        eliminadoEn: true,
        idProyecto: true,
        tarea: { select: { idProyecto: true } },
        hito: { select: { idProyecto: true } },
      },
    });
    if (!comentario || comentario.eliminadoEn) {
      throw new NotFoundException('Comentario no encontrado');
    }
    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede editar este comentario');
    }

    const idProyecto =
      comentario.idProyecto ?? comentario.tarea?.idProyecto ?? comentario.hito?.idProyecto;
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
        tarea: { select: { idProyecto: true } },
        hito: { select: { idProyecto: true } },
      },
    });
    if (!comentario || comentario.eliminadoEn) {
      throw new NotFoundException('Comentario no encontrado');
    }
    if (comentario.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede eliminar este comentario');
    }

    const idProyecto =
      comentario.idProyecto ?? comentario.tarea?.idProyecto ?? comentario.hito?.idProyecto;
    if (!idProyecto) throw new NotFoundException('Proyecto de comentario no encontrado');

    await this.assertChannelAWriteAllowed(idProyecto, userId);
    return this.prisma.comentario.update({
      where: { idComentario },
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
    if (dto.idTarea) {
      const tarea = await this.prisma.tarea.findUnique({
        where: { idTarea: dto.idTarea },
        select: { idProyecto: true },
      });
      if (!tarea) throw new NotFoundException('Tarea no encontrada');
      return { idProyecto: tarea.idProyecto };
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
