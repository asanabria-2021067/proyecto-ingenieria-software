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

@Controller('revisiones')
@UseGuards(JwtAuthGuard)
export class RevisionesController {
  constructor(private revisionesService: RevisionesService) {}

  @Get('admin/bandeja')
  findAdminInbox(@CurrentUser() user: { userId: number }) {
    return this.revisionesService.findAdminInbox(user.userId);
  }

  @Get('proyectos/:idProyecto')
  findByProyecto(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.revisionesService.findByProyecto(idProyecto, user.userId);
  }

  @Post('proyectos/:idProyecto/reclamar')
  @HttpCode(HttpStatus.OK)
  reclamar(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.revisionesService.reclamar(idProyecto, user.userId);
  }

  @Post('proyectos/:idProyecto/resolver')
  @HttpCode(HttpStatus.OK)
  resolver(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: ResolverRevisionDto,
  ) {
    return this.revisionesService.resolver(idProyecto, user.userId, dto);
  }
}
