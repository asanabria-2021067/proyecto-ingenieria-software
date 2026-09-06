import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import {
  ProjectCloseReadinessService,
  type ClosurePhase,
} from './project-close-readiness.service';
import type { ClosureResult, RequestCloseDto, ResubmitClosureDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §21/§24): orquestación del lado del LÍDER en el cierre.
 *
 * El líder prepara, genera su informe y SOLICITA; nunca cierra. Esa asimetría
 * es el contrato: quien ejecuta el proyecto no es quien acredita sus horas.
 *
 * C129: preparar es idempotente bajo el lock del proyecto. Generar (C130),
 * solicitar (C133) y reenviar (C137) llegan cada uno con su contrato.
 */

export interface ClosureDraft {
  idRevisionCierre: number;
  numeroRevision: number;
  estadoRevision: string;
}

@Injectable()
export class ProjectClosureService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
    protected readonly policy: ProjectPolicyService,
    protected readonly readinessService: ProjectCloseReadinessService,
    protected readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  /**
   * E103 (§21/§24): crea el borrador de cierre o devuelve el que ya existe.
   *
   * Es IDEMPOTENTE a propósito: preparar dos veces no puede producir dos
   * borradores, porque `numeroRevision` es consecutivo por proyecto y dos
   * borradores simultáneos harían ambiguo cuál se está entregando. La
   * numeración se calcula bajo el lock del proyecto, no con un contador
   * optimista.
   */
  async prepare(projectId: number, actorId: number): Promise<ClosureDraft> {
    return this.projectTx.run(projectId, actorId, 'closure.prepare', async (ctx) => {
      const { tx } = ctx;
      const proyecto = ctx.project;
      if (!proyecto) {
        throw new NotFoundException('Proyecto no encontrado');
      }
      await this.policy.assertWriteTx(tx, proyecto, 'CIERRE_PREPARACION', actorId);

      const existente = await tx.revisionCierreProyecto.findFirst({
        where: { idProyecto: projectId, estadoRevision: 'BORRADOR' },
        orderBy: { numeroRevision: 'desc' },
        select: { idRevisionCierre: true, numeroRevision: true, estadoRevision: true },
      });
      if (existente) {
        return existente;
      }

      const ultima = await tx.revisionCierreProyecto.aggregate({
        where: { idProyecto: projectId },
        _max: { numeroRevision: true },
      });
      const creada = await tx.revisionCierreProyecto.create({
        data: {
          idProyecto: projectId,
          numeroRevision: (ultima._max.numeroRevision ?? 0) + 1,
          estadoRevision: 'BORRADOR',
        },
        select: { idRevisionCierre: true, numeroRevision: true, estadoRevision: true },
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.CLOSURE_DRAFT_CREATED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'REVISION_CIERRE',
        idEntidad: creada.idRevisionCierre,
        valorAnterior: null,
        valorNuevo: { numeroRevision: creada.numeroRevision, origen: 'PREPARACION' },
      });

      return creada;
    });
  }

  /** E104: preparación consultada; leer nunca cambia el estado del proyecto. */
  async readiness(projectId: number, actorId: number, phase: ClosurePhase) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true, eliminadoEn: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    // La preparación es información del LÍDER: ni el equipo ni un externo la
    // consultan, porque enumera exactamente qué falta para cerrar.
    if (proyecto.creadoPor !== actorId) {
      throw new ForbiddenException('Solo el líder del proyecto puede consultar su preparación');
    }
    return this.readinessService.evaluate(undefined, projectId, { phase });
  }

  /** E105: solicita el cierre y sella la entrega. */
  requestClose(
    _projectId: number,
    _actorId: number,
    _dto: RequestCloseDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('requestClose todavía no está implementado'));
  }

  /** E113: reenvía tras una corrección documental. */
  resubmit(
    _projectId: number,
    _actorId: number,
    _dto: ResubmitClosureDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('resubmit todavía no está implementado'));
  }
}
