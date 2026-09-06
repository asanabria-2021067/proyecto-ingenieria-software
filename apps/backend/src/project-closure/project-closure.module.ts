import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { StorageModule } from '../storage/storage.module';
import { AdminProjectsController } from './admin-projects.controller';
import { ClosureDocumentsController } from './closure-documents.controller';
import { HistoricalProjectController } from './historical-project.controller';
import { HistoricalProjectReadService } from './historical-project-read.service';
import { ProjectClosureDocumentsService } from './project-closure-documents.service';
import { ProjectClosureReportService } from './project-closure-report.service';

/**
 * C111/C113/C121 (06 v2 §38/§39): módulo de cierre de proyecto.
 *
 * Importa Storage para hablar con el proveedor a través del puerto, nunca con
 * su SDK directamente, y Policy para autorizar bajo el lock. Todavía no se
 * registra en `AppModule`: la superficie de cierre se abre con el commit que
 * la contrata.
 */
@Module({
  imports: [PrismaModule, ProjectPolicyModule, BitacoraModule, StorageModule],
  controllers: [ClosureDocumentsController, HistoricalProjectController, AdminProjectsController],
  providers: [
    ProjectClosureReportService,
    ProjectClosureDocumentsService,
    HistoricalProjectReadService,
  ],
  exports: [
    ProjectClosureReportService,
    ProjectClosureDocumentsService,
    HistoricalProjectReadService,
  ],
})
export class ProjectClosureModule {}
