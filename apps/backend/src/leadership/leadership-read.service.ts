import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EstadoParticipacion,
  EstadoProyecto,
  OrigenCambioLiderazgo,
  Prisma,
  type EstadoApelacionLiderazgo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectReadPolicyService,
  type ReadDecision,
} from '../common/project-policy/project-read-policy.service';
import {
  ProjectEligibilityService,
  type MotivoInelegibilidad,
} from '../eligibility/project-eligibility.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import {
  resolveAppealPage,
  type ApelacionPageQueryDto,
  type LeadershipPageQueryDto,
  type PaginaLiderazgo,
} from './dto/appeal-page.query';

/**
 * C091/C092 (06 v2 §6/§20/§46): lecturas de liderazgo — contexto de Q1,
 * candidatos, historial, apelaciones y bandeja administrativa.
 *
 * Es un servicio de LECTURA: consultar el contexto o los candidatos no crea
 * apelación, rol ni participación, y la membresía nunca se infiere de
 * `HistorialLiderazgo`, que es historia factual y no una lista de integrantes.
 *
 * La lista de candidatos es INFORMATIVA. Puede quedar vieja entre que la UI la
 * pinta y el administrador confirma: la elegibilidad que decide se revalida
 * dentro de la transacción de la transferencia (C097/C098/C101), nunca aquí.
 */

/** Texto exacto de §6 para el líder saliente sin participación activa. */
export const ADVERTENCIA_APELACION_SIN_PARTICIPACION =
  'Actualmente no perteneces a ningún rol del proyecto. Si deseas continuar como integrante después de dejar el liderazgo, debes incorporarte a un rol válido mediante el flujo normal antes de que la transferencia sea efectiva.';

/** Texto exacto de §6 para el administrador que va a confirmar el cambio. */
export const ADVERTENCIA_ADMIN_SIN_PARTICIPACION =
  'El líder actual no posee una participación activa. Al confirmar el cambio de liderazgo dejará de tener acceso como integrante del proyecto. Su historial como líder permanecerá registrado.';

export interface ParticipacionActivaDto {
  idParticipacion: number;
  idRolProyecto: number;
  nombreRol: string;
}

export interface LeadershipContextDto {
  projectId: number;
  estadoProyecto: EstadoProyecto;
  liderActual: { idUsuario: number; nombre: string; apellido: string };
  tieneParticipacionActiva: boolean;
  participacionesActivas: ParticipacionActivaDto[];
  /** Derivado del estado ACTUAL, no una columna ni una decisión guardada. */
  conservaMembresiaSiSeTransfiere: boolean;
  advertenciaApelacion: string | null;
  advertenciaAdmin: string | null;
}

export interface LeadershipCandidateDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  rolesActivos: Array<{ idRolProyecto: number; nombreRol: string }>;
  /** Hechos objetivos, no un mérito: horas efectivamente reportadas y tareas distintas. */
  horasReportadas: string;
  horasLegacy: string;
  tareasDistintas: number;
  esElegible: boolean;
  motivos: MotivoInelegibilidad[];
  /** Solo un candidato elegible puede seleccionarse; no hay ranking. */
  seleccionable: boolean;
}

export interface LeadershipCandidatesDto {
  contexto: LeadershipContextDto;
  candidatos: LeadershipCandidateDto[];
}


export interface UsuarioResumenDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

export interface LeadershipHistoryItemDto {
  idHistorialLiderazgo: number;
  idProyecto: number;
  liderAnterior: UsuarioResumenDto;
  liderNuevo: UsuarioResumenDto;
  admin: UsuarioResumenDto;
  motivo: string;
  origen: OrigenCambioLiderazgo;
  registradoEn: Date;
  idApelacion: number | null;
  /** Se resuelve por la FK de la apelación; el historial no lo duplica. */
  candidatoSugerido: UsuarioResumenDto | null;
}

export interface ApelacionItemDto {
  idApelacion: number;
  idProyecto: number;
  asunto: string;
  mensaje: string;
  estadoApelacion: EstadoApelacionLiderazgo;
  creadaEn: Date;
  resueltaEn: Date | null;
  mensajeResolucion: string | null;
  liderSolicitante: UsuarioResumenDto;
  candidatoPropuesto: UsuarioResumenDto;
  adminResolutor: UsuarioResumenDto | null;
}

const USUARIO_RESUMEN_SELECT = {
  idUsuario: true,
  nombre: true,
  apellido: true,
} satisfies Prisma.UsuarioSelect;

