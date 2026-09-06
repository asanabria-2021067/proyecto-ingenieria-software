import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoProyecto, EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { ProjectHoursSummaryService } from '../sprints/project-hours-summary.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import {
  ADMIN_PROJECTS_DEFAULT_LIMIT,
  ADMIN_PROJECTS_DEFAULT_PAGE,
  type AdminProjectGroup,
  type AdminProjectsQueryDto,
} from './dto/admin-projects-query.dto';

/**
 * §46: los cuatro grupos de la bandeja administrativa mapean estados
 * concretos. La acción sugerida acompaña al grupo; no concede autoridad.
 */
const GRUPOS: Readonly<
  Record<AdminProjectGroup, { estados: EstadoProyecto[]; accion: string }>
> = {
  activos: {
    estados: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO],
    accion: 'MONITOREAR',
  },
  revision: {
    estados: [EstadoProyecto.EN_REVISION, EstadoProyecto.OBSERVADO],
    accion: 'REVISAR_PUBLICACION',
  },
  cierres: { estados: [EstadoProyecto.EN_SOLICITUD_CIERRE], accion: 'REVISAR_CIERRE' },
  cerrados: { estados: [EstadoProyecto.CERRADO], accion: 'CONSULTAR_HISTORICO' },
};

/** El Sprint operable se resume; su detalle en vivo no es del administrador. */
const SPRINT_OPERABLE: EstadoSprint[] = [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION];

/**
 * C121/C122/C123 (06 v2 §34/§40/§46): lecturas históricas y administrativas de proyecto.
 *
 * Es un servicio de LECTURA sin ninguna ruta de escritura: componer la vista
 * de un proyecto cerrado no puede, por definición, alterarlo. Cada método
 * decide con `ProjectReadPolicyService`, que es el único decisor de lectura;
 * no se construye aquí una segunda autorización.
 *
 * Esqueleto en C121: las composiciones llegan en los commits que las
 * contratan y el módulo todavía no se registra.
 */

export interface HistoricalProjectView {
  projectId: number;
  [clave: string]: unknown;
}

