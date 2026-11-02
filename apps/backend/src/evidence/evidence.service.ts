import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoEvidencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { TasksAuthorizationService } from '../tasks/tasks-authorization.service';
import { TasksContextService } from '../tasks/tasks-context.service';
import { lockedProject } from '../tasks/tasks-writes.helpers';
import { isCloudinaryUrl } from '../common/validators/cloudinary-url.validator';
import type { CreateEvidenceDto } from './dto/create-evidence.dto';

export const MAX_EVIDENCIAS_POR_TAREA = 20;

const EVIDENCIA_SELECT = {
  idEvidencia: true,
  idTarea: true,
  idUsuarioCargador: true,
  tipoEvidencia: true,
  urlRecurso: true,
  descripcion: true,
  tamanoBytes: true,
  fechaEnvio: true,
  cargador: { select: { idUsuario: true, nombre: true, apellido: true } },
} satisfies Prisma.EvidenciaSelect;

function aPublica(fila: Prisma.EvidenciaGetPayload<{ select: typeof EVIDENCIA_SELECT }>) {
  // BigInt no es serializable en JSON.
  return { ...fila, tamanoBytes: fila.tamanoBytes === null ? null : Number(fila.tamanoBytes) };
}

function urlHttpsValida(valor: string): boolean {
  try {
    return new URL(valor).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * MEJ-49: evidencias de una tarea (modelo Evidencia). Ven la lista quienes
 * leen la tarea; suben el lider y el asignado activo (como el cambio de
 * estado); borra quien la subio o el lider, y solo si nadie la reviso.
 */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly authorization: TasksAuthorizationService,
    private readonly context: TasksContextService,
  ) {}

  async list(projectId: number, taskId: number, userId: number) {
    await this.authorization.assertCanReadTask(projectId, taskId, userId);
    const filas = await this.prisma.evidencia.findMany({
      where: { idTarea: taskId },
      select: EVIDENCIA_SELECT,
      orderBy: { fechaEnvio: 'desc' },
    });
    return filas.map(aPublica);
  }

  async create(projectId: number, taskId: number, userId: number, dto: CreateEvidenceDto) {
    const valida =
      dto.tipoEvidencia === TipoEvidencia.ARCHIVO ? isCloudinaryUrl(dto.urlRecurso) : urlHttpsValida(dto.urlRecurso);
    if (!valida) {
      throw new BadRequestException(
        dto.tipoEvidencia === TipoEvidencia.ARCHIVO
          ? 'urlRecurso debe ser una URL de Cloudinary'
          : 'urlRecurso debe ser una URL https válida',
      );
    }

    return this.projectTx.run(projectId, userId, 'evidence.create', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.authorization.assertCanChangeTaskState(projectId, taskId, userId, tx);
      await this.policy.assertWriteTx(tx, lockedProject(ctx), 'TAREA_WRITE', userId, { sprintId: tarea.idSprint });
      const cantidad = await tx.evidencia.count({ where: { idTarea: taskId } });
      if (cantidad >= MAX_EVIDENCIAS_POR_TAREA) {
        throw new ConflictException(`La tarea admite hasta ${MAX_EVIDENCIAS_POR_TAREA} evidencias`);
      }
      const fila = await tx.evidencia.create({
        data: {
          idTarea: taskId,
          idUsuarioCargador: userId,
          tipoEvidencia: dto.tipoEvidencia,
          urlRecurso: dto.urlRecurso,
          descripcion: dto.descripcion ?? null,
          tamanoBytes: dto.tamanoBytes ?? null,
        },
        select: EVIDENCIA_SELECT,
      });
      return aPublica(fila);
    });
  }

  async remove(projectId: number, taskId: number, evidenceId: number, userId: number): Promise<void> {
    await this.projectTx.run(projectId, userId, 'evidence.remove', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.context.getTaskInProjectOrThrow(projectId, taskId, tx);
      await this.policy.assertWriteTx(tx, lockedProject(ctx), 'TAREA_WRITE', userId, { sprintId: tarea.idSprint });
      const evidencia = await tx.evidencia.findFirst({
        where: { idEvidencia: evidenceId, idTarea: taskId },
        select: { idUsuarioCargador: true, _count: { select: { revisiones: true } } },
      });
      if (!evidencia) throw new NotFoundException(`Evidencia ${evidenceId} no encontrada en la tarea ${taskId}`);
      const proyecto = await this.context.getProjectOrThrow(projectId, tx);
      if (evidencia.idUsuarioCargador !== userId && proyecto.creadoPor !== userId) {
        throw new ForbiddenException('Solo quien subió la evidencia o el líder puede eliminarla');
      }
      if (evidencia._count.revisiones > 0) {
        throw new ConflictException('La evidencia ya fue revisada y no se puede eliminar');
      }
      await tx.evidencia.delete({ where: { idEvidencia: evidenceId } });
    });
  }
}
