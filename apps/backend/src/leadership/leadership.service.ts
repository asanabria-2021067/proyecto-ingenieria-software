import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoApelacionLiderazgo, OrigenCambioLiderazgo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectEligibilityService } from '../eligibility/project-eligibility.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { CreateLeadershipAppealDto } from './dto/create-leadership-appeal.dto';
import { DenyAppealDto } from './dto/deny-appeal.dto';
import { TransferLeadershipDto } from './dto/transfer-leadership.dto';

/**
 * C091/C093–C098 (06 v2 §18/§19): escrituras de liderazgo — ciclo de vida de la
 * apelación y el motor ÚNICO de cambio de líder.
 *
 * `Proyecto.creadoPor` es la única fuente de verdad sobre quién lidera: este
 * servicio no introduce estado de exlíder, rol sintético, bandeja de expulsión
 * ni participación fabricada. Perder el liderazgo no crea ni destruye
 * membresía; lo que el saliente conserva se deriva de su participación real.
 */


/**
 * Resultado DERIVADO de una transferencia (§6). `efectoSaliente` describe lo
 * que el saliente conserva según su participación real en el momento del
 * commit; no es una columna de estado ni una decisión que alguien haya
 * guardado antes desde la interfaz.
 */
export interface LeadershipChangeResult {
  historialId: number;
  liderAnteriorId: number;
  liderNuevoId: number;
  salienteTieneParticipacionActiva: boolean;
  efectoSaliente: 'INTEGRANTE_NORMAL' | 'SIN_MEMBRESIA_OPERATIVA';
}

/**
 * §18: un cambio directo caduca la solicitud de autoridad del saliente. No se
 * deniega ni se acepta — nadie resolvió su petición: dejó de tener objeto.
 */
export const MOTIVO_CANCELACION_AUTOMATICA =
  'Cancelada automáticamente porque el liderazgo del proyecto cambió antes de resolverla.';

export interface ApelacionPublica {
  idApelacion: number;
  idProyecto: number;
  idLiderSolicitante: number;
  asunto: string;
  mensaje: string;
  idCandidatoPropuesto: number;
  estadoApelacion: EstadoApelacionLiderazgo;
  creadaEn: Date;
  resueltaEn: Date | null;
  idAdminResolutor: number | null;
  mensajeResolucion: string | null;
}

export const APELACION_SELECT = {
  idApelacion: true,
  idProyecto: true,
  idLiderSolicitante: true,
  asunto: true,
  mensaje: true,
  idCandidatoPropuesto: true,
  estadoApelacion: true,
  creadaEn: true,
  resueltaEn: true,
  idAdminResolutor: true,
  mensajeResolucion: true,
} satisfies Prisma.ApelacionLiderazgoSelect;

type ApelacionRow = Prisma.ApelacionLiderazgoGetPayload<{ select: typeof APELACION_SELECT }>;

/** La bitácora guarda JSON: las fechas viajan en ISO para que el detalle se lea sin reconstruir tipos. */
function snapshotApelacion(row: ApelacionRow): Record<string, string | number | boolean | null> {
  return {
    ...row,
    creadaEn: row.creadaEn.toISOString(),
    resueltaEn: row.resueltaEn?.toISOString() ?? null,
  };
}