const HISTORIAL_SELECT = {
  idHistorialLiderazgo: true,
  idProyecto: true,
  motivo: true,
  origen: true,
  registradoEn: true,
  idApelacion: true,
  liderAnterior: { select: USUARIO_RESUMEN_SELECT },
  liderNuevo: { select: USUARIO_RESUMEN_SELECT },
  adminResponsable: { select: USUARIO_RESUMEN_SELECT },
  apelacion: { select: { candidatoPropuesto: { select: USUARIO_RESUMEN_SELECT } } },
} satisfies Prisma.HistorialLiderazgoSelect;

const APELACION_ITEM_SELECT = {
  idApelacion: true,
  idProyecto: true,
  asunto: true,
  mensaje: true,
  estadoApelacion: true,
  creadaEn: true,
  resueltaEn: true,
  mensajeResolucion: true,
  liderSolicitante: { select: USUARIO_RESUMEN_SELECT },
  candidatoPropuesto: { select: USUARIO_RESUMEN_SELECT },
  adminResolutor: { select: USUARIO_RESUMEN_SELECT },
} satisfies Prisma.ApelacionLiderazgoSelect;

function mapHistorial(
  row: Prisma.HistorialLiderazgoGetPayload<{ select: typeof HISTORIAL_SELECT }>,
): LeadershipHistoryItemDto {
  return {
    idHistorialLiderazgo: row.idHistorialLiderazgo,
    idProyecto: row.idProyecto,
    liderAnterior: row.liderAnterior,
    liderNuevo: row.liderNuevo,
    admin: row.adminResponsable,
    motivo: row.motivo,
    origen: row.origen,
    registradoEn: row.registradoEn,
    idApelacion: row.idApelacion,
    // Un cambio administrativo directo no tuvo candidato sugerido: nadie lo
    // propuso, así que el hecho histórico no inventa uno.
    candidatoSugerido: row.apelacion?.candidatoPropuesto ?? null,
  };
}

type Db = Prisma.TransactionClient | PrismaService;

const CERO = new Prisma.Decimal(0);
const dec2 = (valor: Prisma.Decimal): string => valor.toFixed(2);

