import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
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
}
