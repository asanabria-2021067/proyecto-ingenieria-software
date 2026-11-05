import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite } from '../common/guards/project-write.metadata';
import { TASK_WRITE } from './tasks.controller';
import { TasksExtrasService } from './tasks-extras.service';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/checklist-item.dto';
import { TareaEnlacesService } from './tarea-enlaces.service';
import { CreateEnlaceDto } from './dto/create-enlace.dto';

/** MEJ-6 (checklist), MEJ-10 (historial) y MEJ-107 (enlaces). */
@Controller('proyectos/:projectId/tareas/:taskId')
@UseGuards(JwtAuthGuard)
export class TasksExtrasController {
  constructor(
    private readonly extras: TasksExtrasService,
    private readonly enlaces: TareaEnlacesService,
  ) {}

  @Get('historial')
  historial(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.extras.historial(projectId, taskId, user.userId);
  }

  @Get('enlaces')
  listEnlaces(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.enlaces.list(projectId, taskId, user.userId);
  }

  @Post('enlaces')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  addEnlace(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateEnlaceDto,
  ) {
    return this.enlaces.add(projectId, taskId, user.userId, dto);
  }

  @Delete('enlaces/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_WRITE)
  async removeEnlace(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('linkId', ParseIntPipe) linkId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.enlaces.remove(projectId, taskId, linkId, user.userId);
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