@Injectable()
export class LeadershipReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly eligibility: ProjectEligibilityService,
    private readonly policy: ProjectPolicyService,
  ) {}

  /** E093: contexto de Q1 del proyecto, sin efectos de ningún tipo. */
  async context(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; actorId: number },
  ): Promise<LeadershipContextDto> {
    const db: Db = tx ?? this.prisma;
    const decision = await this.assertContextReader(tx, input);
    return this.buildContext(db, input.projectId, decision);
  }

  /** E094: contexto + candidatos elegibles anotados con sus motivos. */
  async candidates(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; actorId: number },
  ): Promise<LeadershipCandidatesDto> {
    const db: Db = tx ?? this.prisma;
    const decision = await this.assertContextReader(tx, input);
    const contexto = await this.buildContext(db, input.projectId, decision);

    const anotados = await this.eligibility.listLeadershipCandidates(tx, {
      projectId: input.projectId,
      liderActualId: contexto.liderActual.idUsuario,
    });
    const hechos = await this.objectiveFacts(
      db,
      input.projectId,
      anotados.map((candidato) => candidato.idUsuario),
    );

    return {
      contexto,
      candidatos: anotados.map((candidato) => {
        const propios = hechos.get(candidato.idUsuario);
        return {
          idUsuario: candidato.idUsuario,
          nombre: candidato.nombre,
          apellido: candidato.apellido,
          fotoUrl: candidato.fotoUrl,
          rolesActivos: propios?.rolesActivos ?? [],
          horasReportadas: propios?.horasReportadas ?? '0.00',
          horasLegacy: propios?.horasLegacy ?? '0.00',
          tareasDistintas: propios?.tareasDistintas ?? 0,
          esElegible: candidato.elegible,
          motivos: candidato.motivos,
          seleccionable: candidato.elegible,
        };
      }),
    };
  }

  /**
   * E095 (§20): historia de liderazgo del proyecto, append-only.
   *
   * El exlíder SIN participación no obtiene acceso general al proyecto por
   * haber liderado: la policy lo marca `ownOnly` y aquí eso significa
   * exactamente las filas donde fue líder anterior o nuevo. Haber liderado es
   * un hecho sobre él, no una llave del proyecto.
   */
  async history(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; actorId: number; query?: LeadershipPageQueryDto },
  ): Promise<PaginaLiderazgo<LeadershipHistoryItemDto>> {
    const db: Db = tx ?? this.prisma;
    const decision = await this.readPolicy.assertRead(tx, {
      projectId: input.projectId,
      actorId: input.actorId,
      scope: 'liderazgo',
    });
    const { page, limit, skip } = resolveAppealPage(input.query);

    const where: Prisma.HistorialLiderazgoWhereInput = {
      idProyecto: input.projectId,
      ...(decision.ownOnly
        ? { OR: [{ idLiderAnterior: input.actorId }, { idLiderNuevo: input.actorId }] }
        : {}),
    };
    const [total, filas] = await Promise.all([
      db.historialLiderazgo.count({ where }),
      db.historialLiderazgo.findMany({
        where,
        orderBy: [{ registradoEn: 'desc' }, { idHistorialLiderazgo: 'desc' }],
        skip,
        take: limit,
        select: HISTORIAL_SELECT,
      }),
    ]);
    return { items: filas.map(mapHistorial), total, page, limit };
  }

  /**
   * E096 (§19/§20): apelaciones del proyecto. El autor conserva la lectura de
   * SU solicitud aunque ya no participe; la bitácora no la sustituye, porque
   * una entrada de auditoría no es la petición que él escribió.
   */
  async appeals(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; actorId: number; query?: ApelacionPageQueryDto },
  ): Promise<PaginaLiderazgo<ApelacionItemDto>> {
    const db: Db = tx ?? this.prisma;
    const decision = await this.readPolicy.assertRead(tx, {
      projectId: input.projectId,
      actorId: input.actorId,
      scope: 'liderazgo',
    });
    const { page, limit, skip } = resolveAppealPage(input.query);

    // El filtro por estado ACOTA; nunca amplía la audiencia.
    const where: Prisma.ApelacionLiderazgoWhereInput = {
      idProyecto: input.projectId,
      ...(input.query?.estado ? { estadoApelacion: input.query.estado } : {}),
      ...(decision.ownOnly ? { idLiderSolicitante: input.actorId } : {}),
    };
    return this.pageOfAppeals(db, where, { page, limit, skip });
  }

  /**
   * E099 (§41): bandeja administrativa global. El perfil de administrador se
   * consulta de la base de datos, nunca se deduce del token.
   */
  async adminInbox(
    tx: Prisma.TransactionClient | undefined,
    input: { actorId: number; query?: ApelacionPageQueryDto },
  ): Promise<PaginaLiderazgo<ApelacionItemDto>> {
    const db: Db = tx ?? this.prisma;
    await this.policy.assertAdminTx(db as Prisma.TransactionClient, input.actorId);
    const { page, limit, skip } = resolveAppealPage(input.query);
    const where: Prisma.ApelacionLiderazgoWhereInput = input.query?.estado
      ? { estadoApelacion: input.query.estado }
      : {};
    return this.pageOfAppeals(db, where, { page, limit, skip });
  }

  /** Orden congelado de §41: `creadaEn DESC, id DESC`. */
  private async pageOfAppeals(
    db: Db,
    where: Prisma.ApelacionLiderazgoWhereInput,
    paginacion: { page: number; limit: number; skip: number },
  ): Promise<PaginaLiderazgo<ApelacionItemDto>> {
    const [total, filas] = await Promise.all([
      db.apelacionLiderazgo.count({ where }),
      db.apelacionLiderazgo.findMany({
        where,
        orderBy: [{ creadaEn: 'desc' }, { idApelacion: 'desc' }],
        skip: paginacion.skip,
        take: paginacion.limit,
        select: APELACION_ITEM_SELECT,
      }),
    ]);
    return { items: filas, total, page: paginacion.page, limit: paginacion.limit };
  }


  /**
   * §41: contexto y candidatos son del LÍDER ACTUAL y del ADMIN. La policy de
   * lectura ya admite el scope `liderazgo` para un exlíder sin participación
   * (que conserva sus propios hechos), pero eso es historia: nadie más ve la
   * foto de Q1 ni la lista de sucesores del proyecto.
   */
  private async assertContextReader(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; actorId: number },
  ): Promise<ReadDecision> {
    const decision = await this.readPolicy.assertRead(tx, {
      projectId: input.projectId,
      actorId: input.actorId,
      scope: 'liderazgo',
    });
    if (decision.profile !== 'LIDER' && decision.profile !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo el líder actual o un administrador pueden consultar el contexto de liderazgo',
      );
    }
    return decision;
  }

  /**
   * §6: UNA consulta de participación activa del líder actual. Una fila basta
   * para `tieneParticipacionActiva`; se conservan todas porque el read-model
   * las muestra. `HistorialLiderazgo` no participa: haber liderado no es
   * pertenecer.
   */
  private async buildContext(
    db: Db,
    projectId: number,
    decision: ReadDecision,
  ): Promise<LeadershipContextDto> {
    const lider = await db.usuario.findUnique({
      where: { idUsuario: decision.project.creadoPor },
      select: { idUsuario: true, nombre: true, apellido: true },
    });
    if (!lider) {
      throw new NotFoundException(`Usuario con id ${decision.project.creadoPor} no encontrado`);
    }

    const participaciones = await db.participacionProyecto.findMany({
      where: {
        idUsuario: lider.idUsuario,
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        rolProyecto: { idProyecto: projectId },
      },
      select: {
        idParticipacion: true,
        idRolProyecto: true,
        rolProyecto: { select: { nombreRol: true } },
      },
      orderBy: { idParticipacion: 'asc' },
    });
    const tieneParticipacionActiva = participaciones.length > 0;

    // Cada advertencia tiene su destinatario: la de apelación habla en segunda
    // persona al líder que va a dejar el cargo; la administrativa describe el
    // efecto a quien lo confirma. Entregarlas cruzadas diría algo falso.
    const esLider = decision.profile === 'LIDER';
    const esAdmin = decision.profile === 'ADMIN';

    return {
      projectId,
      estadoProyecto: decision.project.estadoProyecto,
      liderActual: lider,
      tieneParticipacionActiva,
      participacionesActivas: participaciones.map((fila) => ({
        idParticipacion: fila.idParticipacion,
        idRolProyecto: fila.idRolProyecto,
        nombreRol: fila.rolProyecto.nombreRol,
      })),
      conservaMembresiaSiSeTransfiere: tieneParticipacionActiva,
      advertenciaApelacion:
        !tieneParticipacionActiva && esLider ? ADVERTENCIA_APELACION_SIN_PARTICIPACION : null,
      advertenciaAdmin:
        !tieneParticipacionActiva && esAdmin ? ADVERTENCIA_ADMIN_SIN_PARTICIPACION : null,
    };
  }

  /**
   * Hechos objetivos por candidato dentro del proyecto: roles activos, horas
   * granulares efectivas, horas legacy y tareas DISTINTAS. Se separan las dos
   * magnitudes de horas por la misma razón que §8: un importe legacy no es una
   * suma de registros y presentarlos juntos los confundiría. Contar tramos en
   * vez de tareas contaría dos veces una tarea reasignada.
   */
  private async objectiveFacts(
    db: Db,
    projectId: number,
    userIds: number[],
  ): Promise<
    Map<
      number,
      {
        rolesActivos: Array<{ idRolProyecto: number; nombreRol: string }>;
        horasReportadas: string;
        horasLegacy: string;
        tareasDistintas: number;
      }
    >
  > {
    const facts = new Map<
      number,
      {
        rolesActivos: Array<{ idRolProyecto: number; nombreRol: string }>;
        horasReportadas: string;
        horasLegacy: string;
        tareas: Set<number>;
      }
    >();
    if (userIds.length === 0) {
      return new Map();
    }

    const [participaciones, tramos] = await Promise.all([
      db.participacionProyecto.findMany({
        where: {
          idUsuario: { in: userIds },
          estadoParticipacion: EstadoParticipacion.ACTIVO,
          rolProyecto: { idProyecto: projectId },
        },
        select: {
          idUsuario: true,
          idRolProyecto: true,
          rolProyecto: { select: { nombreRol: true } },
        },
        orderBy: { idRolProyecto: 'asc' },
      }),
      db.asignacionTarea.findMany({
        where: { idUsuario: { in: userIds }, tarea: { idProyecto: projectId } },
        select: {
          idUsuario: true,
          idTarea: true,
          origenReporte: true,
          horasReales: true,
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
        },
      }),
    ]);

    const blank = () => ({
      rolesActivos: [] as Array<{ idRolProyecto: number; nombreRol: string }>,
      horasReportadas: '0.00',
      horasLegacy: '0.00',
      tareas: new Set<number>(),
    });

    for (const fila of participaciones) {
      const propios = facts.get(fila.idUsuario) ?? blank();
      propios.rolesActivos.push({
        idRolProyecto: fila.idRolProyecto,
        nombreRol: fila.rolProyecto.nombreRol,
      });
      facts.set(fila.idUsuario, propios);
    }

    for (const tramo of tramos) {
      const propios = facts.get(tramo.idUsuario) ?? blank();
      const granulares = tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), CERO);
      const legacy = tramo.origenReporte === 'LEGACY' ? (tramo.horasReales ?? CERO) : CERO;
      propios.horasReportadas = dec2(new Prisma.Decimal(propios.horasReportadas).plus(granulares));
      propios.horasLegacy = dec2(new Prisma.Decimal(propios.horasLegacy).plus(legacy));
      propios.tareas.add(tramo.idTarea);
      facts.set(tramo.idUsuario, propios);
    }

    return new Map(
      [...facts.entries()].map(([idUsuario, { tareas, ...resto }]) => [
        idUsuario,
        { ...resto, tareasDistintas: tareas.size },
      ]),
    );
  }
}
