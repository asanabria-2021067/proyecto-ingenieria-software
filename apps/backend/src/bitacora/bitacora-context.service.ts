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
   * C048/HU-170: la audiencia del lector la decide `ProjectReadPolicyService`
   * con scope `bitacora` (líder, administrador o participante activo en
   * solo lectura) — ver `BitacoraConsultaService.listEventos`, que es quien
   * realmente autoriza cada GET. Este método ya no participa en esa
   * decisión y ningún código de producción lo llama; se conserva por si un
   * caller futuro necesita una comprobación de liderazgo puntual (mismo
   * patrón que Tasks/Sprints), no porque siga gateando la bitácora.
   */
  async assertProjectLeader(projectId: number, userId: number): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }
}
