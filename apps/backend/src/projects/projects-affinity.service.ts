import { Injectable, NotFoundException } from '@nestjs/common';
import { NivelHabilidad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { calcularCoincidencia, mejorCoincidencia, UMBRAL_COINCIDE } from '../common/coincidencia-habilidades';
import { ESTADOS_CON_DETALLE, PESOS_ORDEN_DISPONIBLES, conCuposDisponibles, proyectoListSelect } from './projects.read-model';

/** Cuántos proyectos abiertos recientes se comparan en «Para ti» (una sola consulta, sin N+1). */
const PARA_TI_VENTANA = 100;
/** Máximo de proyectos que devuelve «Para ti». */
const PARA_TI_MAXIMO = 20;
/** Cada interés compartido suma esto al orden, por debajo de un requisito de habilidad cumplido al 100 %. */
const PESO_INTERES = 10;

/** MEJ-93: cuántos proyectos parecidos se muestran y cuántos candidatos recientes se comparan. */
const SIMILARES_MAXIMO = 6;
const SIMILARES_VENTANA = 100;
/** MEJ-93: puntos por mismo tipo de horas y por carrera compartida; las habilidades suman su % de coincidencia (0-100). */
const PESO_SIMILAR_TIPO = 20;
const PESO_SIMILAR_CARRERA = 30;

/** Marca de guardado y orden por afinidad del listado de proyectos (extraído de ProjectsService). */
@Injectable()
export class ProjectsAffinityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
  ) {}

  /** Marca cada proyecto con `guardado` (bookmark del usuario actual). Sin sesión, siempre `false`. */
  async conGuardado<T extends { idProyecto: number }>(
    proyectos: T[],
    userId?: number,
  ): Promise<Array<T & { guardado: boolean }>> {
    if (!userId || proyectos.length === 0) {
      return proyectos.map((p) => ({ ...p, guardado: false }));
    }
    const guardados = await this.prisma.proyectoGuardado.findMany({
      where: { idUsuario: userId, idProyecto: { in: proyectos.map((p) => p.idProyecto) } },
      select: { idProyecto: true },
    });
    const guardadoIds = new Set(guardados.map((g) => g.idProyecto));
    return proyectos.map((p) => ({ ...p, guardado: guardadoIds.has(p.idProyecto) }));
  }

  /**
   * T-252: agrega `amigosParticipantes`/`mismaCarrera` a cada proyecto y
   * reordena por afinidad (ver `PESOS_ORDEN_DISPONIBLES`). El motivo textual
   * ("2 amigos participan", "De tu carrera") se arma en el FRONTEND a partir
   * de estos dos campos estructurados — acá nunca se manda texto armado.
   *
   * Dos consultas fijas además de la lista base (amigos del usuario + una
   * consulta agregada para TODOS los proyectos a la vez), nunca una por
   * proyecto: no escalan con la cantidad de proyectos mostrados.
   */
  async ordenarPorAfinidad<
    T extends { idProyecto: number },
  >(proyectos: T[], userId: number): Promise<Array<T & { amigosParticipantes: number; mismaCarrera: boolean }>> {
    const idsProyecto = proyectos.map((p) => p.idProyecto);

    // Ids de amigos: misma fuente de verdad que el resto del producto
    // (social-feed.service.ts ya la consume así), en vez de duplicar la
    // consulta de amistades acá.
    const [amigoIds, perfil] = await Promise.all([
      this.social.getAmigoIds(userId),
      this.prisma.perfilEstudiante.findUnique({
        where: { idUsuario: userId },
        select: { idCarrera: true },
      }),
    ]);
    const carreraId = perfil?.idCarrera ?? null;

    // Ni amigos ni carrera registrada: nada que ponderar. Se evita la
    // consulta agregada y se devuelve tal cual (orden por recencia de siempre).
    if (amigoIds.length === 0 && carreraId === null) {
      return proyectos.map((p) => ({ ...p, amigosParticipantes: 0, mismaCarrera: false }));
    }

    const amigoParticipaCondicion =
      amigoIds.length > 0 ? Prisma.sql`pp.id_usuario IN (${Prisma.join(amigoIds)})` : Prisma.sql`FALSE`;
    const liderEsAmigoCondicion =
      amigoIds.length > 0 ? Prisma.sql`p.creado_por IN (${Prisma.join(amigoIds)})` : Prisma.sql`FALSE`;

    // UNA sola consulta agregada para TODOS los proyectos listados (no una
    // por proyecto): cuenta, por proyecto, cuántos de los amigos del usuario
    // participan ACTIVOS en cualquiera de sus roles, y si algún rol pide la
    // carrera del usuario. El líder de un proyecto NO tiene fila en
    // `participacion_proyecto` (schema.prisma: "no existe una
    // ParticipacionProyecto equivalente para el líder"), así que se cuenta
    // aparte en la segunda rama del UNION cuando también es amigo — mismo
    // criterio que ya usa `social-feed.service.ts`.
    const filas = await this.prisma.$queryRaw<
      { idProyecto: number; amigosParticipantes: number; mismaCarrera: boolean }[]
    >(Prisma.sql`
      SELECT
        x."idProyecto",
        COUNT(DISTINCT x."idUsuarioAmigo")::int AS "amigosParticipantes",
        COALESCE(BOOL_OR(x."mismaCarrera"), FALSE) AS "mismaCarrera"
      FROM (
        SELECT
          rp.id_proyecto AS "idProyecto",
          pp.id_usuario AS "idUsuarioAmigo",
          (rp.id_carrera_requerida = ${carreraId}) AS "mismaCarrera"
        FROM rol_proyecto rp
        LEFT JOIN participacion_proyecto pp
          ON pp.id_rol_proyecto = rp.id_rol_proyecto
          AND pp.estado_participacion = 'ACTIVO'
          AND ${amigoParticipaCondicion}
        WHERE rp.id_proyecto IN (${Prisma.join(idsProyecto)})

        UNION ALL

        SELECT
          p.id_proyecto AS "idProyecto",
          CASE WHEN ${liderEsAmigoCondicion} THEN p.creado_por END AS "idUsuarioAmigo",
          NULL::boolean AS "mismaCarrera"
        FROM proyecto p
        WHERE p.id_proyecto IN (${Prisma.join(idsProyecto)})
      ) x
      GROUP BY x."idProyecto"
    `);
    const afinidadPorProyecto = new Map(filas.map((f) => [f.idProyecto, f]));

    const enriquecidos = proyectos.map((p) => {
      const fila = afinidadPorProyecto.get(p.idProyecto);
      return {
        ...p,
        amigosParticipantes: fila?.amigosParticipantes ?? 0,
        mismaCarrera: fila?.mismaCarrera ?? false,
      };
    });

    // `proyectos` ya viene ordenado por recencia; Array.sort es estable, así
    // que a igual score se conserva ese orden (la recencia como base, T-251).
    return enriquecidos.sort((a, b) => this.scoreAfinidad(b) - this.scoreAfinidad(a));
  }

  /**
   * MEJ-15: «Para ti». Proyectos abiertos con cupo, ordenados por la coincidencia entre tus
   * habilidades y los requisitos de su mejor rol, más los intereses que compartes con el
   * proyecto. Solo entran los que coinciden en algo; no incluye los propios ni aquellos donde
   * ya participas. `condiciones` son los mismos filtros del catálogo (estado visible, dueño…).
   */
  async paraTi(userId: number, condiciones: Prisma.ProyectoWhereInput[]) {
    const [habilidadesUsuario, interesesUsuario, proyectos] = await Promise.all([
      this.prisma.usuarioHabilidad.findMany({ where: { idUsuario: userId }, select: { idHabilidad: true, nivelHabilidad: true } }),
      this.prisma.usuarioInteres.findMany({ where: { idUsuario: userId }, select: { idInteres: true } }),
      this.prisma.proyecto.findMany({
        where: {
          AND: [
            ...condiciones,
            { creadoPor: { not: userId } },
            { roles: { none: { participaciones: { some: { idUsuario: userId, estadoParticipacion: 'ACTIVO' } } } } },
          ],
        },
        select: {
          ...proyectoListSelect,
          intereses: { select: { idInteres: true, interes: { select: { nombreInteres: true } } } },
          roles: {
            select: {
              cupos: true,
              requisitos: { select: { idHabilidad: true, nivelMinimo: true, obligatorio: true } },
              _count: { select: { participaciones: { where: { estadoParticipacion: 'ACTIVO' } } } },
            },
          },
        },
        orderBy: { fechaCreacion: 'desc' },
        take: PARA_TI_VENTANA,
      }),
    ]);
    const habilidades = new Map(habilidadesUsuario.map((h) => [h.idHabilidad, h.nivelHabilidad]));
    const intereses = new Set(interesesUsuario.map((i) => i.idInteres));

    const puntuados = proyectos
      .map((p) => {
        const abiertos = p.roles.filter((r) => r.cupos - r._count.participaciones > 0);
        if (abiertos.length === 0) return null;
        const mejor = mejorCoincidencia(abiertos.map((r) => calcularCoincidencia(r.requisitos, habilidades)));
        const interesesCompartidos = p.intereses.filter((i) => intereses.has(i.idInteres)).length;
        const porcentaje = mejor?.porcentaje ?? 0;
        if (porcentaje === 0 && interesesCompartidos === 0) return null;
        return {
          proyecto: p,
          puntaje: porcentaje + interesesCompartidos * PESO_INTERES,
          coincidencia: { porcentaje, interesesCompartidos, coincideHabilidades: porcentaje >= UMBRAL_COINCIDE },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      // Estable: a igual puntaje se conserva la recencia de la consulta.
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, PARA_TI_MAXIMO);

    const conCupos = puntuados.map((x) => ({
      ...conCuposDisponibles({ ...x.proyecto, intereses: x.proyecto.intereses.map(({ interes }) => ({ interes })) }),
      coincidencia: x.coincidencia,
    }));
    return this.conGuardado(conCupos, userId);
  }

  /**
   * MEJ-93: «Proyectos parecidos». Puntúa cada candidato por tipo de horas, carrera de sus roles y
   * habilidades que piden sus roles (reutiliza `calcularCoincidencia`: las habilidades del proyecto
   * base hacen de «persona»). `condiciones` son las del catálogo, o sea solo lo que cualquiera
   * puede ver en Explorar; el proyecto base se excluye. 404 si el base no es visible.
   */
  async similares(idProyecto: number, userId: number, condiciones: Prisma.ProyectoWhereInput[]) {
    const base = await this.prisma.proyecto.findFirst({
      where: { idProyecto, estadoProyecto: { in: ESTADOS_CON_DETALLE }, eliminadoEn: null },
      select: {
        tipoProyecto: true,
        roles: { select: { idCarreraRequerida: true, requisitos: { select: { idHabilidad: true } } } },
      },
    });
    if (!base) throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);

    const carreras = new Set(base.roles.flatMap((r) => (r.idCarreraRequerida === null ? [] : [r.idCarreraRequerida])));
    const habilidades = new Map<number, NivelHabilidad>(
      base.roles.flatMap((r) => r.requisitos.map((q): [number, NivelHabilidad] => [q.idHabilidad, 'AVANZADO'])),
    );
    const candidatos = await this.prisma.proyecto.findMany({
      where: { AND: [...condiciones, { idProyecto: { not: idProyecto } }] },
      select: {
        ...proyectoListSelect,
        roles: {
          select: {
            cupos: true,
            idCarreraRequerida: true,
            requisitos: { select: { idHabilidad: true, nivelMinimo: true, obligatorio: true } },
            _count: { select: { participaciones: { where: { estadoParticipacion: 'ACTIVO' } } } },
          },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: SIMILARES_VENTANA,
    });

    const puntuados = candidatos
      .map((p) => {
        const mismoTipo = p.tipoProyecto === base.tipoProyecto;
        const mismaCarrera = p.roles.some((r) => r.idCarreraRequerida !== null && carreras.has(r.idCarreraRequerida));
        const habilidadesPorcentaje =
          mejorCoincidencia(p.roles.map((r) => calcularCoincidencia(r.requisitos, habilidades)))?.porcentaje ?? 0;
        const puntaje =
          (mismoTipo ? PESO_SIMILAR_TIPO : 0) + (mismaCarrera ? PESO_SIMILAR_CARRERA : 0) + habilidadesPorcentaje;
        return { puntaje, proyecto: p, similitud: { mismoTipo, mismaCarrera, habilidadesPorcentaje } };
      })
      .filter((x) => x.puntaje > 0)
      // Estable: a igual puntaje se conserva la recencia de la consulta.
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, SIMILARES_MAXIMO);

    const conCupos = puntuados.map((x) => ({ ...conCuposDisponibles(x.proyecto), similitud: x.similitud }));
    return this.conGuardado(conCupos, userId);
  }

  private scoreAfinidad(p: { amigosParticipantes: number; mismaCarrera: boolean }): number {
    return (
      p.amigosParticipantes * PESOS_ORDEN_DISPONIBLES.amigoParticipante +
      (p.mismaCarrera ? PESOS_ORDEN_DISPONIBLES.mismaCarrera : 0)
    );
  }
}
