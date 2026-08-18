import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { EstadoSprint } from '@prisma/client';
import { SprintsContextService } from '../../sprints/sprints-context.service';

export const NO_ACTIVE_SPRINT_MESSAGE = 'No hay un Sprint activo en este proyecto';
export const FINALIZING_SPRINT_MESSAGE =
  'El Sprint actual está en finalización y el proyecto está temporalmente bloqueado';

/**
 * SYNC GATE 2 (Sprint 6): precondition gate reutilizable que bloquea
 * mutaciones de proyecto cuando no hay un Sprint ACTIVO. Reutiliza
 * exclusivamente el contrato ya publicado por A1
 * (SprintsContextService.getCurrentSprint), sin consultar Prisma
 * directamente ni duplicar la máquina de estados de Sprint: ese método solo
 * devuelve ACTIVO, EN_FINALIZACION o null (CERRADO nunca es operable, así
 * que un proyecto con únicamente Sprints CERRADO cae en null). No decide
 * identidad/permisos del usuario — eso sigue siendo responsabilidad de
 * JwtAuthGuard y de los *AuthorizationService existentes; este guard solo
 * representa disponibilidad de escritura del proyecto.
 */
@Injectable()
export class ProjectWriteGuard implements CanActivate {
  constructor(private readonly sprintsContext: SprintsContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawProjectId = request.params?.projectId;
    const projectId = Number(rawProjectId);
    if (rawProjectId === undefined || !Number.isInteger(projectId)) {
      throw new BadRequestException('projectId debe ser un número entero');
    }

    const sprintOperable = await this.sprintsContext.getCurrentSprint(projectId);

    if (!sprintOperable) {
      throw new ConflictException(NO_ACTIVE_SPRINT_MESSAGE);
    }

    if (sprintOperable.estado === EstadoSprint.EN_FINALIZACION) {
      throw new ConflictException(FINALIZING_SPRINT_MESSAGE);
    }

    return true;
  }
}
