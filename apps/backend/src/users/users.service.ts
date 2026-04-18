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

  async getProfileBootstrap(userId: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: userId },
      include: {
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
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const [carreras, habilidadesCatalog, interesesCatalog, cualidadesCatalog] =
      await Promise.all([
        this.prisma.carrera.findMany({
          select: { idCarrera: true, nombreCarrera: true },
          orderBy: { nombreCarrera: 'asc' },
        }),
        this.prisma.habilidad.findMany({
          select: { idHabilidad: true, nombreHabilidad: true },
          orderBy: { nombreHabilidad: 'asc' },
        }),
        this.prisma.interes.findMany({
          select: { idInteres: true, nombreInteres: true },
          orderBy: { nombreInteres: 'asc' },
        }),
        this.prisma.cualidad.findMany({
          select: { idCualidad: true, nombreCualidad: true },
          orderBy: { nombreCualidad: 'asc' },
        }),
      ]);

    const profile = {
      nombreCompleto: `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim(),
      correoInstitucional: user.correo ?? '',
      idCarrera: user.perfil?.idCarrera ?? null,
      carrera: user.perfil?.carrera?.nombreCarrera ?? '',
      anioAcademico: '',
      biografia: user.perfil?.biografia ?? '',
      disponibilidad: '',
      modalidadPreferida: 'hibrido',
      horarioDisponible: '',
      objetivoColaboracion: '',
      fotoUrl: user.fotoUrl ?? '',
      enlacePortafolio: user.perfil?.enlacePortafolio ?? '',
      githubUrl: user.perfil?.githubUrl ?? '',
      linkedinUrl: user.perfil?.linkedinUrl ?? '',
      urlCv: user.perfil?.urlCv ?? '',
      disponibilidadHorasSemana: user.perfil?.disponibilidadHorasSemana ?? 0,
      horasBecaRequeridas: user.perfil?.horasBecaRequeridas ?? 150,
      habilidades: user.habilidades.map((item) => ({
        idHabilidad: item.idHabilidad,
        nivelHabilidad: item.nivelHabilidad,
        nombre: item.habilidad.nombreHabilidad,
      })),
      intereses: user.intereses.map((item) => item.idInteres),
      cualidades: user.cualidades.map((item) => item.idCualidad),
    };

    const catalogs = {
      carreras: carreras.map((item) => ({
        id: item.idCarrera,
        nombre: item.nombreCarrera,
      })),
      habilidades: habilidadesCatalog.map((item) => ({
        id: item.idHabilidad,
        nombre: item.nombreHabilidad,
      })),
      intereses: interesesCatalog.map((item) => ({
        id: item.idInteres,
        nombre: item.nombreInteres,
      })),
      cualidades: cualidadesCatalog.map((item) => ({
        id: item.idCualidad,
        nombre: item.nombreCualidad,
      })),
      disponibilidades: [
        { id: 1, nombre: 'Tiempo completo' },
        { id: 2, nombre: 'Tiempo parcial' },
        { id: 3, nombre: 'Fines de semana' },
        { id: 4, nombre: 'Solo noches' },
        { id: 5, nombre: 'Flexible' },
      ],
      modalidades: [
        { value: 'presencial', label: 'Presencial' },
        { value: 'remoto', label: 'Remoto' },
        { value: 'hibrido', label: 'Híbrido' },
      ],
    };

    return { profile, catalogs };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      if (
        dto.nombreCompleto !== undefined ||
        dto.correoInstitucional !== undefined ||
        dto.fotoUrl !== undefined
      ) {
        const updateUsuarioData: Record<string, unknown> = {};

        if (dto.nombreCompleto !== undefined) {
          const [nombre, ...resto] = dto.nombreCompleto.trim().split(' ');
          updateUsuarioData.nombre = nombre;
          updateUsuarioData.apellido = resto.join(' ') || '';
        }

        if (dto.correoInstitucional !== undefined) {
          updateUsuarioData.correo = dto.correoInstitucional;
        }

        if (dto.fotoUrl !== undefined) {
          updateUsuarioData.fotoUrl = dto.fotoUrl;
        }

        await tx.usuario.update({
          where: { idUsuario: userId },
          data: updateUsuarioData,
        });
      }

      const perfil = await tx.perfilEstudiante.update({
        where: { idUsuario: userId },
        data: {
          ...(dto.idCarrera !== undefined && { idCarrera: dto.idCarrera }),
          ...(dto.biografia !== undefined && { biografia: dto.biografia }),
          ...(dto.enlacePortafolio !== undefined && {
            enlacePortafolio: dto.enlacePortafolio,
          }),
          ...(dto.githubUrl !== undefined && { githubUrl: dto.githubUrl }),
          ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
          ...(dto.urlCv !== undefined && { urlCv: dto.urlCv }),
          ...(dto.disponibilidadHorasSemana !== undefined && {
            disponibilidadHorasSemana: dto.disponibilidadHorasSemana,
          }),
          ...(dto.horasBecaRequeridas !== undefined && {
            horasBecaRequeridas: dto.horasBecaRequeridas,
          }),
          fechaActualizacion: new Date(),
        },
      });

      if (dto.habilidades) {
        await tx.usuarioHabilidad.deleteMany({ where: { idUsuario: userId } });
        if (dto.habilidades.length > 0) {
          await tx.usuarioHabilidad.createMany({
            data: dto.habilidades.map((h) => ({
              idUsuario: userId,
              idHabilidad: h.idHabilidad,
              nivelHabilidad: h.nivelHabilidad,
            })),
          });
        }
      }

      if (dto.intereses) {
        await tx.usuarioInteres.deleteMany({ where: { idUsuario: userId } });
        if (dto.intereses.length > 0) {
          await tx.usuarioInteres.createMany({
            data: dto.intereses.map((idInteres) => ({
              idUsuario: userId,
              idInteres,
            })),
          });
        }
      }

      if (dto.cualidades) {
        await tx.usuarioCualidad.deleteMany({ where: { idUsuario: userId } });
        if (dto.cualidades.length > 0) {
          await tx.usuarioCualidad.createMany({
            data: dto.cualidades.map((idCualidad) => ({
              idUsuario: userId,
              idCualidad,
            })),
          });
        }
      }

      return {
        message: 'Perfil actualizado correctamente',
        perfil,
      };
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
    habilidades: { idHabilidad: number; nivelHabilidad: 'BASICO' | 'INTERMEDIO' | 'AVANZADO' }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.usuarioHabilidad.deleteMany({ where: { idUsuario: userId } });
      if (habilidades.length > 0) {
        await tx.usuarioHabilidad.createMany({
          data: habilidades.map((h) => ({
            idUsuario: userId,
            idHabilidad: h.idHabilidad,
            nivelHabilidad: h.nivelHabilidad,
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
      select: { horasBecaRequeridas: true },
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
              include: {
                proyecto: {
                  select: { tituloProyecto: true, tipoProyecto: true },
                },
              },
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
      horasBecaRequeridas: perfil?.horasBecaRequeridas ?? 150,
      horasExtension: Number(horasExtensionResult._sum.horasAprobadas ?? 0),
      horasTotal: Number(horasData._sum.horasAprobadas ?? 0),
      proyectosActivos,
      postulacionesRecientes,
    };
  }
}
