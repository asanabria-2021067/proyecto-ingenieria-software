import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reproduce exactamente TasksContextService.getProjectOrThrow /
 * assertProjectLeader y SprintsContextService.getProjectOrThrow /
 * assertProjectLeader: liderazgo = Proyecto.creadoPor === userId, sin tabla
 * ni rol distinto de "líder" en el schema actual. Se duplica aquí (en vez de
 * importar TasksModule/SprintsModule) para que BitacoraModule no dependa de
 * ningún dominio de negocio — mismo patrón de duplicación ya aceptado entre
 * Tasks y Sprints.
 */
@Injectable()
export class BitacoraContextService {
  constructor(private prisma: PrismaService) {}

  async getProjectOrThrow(projectId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  /**
   * T-164: la bitácora es exclusiva del líder — a diferencia de tareas/tasks
   * (líder o participante activo).
   *
   * Se mantiene esta validación en el backend a propósito: es la única
   * capa que no se puede saltar (un cliente podría llamar al endpoint
   * directamente sin pasar por el frontend). El frontend ya evita disparar
   * la petición cuando el usuario identificado vía la cookie JWT no es
   * líder (ver `useIsProjectLeader` + `useProjectBitacora`), lo que resuelve
   * la carga innecesaria al backend sin depender únicamente del cliente
   * para autorizar.
   */
  async assertProjectLeader(projectId: number, userId: number): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }
}
