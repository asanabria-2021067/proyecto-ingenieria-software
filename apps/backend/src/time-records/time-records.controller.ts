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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { CreateTimeRecordDto } from './dto/create-time-record.dto';
import { TimeRecordsService } from './time-records.service';

@Controller('proyectos/:projectId/tareas/:taskId/horas')
@UseGuards(JwtAuthGuard)
export class TimeRecordsController {
  constructor(private readonly timeRecordsService: TimeRecordsService) {}

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.timeRecordsService.findAllForTask(projectId, taskId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTimeRecordDto,
  ) {
    return this.timeRecordsService.create(projectId, taskId, user.userId, dto);
  }
}
