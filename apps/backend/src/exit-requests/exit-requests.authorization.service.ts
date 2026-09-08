import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExitRequestsContextService } from './exit-requests.context.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * C044 (06 v2 §13): la autorización por acción no cambia; ahora se evalúa con
 * el `tx` del runner por proyecto, ya con el lock adquirido.
 */
@Injectable()
export class ExitRequestsAuthorizationService {
  constructor(private readonly context: ExitRequestsContextService) {}

  async assertCanCreateSolicitudSalida(idProyecto: number, idUsuario: number, db?: Db) {
    const proyecto = await this.context.getProjectOrThrow(idProyecto, db);

    if (proyecto.creadoPor === idUsuario) {
      throw new ForbiddenException(
        'El líder del proyecto no puede solicitar su salida mediante este flujo',
      );
    }

    const participacion = await this.context.getActiveParticipation(idProyecto, idUsuario, db);
    if (!participacion) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }

    return proyecto;
  }

  async assertProjectLeader(idProyecto: number, userId: number, db?: Db) {
    const proyecto = await this.context.getLeaderProjectOrThrow(idProyecto, db);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
    return proyecto;
  }
}
