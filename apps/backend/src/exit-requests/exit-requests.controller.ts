import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { CreateSolicitudSalidaDto } from './dto/create-solicitud-salida.dto';
import { ExitRequestsService } from './exit-requests.service';

@Controller('proyectos/:projectId')
@UseGuards(JwtAuthGuard)
export class ExitRequestsController {
  constructor(private readonly exitRequestsService: ExitRequestsService) {}

  @Post('solicitudes-salida')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  createExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() data: CreateSolicitudSalidaDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.createSolicitudSalida(projectId, user.userId, data.motivo);
  }

  @Post('solicitudes-salida/:idSolicitud/aprobar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  approveExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.approveSolicitudSalida(projectId, idSolicitud, user.userId);
  }

  @Post('solicitudes-salida/:idSolicitud/rechazar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  rejectExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.rejectSolicitudSalida(projectId, idSolicitud, user.userId);
  }

  /**
   * F11.1 — reader aditivo: la solicitud de salida ABIERTA (PREPARACION o
   * PENDIENTE_LIDER) del actor en este proyecto, o `{ solicitud: null }` si
   * no tiene ninguna. Sin ProjectWriteGuard: es una lectura, no una
   * escritura. Existe para que el frontend pueda recuperar
   * server-authoritative si la solicitud está en PENDIENTE_LIDER tras un
   * refresh — algo que `salida/preparacion` (B6) no puede responder porque
   * está acoplado a PREPARACION.
   */
  @Get('salida/estado')
  getCurrentExitRequest(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.getSolicitudSalidaAbierta(projectId, user.userId);
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
  @UseGuards(ProjectWriteGuard)
  continueExitPreparation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.continueExitPreparation(projectId, user.userId);
  }

  @Post('salida/preparacion/cancelar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  cancelExitPreparation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.exitRequestsService.cancelExitPreparation(projectId, user.userId);
  }
}
