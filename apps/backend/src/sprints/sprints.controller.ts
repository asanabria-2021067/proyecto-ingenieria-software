import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SprintsService } from './sprints.service';
import { AdjustRecognizedHoursDto } from './dto/adjust-recognized-hours.dto';

@Controller('proyectos/:projectId/sprints')
@UseGuards(JwtAuthGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  start(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.startSprint(projectId, user.userId);
  }

  @Post(':sprintId/finalizar')
  @HttpCode(HttpStatus.OK)
  finalize(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.finalizeSprint(projectId, sprintId, user.userId);
  }

  @Post(':sprintId/cerrar')
  @HttpCode(HttpStatus.OK)
  close(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.closeSprint(projectId, sprintId, user.userId);
  }

  @Patch(':sprintId/horas/:participacionId')
  @HttpCode(HttpStatus.OK)
  adjustHours(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @Param('participacionId', ParseIntPipe) participacionId: number,
    @Body() dto: AdjustRecognizedHoursDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.adjustRecognizedHours(
      projectId,
      sprintId,
      participacionId,
      user.userId,
      dto,
    );
  }

  @Get(':sprintId/resumen-cierre')
  @HttpCode(HttpStatus.OK)
  getClosingSummary(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintClosingSummary(projectId, sprintId, user.userId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.listSprints(projectId, user.userId);
  }

  @Get(':sprintId')
  @HttpCode(HttpStatus.OK)
  detail(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintDetail(projectId, sprintId, user.userId);
  }
}
