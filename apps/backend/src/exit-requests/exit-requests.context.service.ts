import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * C044 (06 v2 §13/§40): todas las consultas de contexto aceptan el cliente
 * transaccional del runner por proyecto; dentro de una escritura siempre se
 * pasa `tx`, de modo que proyecto, participación y solicitud se leen bajo el
 * mismo lock que decide. Este servicio nunca abre una transacción propia.
 */
@Injectable()
export class ExitRequestsContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectOrThrow(idProyecto: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    return proyecto;
  }

  async getLeaderProjectOrThrow(idProyecto: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    return proyecto;
  }

  async getActiveParticipation(idProyecto: number, idUsuario: number, db: Db = this.prisma) {
    return db.participacionProyecto.findFirst({
      where: {
        idUsuario,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
  }

  async getPendingSolicitudSalidaOrThrow(idProyecto: number, idSolicitud: number, db: Db = this.prisma) {
    const solicitud = await db.solicitudSalidaProyecto.findFirst({
      where: { idSolicitud, idProyecto },
    });
    if (!solicitud) {
      throw new NotFoundException(`Solicitud con id ${idSolicitud} no encontrada`);
    }
    if (solicitud.estadoSolicitud !== 'PENDIENTE_LIDER') {
      throw new BadRequestException('Solo se puede resolver una solicitud en estado PENDIENTE_LIDER');
    }
    return solicitud;
  }
}
