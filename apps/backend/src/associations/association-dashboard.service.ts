import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HorasSemestreService } from '../horas-semestre/horas-semestre.service';
import { DashboardEstudiantesQueryDto, DashboardReporteQueryDto } from './dto/dashboard-query.dto';
import type { FilaProyectoAsociacion } from '../exports/proyectos-asociacion-report.builder';

const pct = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 100));

/**
 * Dashboard de asociacion, solo lectura. La autorizacion (junta de ESA asociacion) la hace `JuntaGuard`;
 * el filtro por `idAsociacion` fija las carreras visibles, asi que nunca salen estudiantes de carreras ajenas.
 */
@Injectable()
export class AssociationDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
  ) {}

  estudiantes(idAsociacion: number, q: DashboardEstudiantesQueryDto) {
    return this.horas.paginaCentral({ ...q, idAsociacion, conProyectos: true });
  }

  todosLosEstudiantes(idAsociacion: number, q: DashboardReporteQueryDto) {
    return this.horas.recorrerTodas({ ...q, idAsociacion, conProyectos: true });
  }

  async proyectos(idAsociacion: number): Promise<(FilaProyectoAsociacion & { idProyecto: number })[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        idAsociacion,
        eliminadoEn: null,
        estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO'] },
      },
      orderBy: { idProyecto: 'desc' },
      select: { idProyecto: true, tituloProyecto: true, estadoProyecto: true },
    });
    const ids = proyectos.map((p) => p.idProyecto);
    const [tareas, sprints, participaciones, horas] = await Promise.all([
      this.prisma.tarea.groupBy({
        by: ['idProyecto', 'estadoTarea'],
        where: { idProyecto: { in: ids }, eliminadoEn: null },
        _count: { _all: true },
      }),
      this.prisma.sprint.groupBy({ by: ['idProyecto', 'estado'], where: { idProyecto: { in: ids } }, _count: { _all: true } }),
      this.prisma.participacionProyecto.findMany({
        where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: { in: ids } } },
        select: { idUsuario: true, rolProyecto: { select: { idProyecto: true } } },
      }),
      this.prisma.horasParticipacion.findMany({
        where: { estadoHoras: 'APROBADA', participacion: { rolProyecto: { idProyecto: { in: ids } } } },
        select: { horasAprobadas: true, participacion: { select: { rolProyecto: { select: { idProyecto: true } } } } },
      }),
    ]);

    return proyectos.map((p) => {
      const avance = <T extends { idProyecto: number; _count: { _all: number } }>(filas: T[], hecho: (f: T) => boolean) => {
        const propias = filas.filter((f) => f.idProyecto === p.idProyecto);
        const suma = (l: T[]) => l.reduce((a, f) => a + f._count._all, 0);
        return pct(suma(propias.filter(hecho)), suma(propias));
      };
      return {
        idProyecto: p.idProyecto,
        titulo: p.tituloProyecto,
        estado: p.estadoProyecto,
        avanceTareasPct: avance(tareas, (f) => f.estadoTarea === 'HECHO'),
        avanceSprintsPct: avance(sprints, (f) => f.estado === 'CERRADO'),
        integrantes: new Set(participaciones.filter((x) => x.rolProyecto.idProyecto === p.idProyecto).map((x) => x.idUsuario)).size,
        horasAcreditadas: horas
          .filter((h) => h.participacion.rolProyecto.idProyecto === p.idProyecto)
          .reduce((a, h) => a + Number(h.horasAprobadas ?? 0), 0),
      };
    });
  }
}
