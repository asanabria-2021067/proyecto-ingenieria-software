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

@Controller('proyectos/:projectId/tareas')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.tasksService.findAll(projectId, user.userId);
  }

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
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(projectId, user.userId, dto);
  }

  @Patch(':taskId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(projectId, taskId, user.userId, dto);
  }

  @Patch(':taskId/estado')
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
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.tasksService.remove(projectId, taskId, user.userId);
  }

  @Post(':taskId/asignar')
  @HttpCode(HttpStatus.OK)
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
  async unassign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.tasksService.unassign(projectId, taskId, user.userId);
  }

  @Post(':taskId/asignaciones/:assignmentId/cerrar')
  @HttpCode(HttpStatus.OK)
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
