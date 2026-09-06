import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectReadPolicyService,
  type ReadDecision,
} from '../common/project-policy/project-read-policy.service';
import {
  ProjectEligibilityService,
  type MotivoInelegibilidad,
} from '../eligibility/project-eligibility.service';

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

type Db = Prisma.TransactionClient | PrismaService;

const CERO = new Prisma.Decimal(0);
const dec2 = (valor: Prisma.Decimal): string => valor.toFixed(2);

@Injectable()
export class LeadershipReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly eligibility: ProjectEligibilityService,
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
