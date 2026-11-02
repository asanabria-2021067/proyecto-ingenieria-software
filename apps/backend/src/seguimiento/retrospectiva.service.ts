import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoProyecto, EstadoSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { SprintsContextService } from '../sprints/sprints-context.service';
import { GuardarRetrospectivaDto } from './dto/seguimiento.dto';

const SELECT = { quePaso: true, quePodriaMejorar: true, acuerdos: true, actualizadaEn: true } as const;

/**
 * MEJ-24: retrospectiva opcional de un Sprint. La escribe (y edita) el líder
 * cuando el Sprint ya está en finalización o cerrado; la lee cualquier
 * integrante activo. Cada guardado deja un evento en la bitácora del proyecto.
 */
@Injectable()
export class RetrospectivaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly bitacora: BitacoraEventosService,
  ) {}

  /** Devuelve `null` mientras el líder no la haya escrito (es opcional). */
  async obtener(projectId: number, sprintId: number, actorId: number) {
    await this.sprintsContext.assertActiveProjectParticipant(projectId, actorId);
    await this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId);
    return this.prisma.retrospectivaSprint.findUnique({ where: { idSprint: sprintId }, select: SELECT });
  }

  async guardar(projectId: number, sprintId: number, actorId: number, dto: GuardarRetrospectivaDto) {
    await this.sprintsContext.assertProjectLeader(projectId, actorId);
    const proyecto = await this.sprintsContext.getProjectOrThrow(projectId);
    const sprint = await this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId);
    if (sprint.estado === EstadoSprint.ACTIVO) {
      throw new BadRequestException('La retrospectiva se escribe al finalizar o cerrar el sprint');
    }
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO || proyecto.estadoProyecto === EstadoProyecto.CANCELADO) {
      throw new BadRequestException('El proyecto ya no admite cambios');
    }

    const datos = { quePaso: dto.quePaso, quePodriaMejorar: dto.quePodriaMejorar, acuerdos: dto.acuerdos };
    return this.prisma.$transaction(async (tx) => {
      const previa = await tx.retrospectivaSprint.findUnique({ where: { idSprint: sprintId }, select: SELECT });
      const guardada = await tx.retrospectivaSprint.upsert({
        where: { idSprint: sprintId },
        create: { idSprint: sprintId, idProyecto: projectId, creadaPor: actorId, ...datos },
        update: { ...datos, actualizadaEn: new Date() },
        select: SELECT,
      });
      await this.bitacora.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_RETROSPECTIVE_SAVED,
        idActor: actorId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintId,
        valorAnterior: previa ? { editada: true } : null,
        valorNuevo: { sprint: sprint.numero, ...datos },
      });
      return guardada;
    });
  }
}
