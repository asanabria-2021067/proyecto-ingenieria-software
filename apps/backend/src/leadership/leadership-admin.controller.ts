import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { ApelacionPageQueryDto } from './dto/appeal-page.query';
import { DenyAppealDto } from './dto/deny-appeal.dto';
import { TransferLeadershipDto } from './dto/transfer-leadership.dto';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C091/C095 (06 v2 §41 E099–E102): superficie administrativa del liderazgo —
 * bandeja de apelaciones, aceptación, denegación y cambio directo.
 *
 * Vive en un controller aparte porque el actor es distinto: el administrador
 * resuelve sobre el proyecto sin ser integrante operativo del equipo. Las dos
 * rutas que transfieren llaman a la MISMA orquestación que el motor único
 * expone; no existe un segundo camino para mover el liderazgo.
 */
const LEADERSHIP_ADMIN_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ANY',
  family: 'LIDERAZGO',
};

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class LeadershipAdminController {
  constructor(
    private readonly leadershipRead: LeadershipReadService,
    private readonly leadership: LeadershipService,
  ) {}

  /** E099: bandeja global de apelaciones; el filtro acota, no amplía. */
  @Get('liderazgo/apelaciones')
  inbox(@CurrentUser() user: { userId: number }, @Query() query: ApelacionPageQueryDto) {
    return this.leadershipRead.adminInbox(undefined, { actorId: user.userId, query });
  }

  /** E100: aceptar la apelación por el MISMO motor que el cambio directo. */
  @Post('proyectos/:projectId/liderazgo/apelaciones/:appealId/aceptar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LEADERSHIP_ADMIN_WRITE)
  acceptAppeal(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('appealId', ParseIntPipe) appealId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: TransferLeadershipDto,
  ) {
    return this.leadership.transfer(projectId, user.userId, dto, appealId);
  }

  /** E102: cambio administrativo directo, sin cooperación del saliente. */
  @Post('proyectos/:projectId/liderazgo/cambiar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LEADERSHIP_ADMIN_WRITE)
  changeLeader(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: TransferLeadershipDto,
  ) {
    return this.leadership.transfer(projectId, user.userId, dto);
  }

  /** E101: denegar la apelación con un motivo, sin tocar el liderazgo. */
  @Post('proyectos/:projectId/liderazgo/apelaciones/:appealId/denegar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LEADERSHIP_ADMIN_WRITE)
  denyAppeal(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('appealId', ParseIntPipe) appealId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: DenyAppealDto,
  ) {
    return this.leadership.denyAppeal(projectId, appealId, user.userId, dto);
  }
}
