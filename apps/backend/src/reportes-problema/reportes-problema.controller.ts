import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateReporteProblemaDto } from './dto/create-reporte-problema.dto';
import { ListReportesProblemaQueryDto } from './dto/list-reportes-problema-query.dto';
import { ReportesProblemaService } from './reportes-problema.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportesProblemaController {
  constructor(private service: ReportesProblemaService) {}

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('reportes-problema')
  crear(@CurrentUser() user: { userId: number }, @Body() dto: CreateReporteProblemaDto) {
    return this.service.crear(user.userId, dto);
  }

  @Get('admin/reportes-problema')
  @UseGuards(RolesGuard)
  @Roles('administrador')
  listar(@CurrentUser() user: { userId: number }, @Query() query: ListReportesProblemaQueryDto) {
    return this.service.listar(user.userId, query.estado);
  }

  @Patch('admin/reportes-problema/:id/atender')
  @UseGuards(RolesGuard)
  @Roles('administrador')
  atender(@CurrentUser() user: { userId: number }, @Param('id', ParseIntPipe) id: number) {
    return this.service.atender(user.userId, id);
  }
}
