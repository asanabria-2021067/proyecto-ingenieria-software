import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Instantánea del proyecto y alta de revisión PENDIENTE (extraído de ProjectsService). */
@Injectable()
export class ProjectsRevisionsService {
  async buildProjectSnapshot(tx: Prisma.TransactionClient, idProyecto: number) {
    return tx.proyecto.findUnique({
      where: { idProyecto },
      select: {
        tituloProyecto: true,
        descripcionProyecto: true,
        objetivosProyecto: true,
        tipoProyecto: true,
        modalidadProyecto: true,
        ubicacionProyecto: true,
        contextoAcademico: true,
        urlRecursoExterno: true,
        fechaInicio: true,
        fechaFinEstimada: true,
        roles: {
          select: {
            idRolProyecto: true,
            nombreRol: true,
            descripcionRolProyecto: true,
            cupos: true,
            horasSemanalesEstimadas: true,
            carreraRequerida: {
              select: { idCarrera: true, nombreCarrera: true, facultad: true },
            },
            requisitos: {
              select: {
                idRequisitoHabilidad: true,
                nivelMinimo: true,
                obligatorio: true,
                habilidad: {
                  select: { idHabilidad: true, nombreHabilidad: true, categoriaHabilidad: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async crearRevisionPendiente(
    tx: Prisma.TransactionClient,
    idProyecto: number,
    numeroEnvio: number,
    snapshot?: object | null,
  ) {
    const existente = await tx.revisionProyecto.findFirst({
      where: { idProyecto, estadoRevision: 'PENDIENTE' },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una revisión pendiente para este proyecto');
    }
    return tx.revisionProyecto.create({
      data: {
        idProyecto,
        numeroEnvio,
        estadoRevision: 'PENDIENTE',
        ...(snapshot ? { snapshotProyecto: snapshot as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