export interface AdminProjectsPage {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class HistoricalProjectReadService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly readPolicy: ProjectReadPolicyService,
    protected readonly hours: ProjectHoursSummaryService,
    protected readonly policy: ProjectPolicyService,
  ) {}

  /**
   * E116 (§46): bandeja administrativa por grupo.
   *
   * El Sprint ambiente viaja como RESUMEN —identificador, número y estado—
   * y nunca como detalle: el administrador supervisa el avance, no opera
   * dentro del Sprint de un equipo.
   */
  async adminList(actorId: number, query: AdminProjectsQueryDto): Promise<AdminProjectsPage> {
    await this.policy.assertAdminTx(this.prisma as unknown as Prisma.TransactionClient, actorId);
    const page = query.page ?? ADMIN_PROJECTS_DEFAULT_PAGE;
    const limit = query.limit ?? ADMIN_PROJECTS_DEFAULT_LIMIT;
    const grupo = GRUPOS[query.grupo];

    const where: Prisma.ProyectoWhereInput = {
      estadoProyecto: { in: grupo.estados },
      eliminadoEn: null,
    };
    const [total, proyectos] = await Promise.all([
      this.prisma.proyecto.count({ where }),
      this.prisma.proyecto.findMany({
        where,
        orderBy: { idProyecto: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          idProyecto: true,
          tituloProyecto: true,
          estadoProyecto: true,
          creador: { select: { idUsuario: true, nombre: true, apellido: true } },
          sprints: {
            where: { estado: { in: SPRINT_OPERABLE } },
            select: { idSprint: true, numero: true, estado: true },
            take: 1,
          },
          roles: {
            select: {
              participaciones: {
                where: { estadoParticipacion: 'ACTIVO' },
                select: { idUsuario: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: proyectos.map((proyecto) => ({
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        estadoProyecto: proyecto.estadoProyecto,
        lider: proyecto.creador,
        // Usuarios ACTIVOS distintos: alguien con dos roles cuenta una vez.
        usuariosActivos: new Set(
          proyecto.roles.flatMap((rol) => rol.participaciones.map((fila) => fila.idUsuario)),
        ).size,
        sprintAmbiente:
          proyecto.sprints.length > 0
            ? {
                idSprint: proyecto.sprints[0].idSprint,
                numero: proyecto.sprints[0].numero,
                estado: proyecto.sprints[0].estado,
              }
            : null,
        accion: grupo.accion,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * E117 (§34): detalle administrativo.
   *
   * En un proyecto vivo el administrador ve resumen, miembros y liderazgo, y
   * de los Sprints solo los CERRADOS: la ejecución en curso pertenece al
   * equipo. En un proyecto cerrado ve el histórico completo.
   */
  async adminDetail(actorId: number, projectId: number): Promise<HistoricalProjectView> {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId,
      scope: 'resumen',
    });
    if (decision.profile !== 'ADMIN') {
      throw new ForbiddenException('Esta vista es exclusiva de administradores');
    }
    if (decision.project.estadoProyecto === EstadoProyecto.CERRADO) {
      return this.historicalProject(projectId, actorId);
    }

    const [proyecto, liderazgo, participaciones, sprints] = await Promise.all([
      this.prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: projectId },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          descripcionProyecto: true,
          tipoProyecto: true,
          estadoProyecto: true,
          creador: { select: { idUsuario: true, nombre: true, apellido: true } },
        },
      }),
      this.prisma.historialLiderazgo.findMany({
        where: { idProyecto: projectId },
        orderBy: { idHistorialLiderazgo: 'asc' },
        select: {
          idHistorialLiderazgo: true,
          idLiderAnterior: true,
          idLiderNuevo: true,
          origen: true,
          registradoEn: true,
        },
      }),
      this.prisma.participacionProyecto.findMany({
        where: { rolProyecto: { idProyecto: projectId } },
        orderBy: { idParticipacion: 'asc' },
        select: {
          idParticipacion: true,
          estadoParticipacion: true,
          usuario: { select: { idUsuario: true, nombre: true, apellido: true } },
          rolProyecto: { select: { idRolProyecto: true, nombreRol: true } },
        },
      }),
      // Filtro de §34 aplicado en la CONSULTA, no en el DTO.
      this.prisma.sprint.findMany({
        where: {
          idProyecto: projectId,
          ...(decision.sprintEstados === null ? {} : { estado: { in: [...decision.sprintEstados] } }),
        },
        orderBy: [{ numero: 'asc' }, { idSprint: 'asc' }],
        select: { idSprint: true, numero: true, estado: true },
      }),
    ]);

    return {
      projectId,
      resumen: proyecto,
      liderazgo: { liderActual: proyecto.creador, historial: liderazgo },
      miembros: participaciones,
      sprints,
      permisos: { puedeEditar: false, puedeOperar: false },
      lector: { perfil: decision.profile, sprintEstados: decision.sprintEstados },
    };
  }

  /**
   * E118 (§34/§46): vista histórica autenticada del proyecto.
   *
   * Es una superficie distinta del `GET` público, que sigue limitado a
   * proyectos publicados o en progreso: cerrar un proyecto no lo publica, lo
   * vuelve legible para quienes participaron. Todo lo que devuelve es
   * histórico y ninguna bandera de escritura viene habilitada, porque un
   * proyecto cerrado ya no admite operación.
   */
  async historicalProject(projectId: number, actorId: number): Promise<HistoricalProjectView> {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId,
      scope: 'historico',
    });

    const [proyecto, liderazgo, participaciones, sprints, revisiones, totales] = await Promise.all([
      this.prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: projectId },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          descripcionProyecto: true,
          tipoProyecto: true,
          estadoProyecto: true,
          fechaInicio: true,
          fechaFinEstimada: true,
          creador: { select: { idUsuario: true, nombre: true, apellido: true } },
        },
      }),
      this.prisma.historialLiderazgo.findMany({
        where: { idProyecto: projectId },
        orderBy: [{ registradoEn: 'asc' }, { idHistorialLiderazgo: 'asc' }],
        select: {
          idHistorialLiderazgo: true,
          idLiderAnterior: true,
          idLiderNuevo: true,
          idAdminResponsable: true,
          origen: true,
          motivo: true,
          registradoEn: true,
          idApelacion: true,
        },
      }),
      this.prisma.participacionProyecto.findMany({
        where: { rolProyecto: { idProyecto: projectId } },
        orderBy: { idParticipacion: 'asc' },
        select: {
          idParticipacion: true,
          estadoParticipacion: true,
          fechaIngreso: true,
          fechaSalida: true,
          usuario: { select: { idUsuario: true, nombre: true, apellido: true } },
          rolProyecto: { select: { idRolProyecto: true, nombreRol: true } },
        },
      }),
      this.prisma.sprint.findMany({
        where: { idProyecto: projectId, estado: EstadoSprint.CERRADO },
        orderBy: [{ numero: 'asc' }, { idSprint: 'asc' }],
        select: { idSprint: true, numero: true, fechaInicio: true, fechaCierre: true },
      }),
      this.prisma.revisionCierreProyecto.findMany({
        where: { idProyecto: projectId },
        orderBy: { numeroRevision: 'asc' },
        select: {
          idRevisionCierre: true,
          numeroRevision: true,
          estadoRevision: true,
          enviadaEn: true,
          resueltaEn: true,
          comentarioRevisor: true,
          fingerprintEntrega: true,
          idDocumentoOficial: true,
          documentos: {
            orderBy: { orden: 'asc' },
            select: {
              orden: true,
              documento: {
                select: {
                  idDocumentoCierre: true,
                  tipoDocumento: true,
                  nombreArchivo: true,
                  tamanoBytes: true,
                  checksumSha256: true,
                  estadoDocumento: true,
                },
              },
            },
          },
        },
      }),
      this.hours.forProject(undefined, projectId),
    ]);

    const contribucionesEliminadas = await this.deletedContributionsTx(projectId);
    // §7: `tamanoBytes` es BigInt en la base y nunca se serializa como tal.
    const documentoPublico = (documento: {
      idDocumentoCierre: number;
      tipoDocumento: string;
      nombreArchivo: string;
      tamanoBytes: bigint | null;
      checksumSha256: string | null;
      estadoDocumento: string;
    }) => ({
      idDocumentoCierre: documento.idDocumentoCierre,
      tipoDocumento: documento.tipoDocumento,
      nombreArchivo: documento.nombreArchivo,
      tamanoBytes: documento.tamanoBytes === null ? null : Number(documento.tamanoBytes),
      checksumSha256: documento.checksumSha256,
      estadoDocumento: documento.estadoDocumento,
    });
    const oficiales = revisiones.flatMap((revision) =>
      revision.documentos
        .filter((vinculo) => vinculo.documento.idDocumentoCierre === revision.idDocumentoOficial)
        .map((vinculo) => vinculo.documento),
    );
    const documentoOficial = oficiales.length > 0 ? documentoPublico(oficiales[0]) : null;

    return {
      projectId,
      // `eliminadoEn` no viaja: el cierre no borra el proyecto, y exponer esa
      // columna invitaría a confundir cerrado con eliminado.
      resumen: {
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        descripcionProyecto: proyecto.descripcionProyecto,
        tipoProyecto: proyecto.tipoProyecto,
        estadoProyecto: proyecto.estadoProyecto,
        fechaInicio: proyecto.fechaInicio,
        fechaFinEstimada: proyecto.fechaFinEstimada,
      },
      liderazgo: { liderActual: proyecto.creador, historial: liderazgo },
      miembrosHistoricos: participaciones.map((fila) => ({
        idParticipacion: fila.idParticipacion,
        usuario: fila.usuario,
        rol: fila.rolProyecto,
        estadoParticipacion: fila.estadoParticipacion,
        fechaIngreso: fila.fechaIngreso,
        fechaSalida: fila.fechaSalida,
      })),
      sprintsCerrados: sprints,
      contribucionesEliminadas,
      totales: {
        reportadasGranulares: totales.reportadasGranulares,
        legacy: totales.legacy,
        propuestasPendientes: totales.propuestasPendientes,
        acreditadas: totales.acreditadas,
        tareasDistintas: totales.tareasDistintas,
        porUsuario: totales.porUsuario,
      },
      revisiones: revisiones.map((revision) => ({
        idRevisionCierre: revision.idRevisionCierre,
        numeroRevision: revision.numeroRevision,
        estadoRevision: revision.estadoRevision,
        enviadaEn: revision.enviadaEn,
        resueltaEn: revision.resueltaEn,
        comentarioRevisor: revision.comentarioRevisor,
        fingerprintEntrega: revision.fingerprintEntrega,
        // Los enviados son los del puente; el informe oficial se reporta
        // aparte para no confundir la entrega con su resultado.
        documentosEnviados: revision.documentos
          .filter((vinculo) => vinculo.documento.idDocumentoCierre !== revision.idDocumentoOficial)
          .map((vinculo) => ({ orden: vinculo.orden, ...documentoPublico(vinculo.documento) })),
      })),
      informeOficial: documentoOficial,
      /** Vista de solo lectura: ninguna operación queda habilitada. */
      permisos: {
        puedeEditar: false,
        puedeEnviar: false,
        puedeResolver: false,
        puedeSubirDocumentos: false,
      },
      lector: { perfil: decision.profile, soloPropio: decision.ownOnly },
    };
  }

  /** §15: proyección de las contribuciones de tareas eliminadas. */
  async deletedContributions(
    projectId: number,
    actorId: number,
  ): Promise<Array<Record<string, unknown>>> {
    await this.readPolicy.assertRead(undefined, { projectId, actorId, scope: 'historico' });
    return this.deletedContributionsTx(projectId);
  }

  /**
   * Una tarea eliminada desaparece del tablero, no de la historia: sus tramos
   * se proyectan aquí con la razón de su invisibilidad, para que las horas que
   * alguien trabajó sigan siendo trazables.
   */
  protected async deletedContributionsTx(
    projectId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const tramos = await this.prisma.asignacionTarea.findMany({
      where: { tarea: { idProyecto: projectId, eliminadoEn: { not: null } } },
      orderBy: { idAsignacion: 'asc' },
      select: {
        idAsignacion: true,
        idUsuario: true,
        idParticipacion: true,
        horasReales: true,
        origenReporte: true,
        reconocidoEn: true,
        desasignadaEn: true,
        tarea: { select: { idTarea: true, tituloTarea: true, idSprint: true, eliminadoEn: true } },
      },
    });
    return tramos.map((tramo) => ({
      idAsignacion: tramo.idAsignacion,
      idUsuario: tramo.idUsuario,
      idParticipacion: tramo.idParticipacion,
      horasReportadas: tramo.horasReales?.toFixed(2) ?? '0.00',
      origenReporte: tramo.origenReporte,
      reconocidoEn: tramo.reconocidoEn,
      desasignadaEn: tramo.desasignadaEn,
      tarea: {
        idTarea: tramo.tarea.idTarea,
        tituloTarea: tramo.tarea.tituloTarea,
        idSprint: tramo.tarea.idSprint,
      },
      razonDeInvisibilidad: 'TAREA_ELIMINADA',
      eliminadaEn: tramo.tarea.eliminadoEn,
    }));
  }
}
