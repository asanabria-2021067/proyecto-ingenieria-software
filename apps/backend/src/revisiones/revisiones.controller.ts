import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RevisionesService } from './revisiones.service';
import { ResolverRevisionDto } from './dto/resolver-revision.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C039 (06 v2 §32/§41 E042–E043): metadata explícita de la revisión de
 * publicación. El proyecto se resuelve desde `params.idProyecto`; reclamar y
 * resolver solo en R con ambiente `ANY`; el actor admin se verifica en el
 * servicio dentro de la transacción.
 */
const PUBLICATION_REVIEW_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'idProyecto' },
  states: ['R'],
  sprint: 'ANY',
  family: 'PUBLICACION_REVISION',
};

@Controller('revisiones')
@UseGuards(JwtAuthGuard)
export class RevisionesController {
  constructor(private revisionesService: RevisionesService) {}

  /** E040: bandeja admin (lectura; se amplía en C133). */
  @Get('admin/bandeja')
  findAdminInbox(@CurrentUser() user: { userId: number }) {
    return this.revisionesService.findAdminInbox(user.userId);
  }

  /** E041: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get('proyectos/:idProyecto')
  findByProyecto(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.revisionesService.findByProyecto(idProyecto, user.userId);
  }

  /** E042: reclamar la revisión pendiente (admin, proyecto en R). */
  @Post('proyectos/:idProyecto/reclamar')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PUBLICATION_REVIEW_WRITE)
  @HttpCode(HttpStatus.OK)
  reclamar(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.revisionesService.reclamar(idProyecto, user.userId);
  }

  /** E043: resolver la revisión pendiente (admin, proyecto en R). */
  @Post('proyectos/:idProyecto/resolver')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PUBLICATION_REVIEW_WRITE)
  @HttpCode(HttpStatus.OK)
  resolver(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: ResolverRevisionDto,
  ) {
    return this.revisionesService.resolver(idProyecto, user.userId, dto);
  }
}
