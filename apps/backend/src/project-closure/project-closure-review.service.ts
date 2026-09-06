import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import type {
  ApproveClosureDto,
  ClosureResult,
  CorrectionDto,
  ReturnExecutionDto,
} from './dto/closure.dto';

/**
 * C127 (06 v2 §29/§30/§31): los tres veredictos administrativos.
 *
 * Aprobar es el ÚNICO camino por el que un proyecto llega a CERRADO y por el
 * que unas horas quedan acreditadas. Corregir devuelve la documentación sin
 * reabrir la ejecución; devolver a ejecución sí la reabre, y ninguna de las
 * dos toca las horas ya consolidadas.
 *
 * Esqueleto en C127: cada veredicto llega con su contrato.
 */
@Injectable()
export class ProjectClosureReviewService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
    protected readonly policy: ProjectPolicyService,
    protected readonly readiness: ProjectCloseReadinessService,
  ) {}

  /** E114: corrección documental; el proyecto sigue en solicitud de cierre. */
  requestDocumentaryCorrection(
    _projectId: number,
    _actorId: number,
    _dto: CorrectionDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('requestDocumentaryCorrection todavía no está implementado'));
  }

  /** E115: devolución a ejecución; las horas pendientes siguen pendientes. */
  returnToExecution(
    _projectId: number,
    _actorId: number,
    _dto: ReturnExecutionDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('returnToExecution todavía no está implementado'));
  }

  /** E112: aprobación; cierra, acredita y completa en una sola transacción. */
  approveClosure(
    _projectId: number,
    _actorId: number,
    _dto: ApproveClosureDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('approveClosure todavía no está implementado'));
  }
}
