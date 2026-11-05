import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { participa } from './participa-proyecto';
import { assertPerfilAccesible } from './perfil-acceso';

/** MEJ-147: companeros de proyecto confirman habilidades, una vez cada uno por habilidad. */
@Injectable()
export class HabilidadConfirmacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async compartenProyecto(a: number, b: number) {
    if (a === b) return false;
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { eliminadoEn: null, AND: [participa(a), participa(b)] },
      select: { idProyecto: true },
    });
    return !!proyecto;
  }

  /** Habilidades de la persona con su conteo y lo que puede hacer quien mira. Con idVisor 0 (vista publica) nada es confirmable. */
  async listar(idVisor: number, idObjetivo: number) {
    await assertPerfilAccesible(this.prisma, idVisor, idObjetivo);
    const [habilidades, conteos, mias, puede] = await Promise.all([
      this.prisma.usuarioHabilidad.findMany({
        where: { idUsuario: idObjetivo },
        orderBy: { idUsuarioHabilidad: 'asc' },
        select: { nivelHabilidad: true, habilidad: { select: { idHabilidad: true, nombreHabilidad: true } } },
      }),
      this.prisma.confirmacionHabilidad.groupBy({ by: ['idHabilidad'], where: { idUsuario: idObjetivo }, _count: { _all: true } }),
      this.prisma.confirmacionHabilidad.findMany({ where: { idUsuario: idObjetivo, idConfirmador: idVisor }, select: { idHabilidad: true } }),
      this.compartenProyecto(idVisor, idObjetivo),
    ]);
    const total = new Map(conteos.map((c) => [c.idHabilidad, c._count._all]));
    const confirmadas = new Set(mias.map((m) => m.idHabilidad));
    return habilidades.map((h) => ({
      idHabilidad: h.habilidad.idHabilidad,
      nombre: h.habilidad.nombreHabilidad,
      nivel: h.nivelHabilidad,
      confirmaciones: total.get(h.habilidad.idHabilidad) ?? 0,
      confirmadaPorMi: confirmadas.has(h.habilidad.idHabilidad),
      puedoConfirmar: puede && !confirmadas.has(h.habilidad.idHabilidad),
    }));
  }

  async confirmar(idVisor: number, idObjetivo: number, idHabilidad: number) {
    if (idVisor === idObjetivo) throw new ForbiddenException('No puedes confirmar tus propias habilidades');
    await assertPerfilAccesible(this.prisma, idVisor, idObjetivo);
    const tiene = await this.prisma.usuarioHabilidad.findUnique({
      where: { idUsuario_idHabilidad: { idUsuario: idObjetivo, idHabilidad } },
      select: { idUsuarioHabilidad: true },
    });
    if (!tiene) throw new NotFoundException('La persona no tiene esa habilidad');
    if (!(await this.compartenProyecto(idVisor, idObjetivo))) {
      throw new ForbiddenException('Solo quienes comparten o compartieron un proyecto pueden confirmar habilidades');
    }
    try {
      await this.prisma.confirmacionHabilidad.create({ data: { idUsuario: idObjetivo, idHabilidad, idConfirmador: idVisor } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya confirmaste esta habilidad');
      }
      throw e;
    }
    return { ok: true };
  }

  async retirar(idVisor: number, idObjetivo: number, idHabilidad: number) {
    const { count } = await this.prisma.confirmacionHabilidad.deleteMany({
      where: { idUsuario: idObjetivo, idHabilidad, idConfirmador: idVisor },
    });
    if (count === 0) throw new NotFoundException('No habias confirmado esta habilidad');
    return { ok: true };
  }
}
