import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectIdResolverService } from '../project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../project-policy/project-policy.service';
import {
  DEFAULT_PROJECT_WRITE_METADATA,
  FINALIZING_SPRINT_MESSAGE,
  NO_ACTIVE_SPRINT_MESSAGE,
  PROJECT_WRITE_METADATA_KEY,
  type ProjectWriteMetadata,
} from './project-write.metadata';

export { FINALIZING_SPRINT_MESSAGE, NO_ACTIVE_SPRINT_MESSAGE };

/**
 * Sprint 7 (06 v2 §32): guard de escritura guiado por metadata. Rechazo
 * temprano de ruta: resuelve el proyecto por la fuente enumerada declarada
 * en `@ProjectWrite`, comprueba el estado del proyecto admitido y la
 * exigencia del Sprint ambiente, y lanza 400/403/404/409. Sin metadata
 * aplica el default restrictivo (P/E + Sprint ambiente ACTIVO).
 *
 * El guard NO adquiere locks, NO sustituye al actor y NO decide identidad
 * (eso sigue en JwtAuthGuard). La autorización mutable se repite después
 * del lock en el service con ProjectPolicyService.assertWriteTx, incluido
 * el Sprint de la entidad afectada, aunque este guard haya aprobado el
 * ambiente. Conserva literalmente los mensajes NO_ACTIVE_SPRINT_MESSAGE y
 * FINALIZING_SPRINT_MESSAGE para las rutas que hoy los devuelven.
 */
@Injectable()
export class ProjectWriteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: ProjectIdResolverService,
    private readonly policy: ProjectPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata =
      this.reflector.getAllAndOverride<ProjectWriteMetadata | undefined>(PROJECT_WRITE_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_PROJECT_WRITE_METADATA;

    const request = context.switchToHttp().getRequest();
    const resolved = await this.resolver.resolve(metadata.source, {
      params: request?.params,
      body: request?.body,
    });

    const project = await this.prisma.proyecto.findUnique({
      where: { idProyecto: resolved.projectId },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true, eliminadoEn: true },
    });
    if (!project || project.eliminadoEn !== null) {
      throw new NotFoundException(`Proyecto con id ${resolved.projectId} no encontrado`);
    }

    this.policy.assertProjectState(project, metadata.states);
    await this.policy.assertEnvironmentTx(this.prisma, project.idProyecto, metadata.sprint);

    return true;
  }
}
