import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { EvidenceService } from './evidence.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';

/** Misma metadata que las demas escrituras de tarea: P/E con Sprint ACTIVO. */
const TASK_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'TAREA_WRITE',
};

/** MEJ-49: permisos por actor en EvidenceService. */
@Controller('proyectos/:projectId/tareas/:taskId/evidencias')
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.evidence.list(projectId, taskId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateEvidenceDto,
  ) {
    return this.evidence.create(projectId, taskId, user.userId, dto);
  }

  @Delete(':evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('evidenceId', ParseIntPipe) evidenceId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.evidence.remove(projectId, taskId, evidenceId, user.userId);
  }
}
