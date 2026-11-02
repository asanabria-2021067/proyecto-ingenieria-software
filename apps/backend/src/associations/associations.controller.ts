import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssociationsService } from './associations.service';
import { JuntaGuard } from './junta.guard';

@Controller('asociaciones')
@UseGuards(JwtAuthGuard)
export class AssociationsController {
  constructor(private readonly service: AssociationsService) {}

  /** Juntas del usuario: alimenta el cambio de vista Estudiante / Asociación. */
  @Get('mis-juntas')
  misJuntas(@CurrentUser() user: { userId: number }) {
    return this.service.misJuntas(user.userId);
  }

  /** Paso «Participantes» al crear un proyecto a nombre de la asociación; el servicio exige Presidente o Editor. */
  @Get(':idAsociacion/candidatos-participantes')
  @UseGuards(JuntaGuard)
  candidatosParticipantes(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Query('q') q?: string,
  ) {
    return this.service.candidatosParticipantes(id, user.userId, q);
  }

  /** Membresía propia en la junta; las rutas del dashboard de asociación reutilizan `JuntaGuard`. */
  @Get(':idAsociacion/membresia')
  @UseGuards(JuntaGuard)
  membresia(@Req() req: { junta: { cargo: string; nivelPermiso: string; asociacion: { idAsociacion: number; nombre: string } } }) {
    const { cargo, nivelPermiso, asociacion } = req.junta;
    return { idAsociacion: asociacion.idAsociacion, nombre: asociacion.nombre, cargo, nivelPermiso };
  }
}
