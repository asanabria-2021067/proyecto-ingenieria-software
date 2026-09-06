import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectIdResolverService } from './project-id-resolver.service';
import { ProjectPolicyService } from './project-policy.service';
import { ProjectReadPolicyService } from './project-read-policy.service';
import { ProjectTransactionService } from './project-transaction.service';

/**
 * Sprint 7 (06 v2 §38/§39): módulo compartido de política de proyecto.
 * Depende únicamente de Prisma; nunca importa un módulo de dominio ni
 * Notifications. Sus providers se registran aquí una sola vez y se
 * consumen por importación (no se re-proveen en cada módulo de dominio).
 * Todavía no se registra en AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    ProjectIdResolverService,
    ProjectTransactionService,
    ProjectPolicyService,
    ProjectReadPolicyService,
  ],
  exports: [
    ProjectIdResolverService,
    ProjectTransactionService,
    ProjectPolicyService,
    ProjectReadPolicyService,
  ],
})
export class ProjectPolicyModule {}
