import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateProfileDto,
  CreateExperienciaDto,
} from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: userId },
      select: {
        idUsuario: true,
        correo: true,
        nombre: true,
        apellido: true,
        fotoUrl: true,
        estado: true,
        perfil: {
          include: { carrera: true },
        },
        habilidades: {
          include: { habilidad: true },
        },
        intereses: {
          include: { interes: true },
        },
        cualidades: {
          include: { cualidad: true },
        },
        experiencias: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async getProfile(userId: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: userId },
      select: {
        idUsuario: true,
        correo: true,
        nombre: true,
        apellido: true,
        fotoUrl: true,
        perfil: {
          include: { carrera: true },
        },
        habilidades: {
          include: { habilidad: true },
        },
        intereses: {
          include: { interes: true },
        },
        cualidades: {
          include: { cualidad: true },
        },
        experiencias: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const hasUsuarioFields = dto.nombre !== undefined || dto.apellido !== undefined;
    const hasPerfilFields =
      dto.biografia !== undefined ||
      dto.enlacePortafolio !== undefined ||
      dto.githubUrl !== undefined ||
      dto.linkedinUrl !== undefined ||
      dto.urlCv !== undefined ||
      dto.idCarrera !== undefined ||
      dto.semestre !== undefined ||
      dto.disponibilidadHorasSemana !== undefined ||
      dto.horasBecaRequeridas !== undefined ||
      dto.horasExtensionRequeridas !== undefined;

    return this.prisma.$transaction(async (tx) => {
      if (hasUsuarioFields) {
        await tx.usuario.update({
          where: { idUsuario: userId },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.apellido !== undefined && { apellido: dto.apellido }),
          },
        });
      }

      if (hasPerfilFields) {
        await tx.perfilEstudiante.update({
          where: { idUsuario: userId },
          data: {
            ...(dto.biografia !== undefined && { biografia: dto.biografia }),
            ...(dto.enlacePortafolio !== undefined && { enlacePortafolio: dto.enlacePortafolio }),
            ...(dto.githubUrl !== undefined && { githubUrl: dto.githubUrl }),
            ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
            ...(dto.urlCv !== undefined && { urlCv: dto.urlCv }),
            ...(dto.idCarrera !== undefined && { idCarrera: dto.idCarrera }),
            ...(dto.semestre !== undefined && { semestre: dto.semestre }),
            ...(dto.disponibilidadHorasSemana !== undefined && {
              disponibilidadHorasSemana: dto.disponibilidadHorasSemana,
            }),
            ...(dto.horasBecaRequeridas !== undefined && {
              horasBecaRequeridas: dto.horasBecaRequeridas,
            }),
            ...(dto.horasExtensionRequeridas !== undefined && {
              horasExtensionRequeridas: dto.horasExtensionRequeridas,
            }),
            fechaActualizacion: new Date(),
          },
        });
      }

      return this.getProfile(userId);
    });
  }

  async updateFotoUrl(userId: number, fotoUrl: string) {
    return this.prisma.usuario.update({
      where: { idUsuario: userId },
      data: { fotoUrl },
    });
  }

  async replaceHabilidades(
    userId: number,
    habilidades: { idHabilidad: number; nivelHabilidad: 'BASICO' | 'INTERMEDIO' | 'AVANZADO'; aniosExperiencia?: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.usuarioHabilidad.deleteMany({ where: { idUsuario: userId } });
      if (habilidades.length > 0) {
        await tx.usuarioHabilidad.createMany({
          data: habilidades.map((h) => ({
            idUsuario: userId,
            idHabilidad: h.idHabilidad,
            nivelHabilidad: h.nivelHabilidad,
            ...(h.aniosExperiencia !== undefined && { aniosExperiencia: h.aniosExperiencia }),
          })),
        });
      }
      return { count: habilidades.length };
    });
  }

  async replaceIntereses(userId: number, intereses: number[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.usuarioInteres.deleteMany({ where: { idUsuario: userId } });
      if (intereses.length > 0) {
        await tx.usuarioInteres.createMany({
          data: intereses.map((idInteres) => ({
            idUsuario: userId,
            idInteres,
          })),
        });
      }
      return { count: intereses.length };
    });
  }

  async replaceCualidades(userId: number, cualidades: number[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.usuarioCualidad.deleteMany({ where: { idUsuario: userId } });
      if (cualidades.length > 0) {
        await tx.usuarioCualidad.createMany({
          data: cualidades.map((idCualidad) => ({
            idUsuario: userId,
            idCualidad,
          })),
        });
      }
      return { count: cualidades.length };
    });
  }

  async addExperiencia(userId: number, dto: CreateExperienciaDto) {
    return this.prisma.experienciaPrevia.create({
      data: {
        idUsuario: userId,
        tituloProyectoExperiencia: dto.tituloProyectoExperiencia,
        rolDesempenado: dto.rolDesempenado,
        tipoExperiencia: dto.tipoExperiencia ?? 'OTRO',
      },
    });
  }

  async getDashboard(userId: number) {
    const perfil = await this.prisma.perfilEstudiante.findUnique({
      where: { idUsuario: userId },
      select: {
        horasBecaRequeridas: true,
        horasExtensionRequeridas: true,
      },
    });

    const [horasData, proyectosActivos, postulacionesRecientes] =
      await Promise.all([
        this.prisma.horasParticipacion.aggregate({
          where: {
            participacion: { idUsuario: userId },
            estadoHoras: 'APROBADA',
          },
          _sum: { horasAprobadas: true },
        }),
        this.prisma.participacionProyecto.count({
          where: { idUsuario: userId, estadoParticipacion: 'ACTIVO' },
        }),
        this.prisma.postulacion.findMany({
          where: { idUsuarioPostulante: userId },
          orderBy: { fechaPostulacion: 'desc' },
          take: 5,
          include: {
            rolProyecto: {
              include: { proyecto: { select: { tituloProyecto: true, tipoProyecto: true } } },
            },
          },
        }),
      ]);

    const horasBecaResult = await this.prisma.horasParticipacion.aggregate({
      where: {
        participacion: {
          idUsuario: userId,
          rolProyecto: {
            proyecto: { tipoProyecto: 'ACADEMICO_HORAS_BECA' },
          },
        },
        estadoHoras: 'APROBADA',
      },
      _sum: { horasAprobadas: true },
    });

    const horasExtensionResult = await this.prisma.horasParticipacion.aggregate({
      where: {
        participacion: {
          idUsuario: userId,
          rolProyecto: {
            proyecto: { tipoProyecto: 'EXTRACURRICULAR_EXTENSION' },
          },
        },
        estadoHoras: 'APROBADA',
      },
      _sum: { horasAprobadas: true },
    });

    return {
      horasBeca: Number(horasBecaResult._sum.horasAprobadas ?? 0),
      horasBecaRequeridas: perfil?.horasBecaRequeridas ?? null,
      horasExtension: Number(horasExtensionResult._sum.horasAprobadas ?? 0),
      horasExtensionRequeridas: perfil?.horasExtensionRequeridas ?? null,
      horasTotal: Number(horasData._sum.horasAprobadas ?? 0),
      proyectosActivos,
      postulacionesRecientes,
    };
  }
}
