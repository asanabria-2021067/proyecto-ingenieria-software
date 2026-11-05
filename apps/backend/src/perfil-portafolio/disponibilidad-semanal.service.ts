import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertPerfilAccesible } from './perfil-acceso';

export const ZONA_HORARIA_DISPONIBILIDAD = 'America/Guatemala';

/** Bloque de 1 hora: dia 0 = lunes a 6 = domingo; hora 0-23 (inicio del bloque, hora de Guatemala). */
export interface BloqueDisponible {
  dia: number;
  hora: number;
}

/** MEJ-148: cuadricula semanal de disponibilidad. */
@Injectable()
export class DisponibilidadSemanalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Contrato de lectura reutilizable (asistente de reuniones): bloques libres de una persona ordenados por dia y hora.
   * No comprueba permisos: quien lo llame desde un endpoint debe validar el acceso (usar `obtener` para HTTP).
   */
  async bloquesDe(idUsuario: number): Promise<BloqueDisponible[]> {
    const filas = await this.prisma.disponibilidadSemanal.findMany({
      where: { idUsuario },
      orderBy: [{ diaSemana: 'asc' }, { hora: 'asc' }],
      select: { diaSemana: true, hora: true },
    });
    return filas.map((f) => ({ dia: f.diaSemana, hora: f.hora }));
  }

  async obtener(idVisor: number, idObjetivo: number) {
    await assertPerfilAccesible(this.prisma, idVisor, idObjetivo);
    return { zonaHoraria: ZONA_HORARIA_DISPONIBILIDAD, bloques: await this.bloquesDe(idObjetivo) };
  }

  /** Solo la propia persona: el id sale del token. Reemplaza toda la cuadricula. */
  async reemplazar(idUsuario: number, bloques: BloqueDisponible[]) {
    const unicos = [...new Map(bloques.map((b) => [b.dia * 24 + b.hora, b])).values()];
    await this.prisma.$transaction([
      this.prisma.disponibilidadSemanal.deleteMany({ where: { idUsuario } }),
      this.prisma.disponibilidadSemanal.createMany({
        data: unicos.map((b) => ({ idUsuario, diaSemana: b.dia, hora: b.hora })),
      }),
    ]);
    return this.obtener(idUsuario, idUsuario);
  }
}
