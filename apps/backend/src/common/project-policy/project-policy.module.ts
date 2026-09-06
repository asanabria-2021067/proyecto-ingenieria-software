import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectIdResolverService } from './project-id-resolver.service';

/**
 * Sprint 7 (06 v2 §38/§39): módulo compartido de política de proyecto.
 * Depende únicamente de Prisma; nunca importa un módulo de dominio ni
 * Notifications. Sus providers se registran aquí una sola vez y se
 * consumen por importación (no se re-proveen en cada módulo de dominio).
 * Todavía no se registra en AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [ProjectIdResolverService],
  exports: [ProjectIdResolverService],
})
export class ProjectPolicyModule {}
