import { Injectable } from '@nestjs/common';
import { idsBloqueados } from '../common/bloqueos';
import { PrismaService } from '../prisma/prisma.service';
import { proyectoVisiblePara } from '../social/perfil-social.service';
import { FILTRO_DIRECTORIO } from '../social/social.service';
import { participa } from './participa-proyecto';
import { assertPerfilAccesible } from './perfil-acceso';

const MAX_PERSONAS = 8;
const MAX_PROYECTOS = 60;

/**
 * MEJ-152: personas que trabajaron en proyectos parecidos a los de `idObjetivo` (mismos intereses de proyecto).
 * Solo cuentan proyectos que quien mira puede ver; no aparecen el propio visor, el objetivo, bloqueos ni cuentas fuera del directorio.
 */
@Injectable()
export class PersonasParecidasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(idVisor: number, idObjetivo: number) {
    await assertPerfilAccesible(this.prisma, idVisor, idObjetivo);
    const propios = await this.prisma.proyecto.findMany({
      where: { eliminadoEn: null, ...participa(idObjetivo) },
      select: { idProyecto: true, intereses: { select: { idInteres: true } } },
    });
    const idsPropios = propios.map((p) => p.idProyecto);
    const intereses = [...new Set(propios.flatMap((p) => p.intereses.map((i) => i.idInteres)))];
    if (intereses.length === 0) return [];

    const excluidos = new Set([idVisor, idObjetivo, ...(await idsBloqueados(this.prisma, idVisor))]);
    const parecidos = await this.prisma.proyecto.findMany({
      where: {
        ...proyectoVisiblePara(idVisor),
        estadoProyecto: { in: ['EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO'] },
        idProyecto: { notIn: idsPropios },
        intereses: { some: { idInteres: { in: intereses } } },
      },
      orderBy: { idProyecto: 'desc' },
      take: MAX_PROYECTOS,
      select: {
        tituloProyecto: true,
        creadoPor: true,
        intereses: { select: { idInteres: true } },
        roles: {
          select: { participaciones: { where: { estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] } }, select: { idUsuario: true } } },
        },
      },
    });

    const porPersona = new Map<number, { proyectos: Set<string>; compartidos: Set<number> }>();
    for (const p of parecidos) {
      const comunes = p.intereses.map((i) => i.idInteres).filter((i) => intereses.includes(i));
      const gente = new Set([p.creadoPor, ...p.roles.flatMap((r) => r.participaciones.map((x) => x.idUsuario))]);
      for (const id of gente) {
        if (excluidos.has(id)) continue;
        const fila = porPersona.get(id) ?? { proyectos: new Set<string>(), compartidos: new Set<number>() };
        fila.proyectos.add(p.tituloProyecto);
        comunes.forEach((c) => fila.compartidos.add(c));
        porPersona.set(id, fila);
      }
    }

    const ids = [...porPersona.keys()];
    if (ids.length === 0) return [];
    const personas = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: ids }, ...FILTRO_DIRECTORIO },
      select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true, perfil: { select: { carrera: { select: { nombreCarrera: true } } } } },
    });
    return personas
      .map((u) => {
        const fila = porPersona.get(u.idUsuario)!;
        return {
          idUsuario: u.idUsuario,
          nombre: u.nombre,
          apellido: u.apellido,
          fotoUrl: u.fotoUrl,
          carrera: u.perfil?.carrera?.nombreCarrera ?? null,
          proyectosParecidos: fila.proyectos.size,
          ejemploProyecto: [...fila.proyectos][0],
          interesesEnComun: fila.compartidos.size,
        };
      })
      .sort((a, b) => b.proyectosParecidos - a.proyectosParecidos || b.interesesEnComun - a.interesesEnComun || a.idUsuario - b.idUsuario)
      .slice(0, MAX_PERSONAS);
  }
}
