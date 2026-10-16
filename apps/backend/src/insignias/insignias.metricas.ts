import { PrismaClient } from '@prisma/client';
import { ClaveInsignia } from './insignias.catalog';

type Db = Pick<
  PrismaClient,
  'tarea' | 'horasParticipacion' | 'proyecto' | 'postulacion' | 'comentario' | 'sprint'
>;

const tareaHechaDe = (idUsuario: number) => ({
  estadoTarea: 'HECHO' as const,
  eliminadoEn: null,
  asignaciones: { some: { idUsuario } },
});

/** Valor actual de la métrica de una insignia para un usuario (ver HU-190). */
export async function calcularMetrica(db: Db, clave: ClaveInsignia, idUsuario: number): Promise<number> {
  switch (clave) {
    case 'tareas':
      return db.tarea.count({ where: tareaHechaDe(idUsuario) });
    case 'horas': {
      const suma = await db.horasParticipacion.aggregate({
        _sum: { horasAprobadas: true },
        where: { estadoHoras: 'APROBADA', participacion: { idUsuario } },
      });
      return Math.floor(Number(suma._sum.horasAprobadas ?? 0));
    }
    case 'cerrados':
      return db.proyecto.count({
        where: {
          estadoProyecto: 'CERRADO',
          eliminadoEn: null,
          creadoPor: { not: idUsuario },
          roles: {
            some: {
              participaciones: { some: { idUsuario, estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] } } },
            },
          },
        },
      });
    case 'liderados':
      return db.proyecto.count({ where: { estadoProyecto: 'CERRADO', eliminadoEn: null, creadoPor: idUsuario } });
    case 'postulaciones':
      return db.postulacion.count({ where: { idUsuarioPostulante: idUsuario, estadoPostulacion: 'ACEPTADA' } });
    case 'comentarios':
      return db.comentario.count({ where: { idAutor: idUsuario, idTarea: { not: null }, eliminadoEn: null } });
    case 'sprints':
      return db.sprint.count({ where: { estado: 'CERRADO', tareas: { some: tareaHechaDe(idUsuario) } } });
  }
}
