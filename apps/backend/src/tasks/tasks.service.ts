import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(idProyecto?: number) {
    return this.prisma.tarea.findMany({
      where: idProyecto ? { idProyecto } : undefined,
      include: { asignaciones: true },
      orderBy: { fechaCreacion: 'asc' },
    });
  }

  async findOne(idTarea: number) {
    const tarea = await this.prisma.tarea.findUnique({
      where: { idTarea },
      include: { asignaciones: true },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    return tarea;
  }

  async create(dto: CreateTareaDto, creadaPor: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: dto.idProyecto },
      select: { idProyecto: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    return this.prisma.tarea.create({
      data: {
        idProyecto: dto.idProyecto,
        idHito: dto.idHito,
        tituloTarea: dto.tituloTarea,
        descripcionTarea: dto.descripcionTarea,
        prioridad: dto.prioridad,
        creadaPor,
      },
    });
  }

  async update(idTarea: number, dto: UpdateTareaDto) {
    await this.findOne(idTarea);

    return this.prisma.tarea.update({
      where: { idTarea },
      data: {
        tituloTarea: dto.tituloTarea,
        descripcionTarea: dto.descripcionTarea,
        estadoTarea: dto.estadoTarea,
        prioridad: dto.prioridad,
        idHito: dto.idHito,
        actualizadaEn: new Date(),
      },
    });
  }

  async assign(idTarea: number, idUsuario: number, asignadoPor: number) {
    await this.findOne(idTarea);

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: { idUsuario: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const yaAsignada = await this.prisma.asignacionTarea.findUnique({
      where: { idTarea_idUsuario: { idTarea, idUsuario } },
    });
    if (yaAsignada) throw new ConflictException('El usuario ya está asignado a esta tarea');

    return this.prisma.asignacionTarea.create({
      data: { idTarea, idUsuario, asignadoPor },
    });
  }

  async remove(idTarea: number) {
    await this.findOne(idTarea);

    await this.prisma.$transaction([
      this.prisma.comentario.deleteMany({ where: { idTarea } }),
      this.prisma.asignacionTarea.deleteMany({ where: { idTarea } }),
      this.prisma.tarea.delete({ where: { idTarea } }),
    ]);

    return { mensaje: 'Tarea eliminada' };
  }
}
