import { Injectable, ForbiddenException } from '@nestjs/common';
import { EstadoProyecto, EstadoUsuario, EstadoHoras, TipoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private async requireAdmin(userId: number): Promise<void> {
    const record = await this.prisma.usuarioRolAcceso.findFirst({
      where: {
        idUsuario: userId,
        rolAcceso: { nombrePerfil: 'administrador' },
      },
    });
    if (!record) throw new ForbiddenException('Acceso restringido a administradores');
  }

  async getEstadisticas(userId: number) {
    await this.requireAdmin(userId);

    // Proxy de fecha: se usa fechaCreacion para nuevosInactivos y fechaActualizacion para proyectosCerrados
    const startOf2026 = new Date('2026-01-01T00:00:00.000Z');

    const [
      proyectosActivos,
      usuariosActivos,
      enRevision,
      cierrePendiente,
      usuariosBloqueados,
      nuevosInactivos2026,
      proyectosCerrados2026,
    ] = await Promise.all([
      this.prisma.proyecto.count({
        where: {
          estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
          eliminadoEn: null,
        },
      }),
      this.prisma.usuario.count({
        where: { estado: EstadoUsuario.ACTIVO },
      }),
      this.prisma.proyecto.count({
        where: { estadoProyecto: EstadoProyecto.EN_REVISION, eliminadoEn: null },
      }),
      this.prisma.proyecto.count({
        where: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE, eliminadoEn: null },
      }),
      this.prisma.usuario.count({
        where: { estado: EstadoUsuario.BLOQUEADO },
      }),
      // nuevosInactivos2026: usa fechaCreacion como proxy (no hay campo de cambio de estado)
      this.prisma.usuario.count({
        where: { estado: EstadoUsuario.INACTIVO, fechaCreacion: { gte: startOf2026 } },
      }),
      // proyectosCerrados2026: usa fechaActualizacion como proxy de fecha de cierre
      this.prisma.proyecto.count({
        where: {
          estadoProyecto: EstadoProyecto.CERRADO,
          fechaActualizacion: { gte: startOf2026 },
          eliminadoEn: null,
        },
      }),
    ]);

    const actividadReciente = await this.prisma.proyecto.findMany({
      where: { eliminadoEn: null },
      orderBy: { fechaActualizacion: 'desc' },
      take: 5,
      select: {
        idProyecto: true,
        tituloProyecto: true,
        estadoProyecto: true,
        fechaActualizacion: true,
      },
    });

    const perfilesRiesgo = await this.prisma.perfilEstudiante.findMany({
      where: { semestre: { gte: 7 } },
      select: {
        idUsuario: true,
        semestre: true,
        horasExtensionRequeridas: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
      take: 20,
    });

    const estudiantesConHoras = await Promise.all(
      perfilesRiesgo.map(async (p) => {
        const agg = await this.prisma.horasParticipacion.aggregate({
          where: {
            participacion: {
              idUsuario: p.idUsuario,
              rolProyecto: {
                proyecto: { tipoProyecto: TipoProyecto.EXTRACURRICULAR_EXTENSION },
              },
            },
            estadoHoras: EstadoHoras.APROBADA,
          },
          _sum: { horasAprobadas: true },
        });
        return {
          idUsuario: p.idUsuario,
          nombre: p.usuario.nombre,
          apellido: p.usuario.apellido,
          semestre: p.semestre,
          horasExtension: Number(agg._sum.horasAprobadas ?? 0),
          // fallback 20 si el perfil no tiene horasExtensionRequeridas configuradas
          horasExtensionRequeridas: p.horasExtensionRequeridas ?? 20,
        };
      }),
    );

    estudiantesConHoras.sort((a, b) => a.horasExtension - b.horasExtension);
    const estudiantesEnRiesgo = estudiantesConHoras.slice(0, 5);

    return {
      proyectosActivos,
      usuariosActivos,
      enRevision,
      cierrePendiente,
      usuariosBloqueados,
      nuevosInactivos2026,
      proyectosCerrados2026,
      actividadReciente,
      estudiantesEnRiesgo,
    };
  }
}
