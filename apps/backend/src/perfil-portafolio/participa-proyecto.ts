import { Prisma } from '@prisma/client';

/** Participa (o participo) en un proyecto: participacion activa o completada, o creador. */
export const participa = (id: number): Prisma.ProyectoWhereInput => ({
  OR: [
    { creadoPor: id },
    { roles: { some: { participaciones: { some: { idUsuario: id, estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] } } } } } },
  ],
});
