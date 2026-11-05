import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HorasSemestreService } from '../horas-semestre/horas-semestre.service';
import { semestreDe } from '../horas-semestre/semestre';
import { PrismaService } from '../prisma/prisma.service';
import { assertPuedePublicarComoAsociacion } from './junta-access';
import { CrearMetaAsociacionDto, ListarMetasQueryDto } from './dto/meta-asociacion.dto';

export const META_NOT_FOUND_MESSAGE = 'Meta no encontrada';
export const META_DUPLICADA_MESSAGE = 'Ya existe una meta de ese tipo para el semestre';

const pct = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 100));

/**
 * MEJ-162: metas de la asociación por semestre. Ver las metas lo hace cualquier integrante de la junta
 * (ya verificado por `JuntaGuard`); crear, cambiar o quitar, solo Presidente y Editores.
 * El avance reutiliza la regla «al día» del dashboard: estudiante con meta de ese tipo y sin riesgo.
 */
@Injectable()
export class MetasAsociacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
  ) {}

  async listar(idAsociacion: number, q: ListarMetasQueryDto) {
    const actual = semestreDe(new Date());
    const anio = q.anio ?? actual.anio;
    const periodo = q.periodo ?? actual.periodo;
    const metas = await this.prisma.metaAsociacion.findMany({
      where: { idAsociacion, anio, periodo },
      orderBy: { tipo: 'asc' },
    });
    const conAvance = await Promise.all(
      metas.map(async (m) => {
        const { filas } = await this.horas.recorrerTodas({ anio, periodo, tipo: m.tipo, idAsociacion });
        const conMeta = filas.filter((f) => (m.tipo === 'BECA' ? f.metaBeca : f.metaExtension) !== null);
        const alDia = conMeta.filter((f) => !f.enRiesgo).length;
        const porcentaje = pct(alDia, conMeta.length);
        return {
          idMeta: m.idMeta,
          tipo: m.tipo,
          porcentajeObjetivo: m.porcentajeObjetivo,
          avance: { alDia, total: conMeta.length, porcentaje },
          cumplida: conMeta.length > 0 && porcentaje >= m.porcentajeObjetivo,
        };
      }),
    );
    return { semestre: { anio, periodo }, metas: conAvance };
  }

  async crear(userId: number, idAsociacion: number, dto: CrearMetaAsociacionDto) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    try {
      return await this.prisma.metaAsociacion.create({ data: { ...dto, idAsociacion } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(META_DUPLICADA_MESSAGE);
      throw e;
    }
  }

  /** La meta debe ser de esa asociación: el id de otra responde 404. */
  async actualizar(userId: number, idAsociacion: number, idMeta: number, porcentajeObjetivo: number) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    await this.deLaAsociacion(idAsociacion, idMeta);
    return this.prisma.metaAsociacion.update({ where: { idMeta }, data: { porcentajeObjetivo } });
  }

  async eliminar(userId: number, idAsociacion: number, idMeta: number) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    await this.deLaAsociacion(idAsociacion, idMeta);
    await this.prisma.metaAsociacion.delete({ where: { idMeta } });
    return { idMeta };
  }

  private async deLaAsociacion(idAsociacion: number, idMeta: number) {
    const meta = await this.prisma.metaAsociacion.findFirst({ where: { idMeta, idAsociacion }, select: { idMeta: true } });
    if (!meta) throw new NotFoundException(META_NOT_FOUND_MESSAGE);
  }
}
