import { Injectable } from '@nestjs/common';
import { addDaysToDay } from '../common/utils/guatemala-date';
import { HorasSemestreService, inicioDeDia } from '../horas-semestre/horas-semestre.service';
import { listarInsigniasUsuario } from '../insignias/insignias.service';
import { PrismaService } from '../prisma/prisma.service';

/** MEJ-150: cifras propias del semestre actual para la tarjeta «Mi semestre en UVGenius». Nunca incluye correo, carne ni telefono. */
@Injectable()
export class SemestreResumenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
  ) {}

  async resumen(idUsuario: number) {
    const { semestre, beca, extension } = await this.horas.getProgreso(idUsuario);
    const desde = inicioDeDia(semestre.inicio);
    const hasta = inicioDeDia(addDaysToDay(semestre.fin, 1));
    const ventana = { gte: desde, lt: hasta };
    const activo = { in: ['ACTIVO', 'COMPLETADO'] as Array<'ACTIVO' | 'COMPLETADO'> };

    const [participaciones, liderados, tareas, reconocimientos, insignias] = await Promise.all([
      this.prisma.participacionProyecto.findMany({
        where: {
          idUsuario,
          estadoParticipacion: activo,
          fechaIngreso: { lt: hasta },
          OR: [{ fechaSalida: null }, { fechaSalida: { gte: desde } }],
          rolProyecto: { proyecto: { eliminadoEn: null } },
        },
        select: { rolProyecto: { select: { idProyecto: true } } },
      }),
      this.prisma.proyecto.findMany({
        where: {
          creadoPor: idUsuario,
          eliminadoEn: null,
          estadoProyecto: { in: ['EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO'] },
          fechaInicio: { lt: hasta },
          OR: [{ fechaFinEstimada: null }, { fechaFinEstimada: { gte: desde } }],
        },
        select: { idProyecto: true },
      }),
      this.prisma.tarea.count({
        where: { estadoTarea: 'HECHO', eliminadoEn: null, actualizadaEn: ventana, asignaciones: { some: { idUsuario } } },
      }),
      this.prisma.reconocimientoCompanero.count({ where: { idReceptor: idUsuario, creadoEn: ventana } }),
      listarInsigniasUsuario(this.prisma, idUsuario, true),
    ]);

    const proyectos = new Set([...participaciones.map((p) => p.rolProyecto.idProyecto), ...liderados.map((p) => p.idProyecto)]);
    const enSemestre = (f: string | null) => f !== null && f >= desde.toISOString() && f < hasta.toISOString();
    return {
      semestre: { anio: semestre.anio, periodo: semestre.periodo },
      horasAcreditadas: beca.acreditadas + extension.acreditadas,
      proyectos: proyectos.size,
      tareasCompletadas: tareas,
      reconocimientos,
      insignias: insignias
        .filter((i) => Object.values(i.fechas).some(enSemestre))
        .map((i) => ({ clave: i.clave, nombre: i.nombre, nivel: i.nivel })),
    };
  }
}
