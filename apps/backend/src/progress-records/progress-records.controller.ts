import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProgressRecordDto } from './dto/create-progress-record.dto';
import { UpdateProgressRecordDto } from './dto/update-progress-record.dto';
import { ProgressRecordsService } from './progress-records.service';

@Controller('proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/avance')
@UseGuards(JwtAuthGuard)
export class ProgressRecordsController {
  constructor(private readonly progressRecordsService: ProgressRecordsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateProgressRecordDto,
  ) {
    return this.progressRecordsService.create(projectId, taskId, assignmentId, user.userId, dto);
  }

  @Patch(':progressRecordId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Param('progressRecordId', ParseIntPipe) progressRecordId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateProgressRecordDto,
  ) {
    return this.progressRecordsService.update(
      projectId,
      taskId,
      assignmentId,
      progressRecordId,
      user.userId,
      dto,
    );
  }
}
