import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExitRequestsContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectOrThrow(idProyecto: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    return proyecto;
  }

  async getLeaderProjectOrThrow(idProyecto: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    return proyecto;
  }

  async getActiveParticipation(idProyecto: number, idUsuario: number) {
    return this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
  }

  async getPendingSolicitudSalidaOrThrow(idProyecto: number, idSolicitud: number) {
    const solicitud = await this.prisma.solicitudSalidaProyecto.findFirst({
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
