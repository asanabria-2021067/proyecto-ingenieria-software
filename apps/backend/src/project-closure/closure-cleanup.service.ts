import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import type { SweepDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §27): barrido de documentos de cierre abandonados.
 *
 * Vive del lado de la BASE DE DATOS, no dentro del adaptador del proveedor:
 * decidir qué se purga es una regla de negocio con lock, y destruir el objeto
 * remoto es I/O que ocurre después del commit y fuera de toda transacción.
 *
 * Esqueleto en C127: reservar la purga y consumarla llegan con su contrato.
 */

export interface SweepReport {
  dryRun: boolean;
  candidatos: number[];
  purgados: number[];
  fallidos: number[];
}

@Injectable()
export class ClosureCleanupService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
  ) {}

  /** E120: informa qué se purgaría sin tocar nada. */
  dryRun(_actorId: number, _dto: SweepDto): Promise<SweepReport> {
    return Promise.reject(new Error('dryRun todavía no está implementado'));
  }

  /** E120: reserva la purga bajo lock, destruye fuera de tx y confirma después. */
  sweep(_actorId: number, _dto: SweepDto): Promise<SweepReport> {
    return Promise.reject(new Error('sweep todavía no está implementado'));
  }
}
