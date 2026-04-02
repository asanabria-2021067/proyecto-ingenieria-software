import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { TipoProyecto } from '@prisma/client';

const TIPOS_VALIDOS: TipoProyecto[] = [
  'ACADEMICO_HORAS_BECA',
  'ACADEMICO_EXPERIENCIA',
  'EXTRACURRICULAR_EXTENSION',
];

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.proyecto.findMany({
      where: { eliminadoEn: null },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        idProyecto: true,
        tituloProyecto: true,
        descripcionProyecto: true,
        tipoProyecto: true,
        estadoProyecto: true,
        modalidadProyecto: true,
        fechaInicio: true,
        fechaFinEstimada: true,
        fechaCreacion: true,
        creador: {
          select: { nombre: true, apellido: true },
        },
        organizaciones: {
          select: {
            organizacion: { select: { nombreOrganizacion: true } },
          },
        },
      },
    });
  }

  async findOne(id: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: id, eliminadoEn: null },
      include: {
        creador: { select: { nombre: true, apellido: true, correo: true } },
        organizaciones: { include: { organizacion: true } },
        roles: true,
        hitos: true,
      },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    return proyecto;
  }

  async create(data: CreateProjectDto) {
    const {
      tituloProyecto,
      descripcionProyecto,
      tipoProyecto,
      creadoPor,
      fechaInicio,
      fechaFinEstimada,
      ...rest
    } = data;

    if (!tituloProyecto?.trim()) {
      throw new BadRequestException('El título del proyecto es requerido');
    }
    if (!descripcionProyecto?.trim()) {
      throw new BadRequestException('La descripción del proyecto es requerida');
    }
    if (!tipoProyecto || !TIPOS_VALIDOS.includes(tipoProyecto)) {
      throw new BadRequestException(
        `Tipo de proyecto inválido. Valores permitidos: ${TIPOS_VALIDOS.join(', ')}`,
      );
    }
    if (!creadoPor) {
      throw new BadRequestException('El campo creadoPor es requerido');
    }

    return this.prisma.proyecto.create({
      data: {
        tituloProyecto: tituloProyecto.trim(),
        descripcionProyecto: descripcionProyecto.trim(),
        tipoProyecto,
        creadoPor,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
        fechaFinEstimada: fechaFinEstimada
          ? new Date(fechaFinEstimada)
          : undefined,
        ...rest,
      },
      include: {
        creador: { select: { nombre: true, apellido: true } },
      },
    });
  }
}
