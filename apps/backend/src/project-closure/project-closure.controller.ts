import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectClosureService } from './project-closure.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import { ProjectClosureReviewService } from './project-closure-review.service';

/**
 * C127 (06 v2 §41): superficie de cierre del proyecto.
 *
 * Las rutas se declaran en los commits que implementan su contrato. Mientras
 * ninguna exista, el cierre de proyecto no puede iniciarse por aquí.
 */
@Controller('proyectos/:projectId/cierre')
@UseGuards(JwtAuthGuard)
export class ProjectClosureController {
  constructor(
    protected readonly closure: ProjectClosureService,
    protected readonly readiness: ProjectCloseReadinessService,
    protected readonly review: ProjectClosureReviewService,
  ) {}
}
