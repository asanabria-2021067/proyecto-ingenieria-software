import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { LinkPreviewService } from '../chat/link-preview/link-preview.service';
import { parseSafeUrl } from '../chat/link-preview/url-safety';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { lockedProject } from './tasks-writes.helpers';
import type { CreateEnlaceDto } from './dto/create-enlace.dto';

export const MAX_ENLACES_POR_TAREA = 10;

const ENLACE_SELECT = {
  idEnlace: true,
  url: true,
  titulo: true,
  sitio: true,
  tipo: true,
  creadoPor: true,
  creadoEn: true,
} as const;

/** El cliente elige el icono segun "tipo"; no se descarga ningun favicon remoto. */
function tipoDe(host: string): string {
  if (/(^|\.)(drive|docs)\.google\.com$/.test(host)) return 'DRIVE';
  if (/(^|\.)figma\.com$/.test(host)) return 'FIGMA';
  if (/(^|\.)github\.com$/.test(host)) return 'GITHUB';
  return 'GENERICO';
}

/**
 * MEJ-107: enlaces https de una tarea con vista previa (titulo, sitio, tipo).
 * Reutiliza LinkPreviewService del chat, con su proteccion SSRF (DNS, IP
 * privadas, puertos y redirecciones revalidados). Ven la lista quienes leen
 * la tarea; agregan y quitan el lider y los responsables (como el checklist).
 */
@Injectable()
export class TareaEnlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly authorization: TasksAuthorizationService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly linkPreview: LinkPreviewService,
  ) {}

  async list(projectId: number, taskId: number, userId: number) {
    const tarea = await this.authorization.assertCanReadTask(projectId, taskId, userId);
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'tareas',
      entitySprintId: tarea?.idSprint ?? null,
    });
    return this.prisma.tareaEnlace.findMany({
      where: { idTarea: taskId },
      select: ENLACE_SELECT,
      orderBy: { idEnlace: 'asc' },
    });
  }

  async add(projectId: number, taskId: number, userId: number, dto: CreateEnlaceDto) {
    // Primero la autoridad: un no miembro nunca provoca una peticion saliente.
    await this.authorization.assertCanChangeTaskState(projectId, taskId, userId);

    let url: URL;
    try {
      url = parseSafeUrl(dto.url);
    } catch {
      throw new BadRequestException('El enlace no es válido');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Solo se admiten enlaces https');
    }
    try {
      await this.linkPreview.resolveSafe(url, AbortSignal.timeout(3000));
    } catch {
      throw new BadRequestException('El enlace no está permitido');
    }

    // Una pagina que no responde (o exige sesion) no impide guardar el enlace.
    const vista = await this.linkPreview.preview(url.href).catch(() => null);
    const data = {
      idTarea: taskId,
      url: url.href,
      titulo: (vista?.titulo ?? url.hostname).slice(0, 200),
      sitio: (vista?.sitio ?? url.hostname).slice(0, 100),
      tipo: tipoDe(url.hostname),
      creadoPor: userId,
    };

    return this.projectTx.run(projectId, userId, 'tasks.enlaces.add', async (ctx) => {
      const tarea = await this.authorization.assertCanChangeTaskState(projectId, taskId, userId, ctx.tx);
      await this.policy.assertWriteTx(ctx.tx, lockedProject(ctx), 'TAREA_WRITE', userId, {
        sprintId: tarea.idSprint,
      });
      if ((await ctx.tx.tareaEnlace.count({ where: { idTarea: taskId } })) >= MAX_ENLACES_POR_TAREA) {
        throw new ConflictException(`La tarea admite hasta ${MAX_ENLACES_POR_TAREA} enlaces`);
      }
      try {
        return await ctx.tx.tareaEnlace.create({ data, select: ENLACE_SELECT });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('El enlace ya está en la tarea');
        }
        throw error;
      }
    });
  }

  remove(projectId: number, taskId: number, linkId: number, userId: number) {
    return this.projectTx.run(projectId, userId, 'tasks.enlaces.remove', async (ctx) => {
      const tarea = await this.authorization.assertCanChangeTaskState(projectId, taskId, userId, ctx.tx);
      await this.policy.assertWriteTx(ctx.tx, lockedProject(ctx), 'TAREA_WRITE', userId, {
        sprintId: tarea.idSprint,
      });
      const { count } = await ctx.tx.tareaEnlace.deleteMany({ where: { idEnlace: linkId, idTarea: taskId } });
      if (count === 0) throw new NotFoundException(`Enlace ${linkId} no encontrado en la tarea ${taskId}`);
    });
  }
}