@Injectable()
export class LeadershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly eligibility: ProjectEligibilityService,
    private readonly notifications: NotificationsService,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /** §18–§20: apelar, cancelar y transferir son potestad del líder ACTUAL, leído bajo el lock. */
  private assertCurrentLeader(project: ProjectLockRow, actorId: number): void {
    if (project.creadoPor !== actorId) {
      throw new ForbiddenException('Solo el líder actual del proyecto puede realizar esta operación');
    }
  }

  /**
   * E097 (§19): el líder actual pide que se transfiera su liderazgo.
   *
   * Crear la apelación NO cambia el liderazgo ni toca una sola participación:
   * es una solicitud dirigida a los administradores. El texto queda inmutable
   * desde este momento — no existe ninguna ruta que lo edite — porque una
   * solicitud que se reescribe después de recibida deja de ser evidencia.
   */
  async createAppeal(
    projectId: number,
    actorId: number,
    dto: CreateLeadershipAppealDto,
  ): Promise<ApelacionPublica> {
    return this.projectTx.run(projectId, actorId, 'leadership.createAppeal', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'LIDERAZGO', actorId);
      this.assertCurrentLeader(project, actorId);

      const asunto = dto.asunto?.trim() ?? '';
      const mensaje = dto.mensaje?.trim() ?? '';
      // CK10 lo exige en base de datos; rechazarlo aquí devuelve un 400 con
      // sentido en vez de un error de constraint.
      if (asunto.length === 0 || asunto.length > 200) {
        throw new BadRequestException('asunto debe tener entre 1 y 200 caracteres');
      }
      if (mensaje.length === 0 || mensaje.length > 10000) {
        throw new BadRequestException('mensaje debe tener entre 1 y 10000 caracteres');
      }

      // El candidato sugerido debe ser elegible AHORA; volverá a comprobarse
      // bajo transacción al resolver, porque puede dejar de serlo entretanto.
      await this.eligibility.assertLeadershipCandidate(tx, {
        projectId,
        userId: dto.idCandidatoPropuesto,
        liderActualId: actorId,
      });

      const pendiente = await tx.apelacionLiderazgo.findFirst({
        where: {
          idProyecto: projectId,
          idLiderSolicitante: actorId,
          estadoApelacion: EstadoApelacionLiderazgo.PENDIENTE,
        },
        select: { idApelacion: true },
      });
      if (pendiente) {
        throw new ConflictException({
          statusCode: 409,
          code: 'APELACION_PENDIENTE_EXISTENTE',
          message: 'Ya existe una apelación pendiente de este líder en el proyecto',
        });
      }

      const creada = await this.insertAppeal(tx, {
        projectId,
        actorId,
        asunto,
        mensaje,
        idCandidatoPropuesto: dto.idCandidatoPropuesto,
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_CREATED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'APELACION_LIDERAZGO',
        idEntidad: creada.idApelacion,
        valorAnterior: null,
        valorNuevo: snapshotApelacion(creada),
      });

      const [proyecto, lider] = await Promise.all([
        tx.proyecto.findUniqueOrThrow({
          where: { idProyecto: projectId },
          select: { tituloProyecto: true },
        }),
        tx.usuario.findUniqueOrThrow({
          where: { idUsuario: actorId },
          select: { nombre: true, apellido: true },
        }),
      ]);
      // Las filas viven en la MISMA transacción que la apelación; solo el
      // aviso por socket espera al commit.
      await this.notifications.persistAdminsTx(
        tx,
        'APELACION_LIDERAZGO_RECIBIDA',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId,
          appealId: creada.idApelacion,
          asunto: creada.asunto,
          leaderName: `${lider.nombre} ${lider.apellido}`.trim(),
        },
        ctx.effects,
      );

      return creada;
    });
  }

  /**
   * E098 (§19): el líder que apeló retira su propia solicitud.
   *
   * Cancelar exige ser el AUTOR y seguir liderando: una apelación es la
   * petición de una autoridad concreta y, cuando esa autoridad ya cambió de
   * manos, dejar de sostenerla no es decisión del antiguo líder ni del nuevo.
   * El administrador tampoco cancela por aquí — resuelve denegando (E101).
   */
  async cancelAppeal(
    projectId: number,
    appealId: number,
    actorId: number,
  ): Promise<ApelacionPublica> {
    return this.projectTx.run(projectId, actorId, 'leadership.cancelAppeal', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'LIDERAZGO', actorId);

      const apelacion = await this.loadAppealTx(tx, projectId, appealId);
      if (apelacion.idLiderSolicitante !== actorId) {
        throw new ForbiddenException('Solo el autor de la apelación puede cancelarla');
      }
      this.assertCurrentLeader(project, actorId);

      // CK11 admite `idAdminResolutor` nulo justamente en este estado: una
      // cancelación no la resuelve un administrador.
      const cancelada = await this.resolveAppealTx(tx, {
        appealId,
        estado: EstadoApelacionLiderazgo.CANCELADA,
        idAdminResolutor: null,
        mensajeResolucion: null,
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_CANCELLED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'APELACION_LIDERAZGO',
        idEntidad: appealId,
        valorAnterior: snapshotApelacion(apelacion),
        valorNuevo: snapshotApelacion(cancelada),
      });

      return cancelada;
    });
  }

  /**
   * E102 / E100 (§18): ORQUESTACIÓN ÚNICA de un cambio de liderazgo. Los dos
   * controllers administrativos —cambio directo y aceptación de apelación—
   * entran exactamente por aquí. No existe un segundo motor: dos caminos para
   * mover `Proyecto.creadoPor` serían dos reglas de concurrencia distintas
   * sobre la misma fila.
   */
  async transfer(
    projectId: number,
    actorId: number,
    dto: TransferLeadershipDto,
    appealId?: number,
  ): Promise<LeadershipChangeResult> {
    return this.projectTx.run(projectId, actorId, 'leadership.transfer', async (ctx) =>
      this.changeLeaderTx(ctx, {
        projectId,
        adminId: actorId,
        newLeaderId: dto.idLiderNuevo,
        expectedLeaderId: dto.expectedLeaderId,
        appealId,
        motivo: dto.motivo,
      }),
    );
  }

  /**
   * El motor. Secuencia exacta de §18, toda dentro del lock del proyecto:
   * validar admin → estado P/E → líder esperado → sucesor elegible → releer
   * Q1 → CAS de `creadoPor` → historial → bitácora → notificaciones. El
   * socket sale después del commit, desde el buffer de efectos.
   *
   * NO toca participaciones, roles, tareas ni horas: perder o ganar el
   * liderazgo no mueve una sola fila de trabajo del equipo.
   */
  private async changeLeaderTx(
    ctx: ProjectTransactionContext,
    input: {
      projectId: number;
      adminId: number;
      newLeaderId: number;
      expectedLeaderId: number;
      appealId?: number;
      motivo: string;
    },
  ): Promise<LeadershipChangeResult> {
    const { tx } = ctx;
    const project = this.lockedProject(ctx);
    await this.policy.assertAdminTx(tx, input.adminId);
    await this.policy.assertWriteTx(tx, project, 'LIDERAZGO', input.adminId);

    const motivo = input.motivo?.trim() ?? '';
    if (motivo.length === 0 || motivo.length > 5000) {
      throw new BadRequestException('motivo debe tener entre 1 y 5000 caracteres');
    }

    // Precondición de concurrencia, no un dato informativo: una intención
    // formada contra otro líder no se aplica al que hay ahora.
    if (project.creadoPor !== input.expectedLeaderId) {
      throw new ConflictException({
        statusCode: 409,
        code: 'LIDER_INESPERADO',
        message: 'El liderazgo del proyecto cambió; vuelve a consultarlo',
      });
    }

    const liderAnteriorId = project.creadoPor;
    // La lista de candidatos que vio la interfaz es informativa: la
    // elegibilidad que decide se comprueba AQUÍ, bajo el lock.
    await this.eligibility.assertLeadershipCandidate(tx, {
      projectId: input.projectId,
      userId: input.newLeaderId,
      liderActualId: liderAnteriorId,
    });

    // Q1 se relee con el estado actual, no con el que existía al apelar.
    const participacionesSaliente = await tx.participacionProyecto.findMany({
      where: {
        idUsuario: liderAnteriorId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: input.projectId },
      },
      select: { idParticipacion: true, idRolProyecto: true },
    });
    const salienteTieneParticipacionActiva = participacionesSaliente.length > 0;

    // Rama de aceptación: la apelación se resuelve ANTES de mover el
    // liderazgo, para que una apelación ya resuelta por otra conexión aborte
    // el cambio en lugar de dejar historia sin solicitud.
    const aceptada =
      input.appealId === undefined
        ? null
        : await this.acceptAppealTx(tx, {
            projectId: input.projectId,
            appealId: input.appealId,
            expectedLeaderId: input.expectedLeaderId,
            adminId: input.adminId,
          });
    const origen =
      aceptada === null
        ? OrigenCambioLiderazgo.CAMBIO_ADMINISTRATIVO
        : OrigenCambioLiderazgo.SOLICITUD_LIDER;

    const movido = await tx.proyecto.updateMany({
      where: { idProyecto: input.projectId, creadoPor: input.expectedLeaderId },
      data: { creadoPor: input.newLeaderId },
    });
    if (movido.count !== 1) {
      throw new ConflictException({
        statusCode: 409,
        code: 'LIDER_INESPERADO',
        message: 'El liderazgo del proyecto cambió; vuelve a consultarlo',
      });
    }

    const historial = await tx.historialLiderazgo.create({
      data: {
        idProyecto: input.projectId,
        idLiderAnterior: liderAnteriorId,
        idLiderNuevo: input.newLeaderId,
        idAdminResponsable: input.adminId,
        motivo,
        origen,
        // CK14: `SOLICITUD_LIDER` ⇔ hay apelación. La FK es el ÚNICO enlace
        // entre apelación e historia; el candidato sugerido se lee por ella.
        idApelacion: aceptada?.idApelacion ?? null,
      },
      select: { idHistorialLiderazgo: true },
    });

    if (aceptada === null) {
      // Cambio directo: la solicitud pendiente del saliente caduca en la MISMA
      // transacción, para no dejar viva una petición de una autoridad que ya no
      // existe.
      await this.autoCancelPendingAppealTx(tx, {
        projectId: input.projectId,
        liderAnteriorId,
        adminId: input.adminId,
      });
    }

    await this.bitacoraEventos.registrarEvento({
      tx,
      tipoEvento: TipoEventoBitacora.LEADERSHIP_CHANGED,
      idActor: input.adminId,
      idProyecto: input.projectId,
      tipoEntidad: 'PROYECTO',
      idEntidad: input.projectId,
      valorAnterior: { creadoPor: liderAnteriorId },
      valorNuevo: {
        creadoPor: input.newLeaderId,
        idHistorialLiderazgo: historial.idHistorialLiderazgo,
        origen,
        idApelacion: aceptada?.idApelacion ?? null,
        motivo,
        // Evidencia del efecto observado, no insumo de decisiones futuras.
        participacionesObservadas: participacionesSaliente.map((fila) => fila.idParticipacion),
        salienteTieneParticipacionActiva,
      },
    });

    if (aceptada !== null) {
      const proyecto = await tx.proyecto.findUniqueOrThrow({
        where: { idProyecto: input.projectId },
        select: { tituloProyecto: true },
      });
      const sucesor = await tx.usuario.findUniqueOrThrow({
        where: { idUsuario: input.newLeaderId },
        select: { nombre: true, apellido: true },
      });
      await this.notifications.persistTemplateTx(
        tx,
        [aceptada.idLiderSolicitante],
        'APELACION_LIDERAZGO_RESUELTA',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: input.projectId,
          appealId: aceptada.idApelacion,
          accepted: true,
          newLeaderName: `${sucesor.nombre} ${sucesor.apellido}`.trim(),
        },
        ctx.effects,
      );
    }

    const equipoActivo = await this.persistLeadershipNotificationsTx(ctx, {
      projectId: input.projectId,
      liderAnteriorId,
      liderNuevoId: input.newLeaderId,
      salienteTieneParticipacionActiva,
    });

    ctx.effects.add({
      key: `realtime:leadership:${input.projectId}`,
      publish: () =>
        this.notifications.notifyLeadershipChanged(
          [liderAnteriorId, input.newLeaderId, ...equipoActivo],
          {
            projectId: input.projectId,
            historialId: historial.idHistorialLiderazgo,
            liderAnteriorId,
            liderNuevoId: input.newLeaderId,
            origen,
          },
        ),
    });

    return {
      historialId: historial.idHistorialLiderazgo,
      liderAnteriorId,
      liderNuevoId: input.newLeaderId,
      salienteTieneParticipacionActiva,
      efectoSaliente: salienteTieneParticipacionActiva
        ? 'INTEGRANTE_NORMAL'
        : 'SIN_MEMBRESIA_OPERATIVA',
    };
  }

  /**
   * §18/§19: la apelación aceptada debe pertenecer al proyecto y al líder
   * ESPERADO, y seguir pendiente. El candidato que sugirió permanece
   * inmutable: el administrador puede designar a otro sucesor elegible sin
   * reescribir lo que el saliente pidió, porque la sugerencia es un hecho
   * histórico y no una instrucción vinculante.
   */
  private async acceptAppealTx(
    tx: Prisma.TransactionClient,
    input: { projectId: number; appealId: number; expectedLeaderId: number; adminId: number },
  ): Promise<ApelacionRow> {
    const apelacion = await this.loadAppealTx(tx, input.projectId, input.appealId);
    if (apelacion.idLiderSolicitante !== input.expectedLeaderId) {
      throw new ConflictException({
        statusCode: 409,
        code: 'APELACION_DE_OTRO_LIDER',
        message: 'La apelación no corresponde al líder esperado del proyecto',
      });
    }
    const aceptada = await this.resolveAppealTx(tx, {
      appealId: input.appealId,
      estado: EstadoApelacionLiderazgo.ACEPTADA,
      idAdminResolutor: input.adminId,
      mensajeResolucion: null,
    });
    await this.bitacoraEventos.registrarEvento({
      tx,
      tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_ACCEPTED,
      idActor: input.adminId,
      idProyecto: input.projectId,
      tipoEntidad: 'APELACION_LIDERAZGO',
      idEntidad: input.appealId,
      valorAnterior: snapshotApelacion(apelacion),
      valorNuevo: snapshotApelacion(aceptada),
    });
    return aceptada;
  }


  /** §18: la pendiente del saliente caduca sin resolverse a favor ni en contra. */
  private async autoCancelPendingAppealTx(
    tx: Prisma.TransactionClient,
    input: { projectId: number; liderAnteriorId: number; adminId: number },
  ): Promise<void> {
    const pendiente = await tx.apelacionLiderazgo.findFirst({
      where: {
        idProyecto: input.projectId,
        idLiderSolicitante: input.liderAnteriorId,
        estadoApelacion: EstadoApelacionLiderazgo.PENDIENTE,
      },
      select: APELACION_SELECT,
    });
    if (!pendiente) {
      return;
    }
    const cancelada = await this.resolveAppealTx(tx, {
      appealId: pendiente.idApelacion,
      estado: EstadoApelacionLiderazgo.CANCELADA,
      idAdminResolutor: input.adminId,
      mensajeResolucion: MOTIVO_CANCELACION_AUTOMATICA,
    });
    await this.bitacoraEventos.registrarEvento({
      tx,
      tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_CANCELLED,
      idActor: input.adminId,
      idProyecto: input.projectId,
      tipoEntidad: 'APELACION_LIDERAZGO',
      idEntidad: pendiente.idApelacion,
      valorAnterior: snapshotApelacion(pendiente),
      valorNuevo: snapshotApelacion(cancelada),
    });
  }

  /**
   * §44: `LIDERAZGO_ACTUALIZADO` para el saliente, el nuevo líder y cada
   * usuario del equipo activo UNA sola vez. El saliente y el sucesor se
   * excluyen de la lista de equipo para que nadie reciba dos filas por estar
   * en dos grupos, y el texto del saliente explica su efecto Q1 real.
   *
   * Devuelve el equipo activo restante para que el emisor realtime alcance a
   * la misma audiencia sin volver a consultarla.
   */
  private async persistLeadershipNotificationsTx(
    ctx: ProjectTransactionContext,
    input: {
      projectId: number;
      liderAnteriorId: number;
      liderNuevoId: number;
      salienteTieneParticipacionActiva: boolean;
    },
  ): Promise<number[]> {
    const { tx } = ctx;
    const [proyecto, anterior, nuevo, equipo] = await Promise.all([
      tx.proyecto.findUniqueOrThrow({
        where: { idProyecto: input.projectId },
        select: { tituloProyecto: true },
      }),
      tx.usuario.findUniqueOrThrow({
        where: { idUsuario: input.liderAnteriorId },
        select: { nombre: true, apellido: true },
      }),
      tx.usuario.findUniqueOrThrow({
        where: { idUsuario: input.liderNuevoId },
        select: { nombre: true, apellido: true },
      }),
      tx.participacionProyecto.findMany({
        where: {
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: input.projectId },
          idUsuario: { notIn: [input.liderAnteriorId, input.liderNuevoId] },
        },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      }),
    ]);

    const previousLeaderName = `${anterior.nombre} ${anterior.apellido}`.trim();
    const newLeaderName = `${nuevo.nombre} ${nuevo.apellido}`.trim();
    const base = {
      projectTitle: proyecto.tituloProyecto,
      projectId: input.projectId,
      previousLeaderName,
      newLeaderName,
    };

    await this.notifications.persistTemplateTx(
      tx,
      [input.liderAnteriorId],
      'LIDERAZGO_ACTUALIZADO',
      {
        ...base,
        audiencia: 'SALIENTE',
        salienteConservaMembresia: input.salienteTieneParticipacionActiva,
      },
      ctx.effects,
    );
    await this.notifications.persistTemplateTx(
      tx,
      [input.liderNuevoId],
      'LIDERAZGO_ACTUALIZADO',
      { ...base, audiencia: 'NUEVO' },
      ctx.effects,
    );
    const equipoIds = equipo.map((fila) => fila.idUsuario);
    await this.notifications.persistTemplateTx(
      tx,
      equipoIds,
      'LIDERAZGO_ACTUALIZADO',
      { ...base, audiencia: 'EQUIPO' },
      ctx.effects,
    );
    return equipoIds;
  }


  /**
   * E101 (§19): un administrador deniega la apelación.
   *
   * Denegar es terminal y NO transfiere nada: el proyecto sigue con el mismo
   * líder y el equipo sigue igual. El motivo es obligatorio (CK12) y el autor
   * recibe el aviso aunque ya no participe en el proyecto, porque la respuesta
   * a su solicitud le pertenece a él, no a su membresía.
   */
  async denyAppeal(
    projectId: number,
    appealId: number,
    actorId: number,
    dto: DenyAppealDto,
  ): Promise<ApelacionPublica> {
    return this.projectTx.run(projectId, actorId, 'leadership.denyAppeal', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'LIDERAZGO', actorId);
      await this.policy.assertAdminTx(tx, actorId);

      const apelacion = await this.loadAppealTx(tx, projectId, appealId);
      const mensajeResolucion = dto.mensajeResolucion?.trim() ?? '';
      if (mensajeResolucion.length === 0 || mensajeResolucion.length > 5000) {
        throw new BadRequestException('mensajeResolucion debe tener entre 1 y 5000 caracteres');
      }

      const denegada = await this.resolveAppealTx(tx, {
        appealId,
        estado: EstadoApelacionLiderazgo.DENEGADA,
        idAdminResolutor: actorId,
        mensajeResolucion,
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_DENIED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'APELACION_LIDERAZGO',
        idEntidad: appealId,
        valorAnterior: snapshotApelacion(apelacion),
        valorNuevo: snapshotApelacion(denegada),
      });

      const proyecto = await tx.proyecto.findUniqueOrThrow({
        where: { idProyecto: projectId },
        select: { tituloProyecto: true },
      });
      await this.notifications.persistTemplateTx(
        tx,
        [apelacion.idLiderSolicitante],
        'APELACION_LIDERAZGO_RESUELTA',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId,
          appealId,
          accepted: false,
          mensajeResolucion,
        },
        ctx.effects,
      );

      return denegada;
    });
  }

  /** La apelación debe pertenecer al proyecto de la ruta; un cruce es 404, no 403. */
  private async loadAppealTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    appealId: number,
  ): Promise<ApelacionRow> {
    const apelacion = await tx.apelacionLiderazgo.findFirst({
      where: { idApelacion: appealId, idProyecto: projectId },
      select: APELACION_SELECT,
    });
    if (!apelacion) {
      throw new NotFoundException(
        `Apelación con id ${appealId} no encontrada en el proyecto ${projectId}`,
      );
    }
    return apelacion;
  }

  /**
   * CAS `PENDIENTE → <estado terminal>`. Contar la fila actualizada es lo que
   * convierte una repetición en 409 en vez de un segundo efecto: la segunda
   * llamada no encuentra ya una apelación pendiente que resolver.
   */
  private async resolveAppealTx(
    tx: Prisma.TransactionClient,
    input: {
      appealId: number;
      estado: EstadoApelacionLiderazgo;
      idAdminResolutor: number | null;
      mensajeResolucion: string | null;
    },
  ): Promise<ApelacionRow> {
    const actualizado = await tx.apelacionLiderazgo.updateMany({
      where: { idApelacion: input.appealId, estadoApelacion: EstadoApelacionLiderazgo.PENDIENTE },
      data: {
        estadoApelacion: input.estado,
        resueltaEn: new Date(),
        idAdminResolutor: input.idAdminResolutor,
        mensajeResolucion: input.mensajeResolucion,
      },
    });
    if (actualizado.count !== 1) {
      throw new ConflictException({
        statusCode: 409,
        code: 'APELACION_NO_PENDIENTE',
        message: 'La apelación ya no está pendiente',
      });
    }
    return tx.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: input.appealId },
      select: APELACION_SELECT,
    });
  }

  /**
   * El índice parcial `s7_apelacion_pendiente` es la última línea de defensa
   * de «una pendiente por proyecto y líder»: si una carrera lo viola, se
   * traduce a 409 y se aborta, sin seguir consultando una transacción ya
   * fallida en PostgreSQL.
   */
  private async insertAppeal(
    tx: Prisma.TransactionClient,
    input: {
      projectId: number;
      actorId: number;
      asunto: string;
      mensaje: string;
      idCandidatoPropuesto: number;
    },
  ): Promise<ApelacionRow> {
    try {
      return await tx.apelacionLiderazgo.create({
        data: {
          idProyecto: input.projectId,
          idLiderSolicitante: input.actorId,
          asunto: input.asunto,
          mensaje: input.mensaje,
          idCandidatoPropuesto: input.idCandidatoPropuesto,
        },
        select: APELACION_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'APELACION_PENDIENTE_EXISTENTE',
          message: 'Ya existe una apelación pendiente de este líder en el proyecto',
        });
      }
      throw error;
    }
  }
}
