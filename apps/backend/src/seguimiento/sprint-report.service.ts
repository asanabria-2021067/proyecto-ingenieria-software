import { Injectable } from '@nestjs/common';
import { EstadoSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { SprintsContextService } from '../sprints/sprints-context.service';
import { buildSprintReportCsv, renderSprintReportPdf, type ModeloReporteSprint } from './sprint-report.builder';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * MEJ-23: reporte del Sprint en CSV y PDF. Mismo permiso que la exportación
 * del proyecto (scope `exportacion` de ProjectReadPolicyService: líder y
 * administración). Un Sprint CERRADO usa la instantánea congelada al cierre
 * para el resumen; el detalle sale de las tareas que siguen en el Sprint.
 */
@Injectable()
export class SprintReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly sprintsContext: SprintsContextService,
    private readonly bitacora: BitacoraEventosService,
  ) {}

  async modelo(projectId: number, sprintId: number, actorId: number): Promise<ModeloReporteSprint> {
    await this.readPolicy.assertRead(undefined, { projectId, actorId, scope: 'exportacion', entitySprintId: sprintId });
    const [proyecto, sprint, tareas, retro] = await Promise.all([
      this.sprintsContext.getProjectOrThrow(projectId),
      this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId),
      this.prisma.tarea.findMany({
        where: { idSprint: sprintId, idProyecto: projectId, eliminadoEn: null },
        orderBy: [{ orden: 'asc' }, { idTarea: 'asc' }],
        select: {
          tituloTarea: true,
          estadoTarea: true,
          prioridad: true,
          puntosHistoria: true,
          fechaLimite: true,
          hito: { select: { tituloHito: true } },
          asignaciones: {
            orderBy: { fechaAsignacion: 'desc' },
            select: { horasReales: true, desasignadaEn: true, usuario: { select: { nombre: true, apellido: true } } },
          },
        },
      }),
      this.prisma.retrospectivaSprint.findUnique({
        where: { idSprint: sprintId },
        select: { quePaso: true, quePodriaMejorar: true, acuerdos: true },
      }),
    ]);

    const filas = tareas.map((t) => {
      const vigente = t.asignaciones.find((a) => a.desasignadaEn === null) ?? t.asignaciones[0];
      return {
        titulo: t.tituloTarea,
        estado: t.estadoTarea,
        prioridad: t.prioridad,
        puntos: t.puntosHistoria,
        responsable: vigente ? `${vigente.usuario.nombre} ${vigente.usuario.apellido}` : 'Sin asignar',
        horas: redondear(t.asignaciones.reduce((s, a) => s + Number(a.horasReales ?? 0), 0)),
        fechaLimite: iso(t.fechaLimite),
        hito: t.hito?.tituloHito ?? '',
      };
    });

    const integrantes = new Map<string, { nombre: string; tareasHechas: number; horas: number }>();
    tareas.forEach((t, i) => {
      for (const a of t.asignaciones) {
        const nombre = `${a.usuario.nombre} ${a.usuario.apellido}`;
        const fila = integrantes.get(nombre) ?? { nombre, tareasHechas: 0, horas: 0 };
        fila.horas = redondear(fila.horas + Number(a.horasReales ?? 0));
        if (a.desasignadaEn === null && filas[i].estado === 'HECHO') fila.tareasHechas += 1;
        integrantes.set(nombre, fila);
      }
    });

    const hechas = filas.filter((f) => f.estado === 'HECHO');
    const congelado = sprint.estado === EstadoSprint.CERRADO && sprint.tareasPlanificadasCierre !== null;
    const planificadas = congelado ? sprint.tareasPlanificadasCierre! : filas.length;
    const completadas = congelado ? (sprint.tareasCompletadasCierre ?? 0) : hechas.length;
    return {
      proyecto: proyecto.tituloProyecto,
      sprint: {
        numero: sprint.numero,
        estado: sprint.estado,
        fechaInicio: iso(sprint.fechaInicio)!,
        fechaFinPlaneada: iso(sprint.fechaFinPlaneada),
        fechaCierre: iso(sprint.fechaCierre),
      },
      resumen: {
        tareasPlanificadas: planificadas,
        tareasCompletadas: completadas,
        porcentajeCumplimiento: congelado
          ? (sprint.porcentajeCumplimientoCierre ?? 0)
          : planificadas === 0
            ? 0
            : Math.round((completadas / planificadas) * 100),
        puntosPlanificados: congelado ? (sprint.puntosHistoriaPlanificadosCierre ?? 0) : filas.reduce((s, f) => s + (f.puntos ?? 0), 0),
        puntosCompletados: congelado ? (sprint.puntosHistoriaCompletadosCierre ?? 0) : hechas.reduce((s, f) => s + (f.puntos ?? 0), 0),
      },
      tareas: filas,
      integrantes: [...integrantes.values()],
      retrospectiva: retro,
      generadoEn: iso(new Date())!,
    };
  }

  async csv(projectId: number, sprintId: number, actorId: number): Promise<Buffer> {
    const bytes = Buffer.from(buildSprintReportCsv(await this.modelo(projectId, sprintId, actorId)), 'utf-8');
    await this.registrar(projectId, sprintId, actorId, TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED);
    return bytes;
  }

  async pdf(projectId: number, sprintId: number, actorId: number): Promise<Buffer> {
    const bytes = renderSprintReportPdf(await this.modelo(projectId, sprintId, actorId));
    await this.registrar(projectId, sprintId, actorId, TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED);
    return bytes;
  }

  /** Igual que la exportación del proyecto: la bitácora se escribe DESPUÉS de generar el archivo. */
  private registrar(
    projectId: number,
    sprintId: number,
    actorId: number,
    tipoEvento: typeof TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED | typeof TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
  ) {
    return this.prisma.$transaction((tx) =>
      this.bitacora.registrarEvento({
        tx,
        tipoEvento,
        idActor: actorId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintId,
        valorNuevo: { reporte: 'sprint' },
      }),
    );
  }
}
