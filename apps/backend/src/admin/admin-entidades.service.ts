import { Injectable } from '@nestjs/common';
import { EstadoOrganizacion, EstadoProyecto } from '@prisma/client';
import { alcanceDelActor, proyectoEnAlcanceWhere } from '../coordinador/coordinador-alcance';
import { ADMIN_ACTIVE_PROJECT_STATES } from '../common/project-policy/admin-active-project-states';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVOS: string[] = [...ADMIN_ACTIVE_PROJECT_STATES];

const contarProyectos = (filas: { estadoProyecto: EstadoProyecto }[]) => ({
  proyectosTotales: filas.length,
  proyectosActivos: filas.filter((p) => ACTIVOS.includes(p.estadoProyecto)).length,
  proyectosCerrados: filas.filter((p) => p.estadoProyecto === EstadoProyecto.CERRADO).length,
});

@Injectable()
export class AdminEntidadesService {
  constructor(private readonly prisma: PrismaService) {}

  /** MEJ-36: actividad de cada asociacion y organizacion (miembros y proyectos). */
  async metricas(idActor: number) {
    // Administrador: todo. Coordinador: asociaciones de sus carreras y organizaciones con proyectos suyos.
    const alcance = await alcanceDelActor(this.prisma, idActor);
    const proyectoEn = alcance ? proyectoEnAlcanceWhere(alcance, idActor) : {};
    const [asociaciones, organizaciones] = await Promise.all([
      this.prisma.asociacion.findMany({
        where: alcance ? { carreras: { some: { idCarrera: { in: alcance } } } } : {},
        orderBy: { nombre: 'asc' },
        select: {
          idAsociacion: true,
          nombre: true,
          archivada: true,
          _count: { select: { junta: true, carreras: true } },
          proyectos: { where: { eliminadoEn: null, ...proyectoEn }, select: { estadoProyecto: true } },
        },
      }),
      this.prisma.organizacion.findMany({
        where: alcance ? { proyectos: { some: { proyecto: { eliminadoEn: null, ...proyectoEn } } } } : {},
        orderBy: { nombreOrganizacion: 'asc' },
        select: {
          idOrganizacion: true,
          nombreOrganizacion: true,
          estadoOrganizacion: true,
          visibilidad: true,
          _count: { select: { miembros: true } },
          proyectos: {
            where: alcance ? { proyecto: proyectoEn } : {},
            select: { proyecto: { select: { estadoProyecto: true, eliminadoEn: true } } },
          },
        },
      }),
    ]);
    return {
      asociaciones: asociaciones.map((a) => ({
        idAsociacion: a.idAsociacion,
        nombre: a.nombre,
        archivada: a.archivada,
        integrantesJunta: a._count.junta,
        carreras: a._count.carreras,
        ...contarProyectos(a.proyectos),
      })),
      organizaciones: organizaciones.map((o) => ({
        idOrganizacion: o.idOrganizacion,
        nombre: o.nombreOrganizacion,
        archivada: o.estadoOrganizacion === EstadoOrganizacion.INACTIVA,
        visibilidad: o.visibilidad,
        miembros: o._count.miembros,
        ...contarProyectos(o.proyectos.map((p) => p.proyecto).filter((p) => p.eliminadoEn === null)),
      })),
    };
  }
}
