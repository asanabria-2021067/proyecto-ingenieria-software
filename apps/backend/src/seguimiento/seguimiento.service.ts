import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoHoras, EstadoParticipacion, EstadoProyecto, EstadoRevisionCierre, EstadoSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { calcularProgresoHito } from '../common/hito-progreso';
import { ROLES_GESTION, cargarContexto, assertVisible } from '../organizations/organization-access';
import { AYUDA_SEMAFORO, DIAS_HITO_PROXIMO, calcularSemaforo, type ResultadoSemaforo } from './semaforo';
import { UN_DIA_MS, diasEntre, hoyGuatemala } from './seguimiento.util';

export interface HitoAtrasado {
  idHito: number;
  tituloHito: string;
  fechaLimite: string;
  diasAtraso: number;
}

export interface SeguimientoProyecto {
  semaforo: ResultadoSemaforo & { ayuda: Record<string, string> };
  hitosAtrasados: HitoAtrasado[];
}

export interface ResumenProyectoCerrado {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  fechaInicio: string | null;
  fechaCierre: string | null;
  integrantes: number;
  tareasHechas: number;
  horasAcreditadas: number | null;
}

const PERFILES_EQUIPO: string[] = ['LIDER', 'ADMIN', 'PARTICIPANTE_ACTIVO'];
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aNumero = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

/**
 * MEJ-54/55/56: lectura de seguimiento del proyecto (hitos atrasados + semáforo),
 * página de resultados al cerrar y portafolio de proyectos cerrados de una
 * organización o asociación. Solo lecturas; los permisos se resuelven aquí.
 */
