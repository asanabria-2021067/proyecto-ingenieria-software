import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { TasksExtrasService } from './tasks-extras.service';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/checklist-item.dto';

/** Misma metadata que las demas escrituras de tarea: P/E con Sprint ACTIVO. */
const TASK_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'TAREA_WRITE',
};

/** MEJ-6 (checklist) y MEJ-10 (historial). */
@Controller('proyectos/:projectId/tareas/:taskId')
@UseGuards(JwtAuthGuard)
export class TasksExtrasController {
  constructor(private readonly extras: TasksExtrasService) {}

  @Get('historial')
  historial(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.extras.historial(projectId, taskId, user.userId);
  }

  @Post('checklist')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  addItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.extras.addItem(projectId, taskId, user.userId, dto);
  }

  @Patch('checklist/:itemId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  updateItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.extras.updateItem(projectId, taskId, itemId, user.userId, dto);
  }

  @Delete('checklist/:itemId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  removeItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.extras.removeItem(projectId, taskId, itemId, user.userId);
  }
}
