import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSolicitudSalidaDto } from './dto/create-solicitud-salida.dto';
import { ExitRequestsService } from './exit-requests.service';

@Controller('proyectos/:projectId')
@UseGuards(JwtAuthGuard)
export class ExitRequestsController {
  constructor(private readonly exitRequestsService: ExitRequestsService) {}

  @Post('solicitudes-salida')
  @HttpCode(HttpStatus.CREATED)
  createExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() data: CreateSolicitudSalidaDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.createSolicitudSalida(projectId, user.userId, data.motivo);
  }

  @Post('solicitudes-salida/:idSolicitud/aprobar')
  @HttpCode(HttpStatus.OK)
  approveExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.approveSolicitudSalida(projectId, idSolicitud, user.userId);
  }

  @Post('solicitudes-salida/:idSolicitud/rechazar')
  @HttpCode(HttpStatus.OK)
  rejectExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.rejectSolicitudSalida(projectId, idSolicitud, user.userId);
  }

  @Get('salida/preparacion')
  getExitPreparationSummary(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.getExitPreparationSummary(projectId, user.userId);
  }

  @Post('salida/preparacion/continuar')
  @HttpCode(HttpStatus.OK)
  continueExitPreparation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.continueExitPreparation(projectId, user.userId);
  }

  @Post('salida/preparacion/cancelar')
  @HttpCode(HttpStatus.OK)
  cancelExitPreparation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.cancelExitPreparation(projectId, user.userId);
  }
}
