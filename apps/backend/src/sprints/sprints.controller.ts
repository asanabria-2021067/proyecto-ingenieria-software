import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SprintsService } from './sprints.service';

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
}
