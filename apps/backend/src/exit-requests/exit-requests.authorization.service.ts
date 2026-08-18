import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExitRequestsContextService } from './exit-requests.context.service';

@Injectable()
export class ExitRequestsAuthorizationService {
  constructor(private readonly context: ExitRequestsContextService) {}

  async assertCanCreateSolicitudSalida(idProyecto: number, idUsuario: number) {
    const proyecto = await this.context.getProjectOrThrow(idProyecto);

    if (proyecto.creadoPor === idUsuario) {
      throw new ForbiddenException(
        'El líder del proyecto no puede solicitar su salida mediante este flujo',
      );
    }

    const participacion = await this.context.getActiveParticipation(idProyecto, idUsuario);
    if (!participacion) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }

    return proyecto;
  }

  async assertProjectLeader(idProyecto: number, userId: number) {
    const proyecto = await this.context.getLeaderProjectOrThrow(idProyecto);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
    return proyecto;
  }
}