@Injectable()
export class SeguimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  /** Líder, admin o participante activo; el resto del equipo extendido no ve el semáforo. */
  private async assertEquipo(projectId: number, actorId: number) {
    const decision = await this.readPolicy.assertRead(undefined, { projectId, actorId, scope: 'resumen' });
    if (!PERFILES_EQUIPO.includes(decision.profile)) {
      throw new ForbiddenException('No tienes acceso al seguimiento de este proyecto');
    }
    return decision;
  }

  async obtener(projectId: number, actorId: number): Promise<SeguimientoProyecto> {
    await this.assertEquipo(projectId, actorId);
    const hoy = hoyGuatemala();

    const [hitos, tareas, sprint] = await Promise.all([
      this.prisma.hito.findMany({
        where: { idProyecto: projectId, fechaLimite: { not: null } },
        select: {
          idHito: true,
          tituloHito: true,
          fechaLimite: true,
          tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true } },
        },
        orderBy: { fechaLimite: 'asc' },
      }),
      this.prisma.tarea.findMany({
        where: { idProyecto: projectId, eliminadoEn: null, estadoTarea: { not: 'HECHO' } },
        select: { fechaLimite: true },
      }),
      this.prisma.sprint.findFirst({
        where: { idProyecto: projectId, estado: { in: [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION] } },
        select: {
          fechaInicio: true,
          fechaFinPlaneada: true,
          tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true } },
        },
      }),
    ]);

    const abiertos = hitos.filter((h) => calcularProgresoHito(h.tareas).estadoHito !== 'COMPLETADO');
    const hitosAtrasados: HitoAtrasado[] = abiertos
      .filter((h) => h.fechaLimite! < hoy)
      .map((h) => ({
        idHito: h.idHito,
        tituloHito: h.tituloHito,
        fechaLimite: iso(h.fechaLimite)!,
        diasAtraso: diasEntre(h.fechaLimite!, hoy),
      }));
    const limiteProximo = new Date(hoy.getTime() + DIAS_HITO_PROXIMO * UN_DIA_MS);
    const hitosProximos = abiertos.filter((h) => h.fechaLimite! >= hoy && h.fechaLimite! <= limiteProximo).length;

    let sprintEntrada = null;
    if (sprint?.fechaFinPlaneada) {
      const inicio = hoyGuatemala(sprint.fechaInicio);
      const duracion = Math.max(1, diasEntre(inicio, sprint.fechaFinPlaneada));
      const hechas = sprint.tareas.filter((t) => t.estadoTarea === 'HECHO').length;
      sprintEntrada = {
        avancePct: sprint.tareas.length === 0 ? 0 : (hechas / sprint.tareas.length) * 100,
        transcurridoPct: (diasEntre(inicio, hoy) / duracion) * 100,
      };
    }

    const semaforo = calcularSemaforo({
      hitosAtrasados: hitosAtrasados.length,
      hitosProximos,
      tareasAbiertas: tareas.length,
      tareasVencidas: tareas.filter((t) => t.fechaLimite !== null && t.fechaLimite < hoy).length,
      sprint: sprintEntrada,
    });
    return { semaforo: { ...semaforo, ayuda: AYUDA_SEMAFORO }, hitosAtrasados };
  }

  /** MEJ-56: página de resultados de un proyecto CERRADO. */
  async resultados(projectId: number, actorId: number) {
    const decision = await this.readPolicy.assertRead(undefined, { projectId, actorId, scope: 'resumen' });
    if (decision.project.estadoProyecto !== EstadoProyecto.CERRADO) {
      throw new BadRequestException('Los resultados se publican cuando el proyecto está cerrado');
    }
    // Horas e integrantes con nombre: solo el equipo (ORG-8: el miembro de la organización y el externo no ven horas).
    const verEquipo = PERFILES_EQUIPO.includes(decision.profile);

    const [proyecto, tareas, hitos, sprints, participaciones, horas, reconocimientos, [cierre]] = await Promise.all([
      this.prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: projectId },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          descripcionProyecto: true,
          tipoProyecto: true,
          fechaInicio: true,
          fechaFinEstimada: true,
          creador: { select: { idUsuario: true, nombre: true, apellido: true } },
          asociacion: { select: { idAsociacion: true, nombre: true } },
          organizaciones: { select: { organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true } } } },
        },
      }),
      this.prisma.tarea.findMany({ where: { idProyecto: projectId, eliminadoEn: null }, select: { idHito: true, estadoTarea: true } }),
      this.prisma.hito.findMany({
        where: { idProyecto: projectId },
        orderBy: { orden: 'asc' },
        select: { idHito: true, tituloHito: true, fechaLimite: true },
      }),
      this.prisma.sprint.findMany({
        where: { idProyecto: projectId, estado: EstadoSprint.CERRADO },
        orderBy: { numero: 'asc' },
        select: {
          numero: true,
          tareasPlanificadasCierre: true,
          tareasCompletadasCierre: true,
          porcentajeCumplimientoCierre: true,
        },
      }),
      this.prisma.participacionProyecto.findMany({
        where: {
          rolProyecto: { idProyecto: projectId },
          estadoParticipacion: { in: [EstadoParticipacion.ACTIVO, EstadoParticipacion.COMPLETADO] },
        },
        select: {
          idUsuario: true,
          usuario: { select: { nombre: true, apellido: true } },
          rolProyecto: { select: { nombreRol: true } },
        },
      }),
      this.prisma.horasParticipacion.findMany({
        where: { estadoHoras: EstadoHoras.APROBADA, participacion: { rolProyecto: { idProyecto: projectId } } },
        select: { horasAprobadas: true, participacion: { select: { idUsuario: true } } },
      }),
      this.prisma.reconocimientoCompanero.count({ where: { idProyecto: projectId } }),
      this.prisma.revisionCierreProyecto.findMany({
        where: { idProyecto: projectId, estadoRevision: EstadoRevisionCierre.APROBADA },
        orderBy: { resueltaEn: 'desc' },
        take: 1,
        select: { resueltaEn: true },
      }),
    ]);

    const horasPorUsuario = new Map<number, number>();
    for (const h of horas) {
      horasPorUsuario.set(h.participacion.idUsuario, (horasPorUsuario.get(h.participacion.idUsuario) ?? 0) + Number(h.horasAprobadas ?? 0));
    }
    const equipo = new Map<number, { idUsuario: number; nombre: string; apellido: string; roles: string[]; horasAcreditadas: number }>();
    for (const p of participaciones) {
      const fila = equipo.get(p.idUsuario) ?? {
        idUsuario: p.idUsuario,
        nombre: p.usuario.nombre,
        apellido: p.usuario.apellido,
        roles: [],
        horasAcreditadas: aNumero(horasPorUsuario.get(p.idUsuario)),
      };
      fila.roles.push(p.rolProyecto.nombreRol);
      equipo.set(p.idUsuario, fila);
    }

    const hitosCompletados = hitos.filter(
      (h) => calcularProgresoHito(tareas.filter((t) => t.idHito === h.idHito)).estadoHito === 'COMPLETADO',
    );
    const integrantes = new Set(participaciones.map((p) => p.idUsuario)).add(proyecto.creador.idUsuario).size;

    return {
      proyecto: {
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        descripcionProyecto: proyecto.descripcionProyecto,
        tipoProyecto: proyecto.tipoProyecto,
        fechaInicio: iso(proyecto.fechaInicio),
        fechaFinEstimada: iso(proyecto.fechaFinEstimada),
        fechaCierre: iso(cierre?.resueltaEn ?? null),
        lider: { nombre: proyecto.creador.nombre, apellido: proyecto.creador.apellido },
        asociacion: proyecto.asociacion,
        organizaciones: proyecto.organizaciones.map((o) => o.organizacion),
      },
      metricas: {
        integrantes,
        tareasTotales: tareas.length,
        tareasHechas: tareas.filter((t) => t.estadoTarea === 'HECHO').length,
        hitosTotales: hitos.length,
        hitosCompletados: hitosCompletados.length,
        sprintsCerrados: sprints.length,
        horasAcreditadas: verEquipo ? aNumero([...horasPorUsuario.values()].reduce((a, b) => a + b, 0)) : null,
        reconocimientos,
      },
      hitos: hitos.map((h) => ({
        idHito: h.idHito,
        tituloHito: h.tituloHito,
        fechaLimite: iso(h.fechaLimite),
        completado: hitosCompletados.some((c) => c.idHito === h.idHito),
      })),
      sprints,
      equipo: verEquipo ? [...equipo.values()] : [],
    };
  }

  /** Portafolio de una organización: sus proyectos cerrados (una privada solo la ven sus miembros). */
  async portafolioOrganizacion(idOrganizacion: number, actorId: number): Promise<ResumenProyectoCerrado[]> {
    const ctx = await cargarContexto(this.prisma, actorId, idOrganizacion);
    assertVisible(ctx);
    // Las horas acreditadas solo las ve quien gestiona la organización; el resto (miembros o público) ve el resto de cifras.
    const filas = await this.resumenesCerrados({ organizaciones: { some: { idOrganizacion } } });
    return ctx.rol && ROLES_GESTION.includes(ctx.rol) ? filas : filas.map((f) => ({ ...f, horasAcreditadas: null }));
  }

  /** Portafolio de una asociación. La ruta exige JuntaGuard: solo llega aquí la junta de `idAsociacion`. */
  portafolioAsociacion(idAsociacion: number): Promise<ResumenProyectoCerrado[]> {
    return this.resumenesCerrados({ idAsociacion });
  }

  private async resumenesCerrados(where: object): Promise<ResumenProyectoCerrado[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: { ...where, estadoProyecto: EstadoProyecto.CERRADO, eliminadoEn: null },
      orderBy: { idProyecto: 'desc' },
      take: 100,
      select: { idProyecto: true, tituloProyecto: true, tipoProyecto: true, fechaInicio: true, creadoPor: true },
    });
    const ids = proyectos.map((p) => p.idProyecto);
    if (ids.length === 0) return [];

    const [tareas, participaciones, horas, cierres] = await Promise.all([
      this.prisma.tarea.groupBy({
        by: ['idProyecto'],
        where: { idProyecto: { in: ids }, eliminadoEn: null, estadoTarea: 'HECHO' },
        _count: { _all: true },
      }),
      this.prisma.participacionProyecto.findMany({
        where: {
          rolProyecto: { idProyecto: { in: ids } },
          estadoParticipacion: { in: [EstadoParticipacion.ACTIVO, EstadoParticipacion.COMPLETADO] },
        },
        select: { idUsuario: true, rolProyecto: { select: { idProyecto: true } } },
      }),
      this.prisma.horasParticipacion.findMany({
        where: { estadoHoras: EstadoHoras.APROBADA, participacion: { rolProyecto: { idProyecto: { in: ids } } } },
        select: { horasAprobadas: true, participacion: { select: { rolProyecto: { select: { idProyecto: true } } } } },
      }),
      this.prisma.revisionCierreProyecto.findMany({
        where: { idProyecto: { in: ids }, estadoRevision: EstadoRevisionCierre.APROBADA },
        select: { idProyecto: true, resueltaEn: true },
      }),
    ]);

    return proyectos.map((p) => {
      const equipo = new Set(participaciones.filter((x) => x.rolProyecto.idProyecto === p.idProyecto).map((x) => x.idUsuario));
      equipo.add(p.creadoPor);
      const fechas = cierres.filter((c) => c.idProyecto === p.idProyecto && c.resueltaEn).map((c) => c.resueltaEn!.getTime());
      return {
        idProyecto: p.idProyecto,
        tituloProyecto: p.tituloProyecto,
        tipoProyecto: p.tipoProyecto,
        fechaInicio: iso(p.fechaInicio),
        fechaCierre: fechas.length ? iso(new Date(Math.max(...fechas))) : null,
        integrantes: equipo.size,
        tareasHechas: tareas.find((t) => t.idProyecto === p.idProyecto)?._count._all ?? 0,
        horasAcreditadas: aNumero(
          horas
            .filter((h) => h.participacion.rolProyecto.idProyecto === p.idProyecto)
            .reduce((a, h) => a + Number(h.horasAprobadas ?? 0), 0),
        ),
      };
    });
  }
}
