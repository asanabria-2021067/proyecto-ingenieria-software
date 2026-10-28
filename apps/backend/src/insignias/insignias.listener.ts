import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { INSIGNIAS_EVENTO, InsigniasRecalcularEvent } from './insignias.catalog';
import { InsigniasService } from './insignias.service';

@Injectable()
export class InsigniasListener {
  private readonly logger = new Logger(InsigniasListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insignias: InsigniasService,
  ) {}

  /** Async: nunca bloquea ni hace fallar la respuesta HTTP que emitió el evento. */
  @OnEvent(INSIGNIAS_EVENTO, { async: true })
  async handle(evento: InsigniasRecalcularEvent): Promise<void> {
    try {
      for (const idUsuario of await this.resolverUsuarios(evento)) {
        try {
          await this.insignias.recalcular(idUsuario, evento.claves);
        } catch (error) {
          this.logger.error(`Fallo al recalcular insignias del usuario ${idUsuario}`, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Fallo al resolver los usuarios de un evento de insignias', error as Error);
    }
  }

  private async resolverUsuarios(e: InsigniasRecalcularEvent): Promise<number[]> {
    const ids = new Set(e.idUsuarios ?? []);
    if (e.idTarea !== undefined) {
      const filas = await this.prisma.asignacionTarea.findMany({
        where: { idTarea: e.idTarea },
        select: { idUsuario: true },
        distinct: ['idUsuario'],
      });
      filas.forEach((f) => ids.add(f.idUsuario));
    }
    if (e.idProyecto !== undefined) {
      const [proyecto, filas] = await Promise.all([
        this.prisma.proyecto.findUnique({ where: { idProyecto: e.idProyecto }, select: { creadoPor: true } }),
        this.prisma.participacionProyecto.findMany({
          where: { rolProyecto: { idProyecto: e.idProyecto } },
          select: { idUsuario: true },
          distinct: ['idUsuario'],
        }),
      ]);
      if (proyecto) ids.add(proyecto.creadoPor);
      filas.forEach((f) => ids.add(f.idUsuario));
    }
    return [...ids];
  }
}
