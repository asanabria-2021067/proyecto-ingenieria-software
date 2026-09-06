import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskEstadoDto } from './dto/update-task-estado.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CloseAssignmentDto } from './dto/close-assignment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C040 (06 v2 §32/§41 E046–E052): metadata definitiva por familia en los
 * siete handlers de escritura. El proyecto se resuelve desde
 * `params.projectId`; toda escritura de tarea exige P/E con Sprint ambiente
 * ACTIVO, y el servicio exige además, tras el lock, que la tarea afectada
 * pertenezca a un Sprint ACTIVO (todas las operaciones menos crear).
 */
const TASK_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'TAREA_WRITE',
};
const TASK_ASSIGNMENT: ProjectWriteMetadata = { ...TASK_WRITE, family: 'TAREA_ASIGNACION' };

@Controller('proyectos/:projectId/tareas')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  /** E044: tablero del proyecto; el alcance por actor (§34) lo aplica el servicio. */
  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.tasksService.findAll(projectId, user.userId);
  }

  /** E045: detalle de una tarea; mismo alcance §34, con el Sprint de la tarea como entidad. */
  @Get(':taskId')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.tasksService.findOne(projectId, taskId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(projectId, user.userId, dto);
  }

  @Patch(':taskId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(projectId, taskId, user.userId, dto);
  }

  @Patch(':taskId/estado')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  updateEstado(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateTaskEstadoDto,
  ) {
    return this.tasksService.updateEstado(projectId, taskId, user.userId, dto);
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.tasksService.remove(projectId, taskId, user.userId);
  }

  @Post(':taskId/asignar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_ASSIGNMENT)
  assign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasksService.assign(projectId, taskId, user.userId, dto);
  }

  @Delete(':taskId/asignar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_ASSIGNMENT)
  async unassign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.tasksService.unassign(projectId, taskId, user.userId);
  }

  @Post(':taskId/asignaciones/:assignmentId/cerrar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_ASSIGNMENT)
  closeAssignment(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param() params: { assignmentId?: string },
    @CurrentUser() user: { userId: number },
    @Body() dto: CloseAssignmentDto,
  ) {
    const assignmentId = Number(params.assignmentId);
    if (!Number.isInteger(assignmentId)) {
      throw new BadRequestException('assignmentId debe ser un número entero');
    }
    return this.tasksService.closeAssignment(projectId, taskId, assignmentId, user.userId, dto);
  }
}
