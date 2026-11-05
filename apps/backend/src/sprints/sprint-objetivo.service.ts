import { ConflictException, Injectable } from '@nestjs/common';
import { EstadoSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';

/** MEJ-117: el líder edita el objetivo (opcional) de un Sprint que aún no está cerrado. */
@Injectable()
export class SprintObjetivoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: SprintsAuthorizationService,
  ) {}

  async update(projectId: number, sprintId: number, userId: number, objetivo: string | null) {
    const sprint = await this.authorization.assertCanFinalizeSprint(projectId, sprintId, userId);
    if (sprint.estado === EstadoSprint.CERRADO) {
      throw new ConflictException('El Sprint ya está cerrado: su objetivo no se puede cambiar');
    }
    return this.prisma.sprint.update({
      where: { idSprint: sprintId },
      data: { objetivo },
      select: { idSprint: true, objetivo: true },
    });
  }
}
