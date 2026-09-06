import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import type { ClosureResult, RequestCloseDto, ResubmitClosureDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §21/§24): orquestación del lado del LÍDER en el cierre.
 *
 * El líder prepara, genera su informe y SOLICITA; nunca cierra. Esa asimetría
 * es el contrato: quien ejecuta el proyecto no es quien acredita sus horas.
 *
 * Esqueleto en C127: preparar (C129), generar (C130), solicitar (C133) y
 * reenviar (C137) llegan cada uno con su contrato.
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
    protected readonly readiness: ProjectCloseReadinessService,
  ) {}

  /** E103: crea el borrador o devuelve el que ya existe. */
  prepare(_projectId: number, _actorId: number): Promise<ClosureDraft> {
    return Promise.reject(new Error('prepare todavía no está implementado'));
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
