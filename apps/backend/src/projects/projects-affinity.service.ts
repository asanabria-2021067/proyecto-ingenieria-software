import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { PESOS_ORDEN_DISPONIBLES } from './projects.read-model';

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

  private scoreAfinidad(p: { amigosParticipantes: number; mismaCarrera: boolean }): number {
    return (
      p.amigosParticipantes * PESOS_ORDEN_DISPONIBLES.amigoParticipante +
      (p.mismaCarrera ? PESOS_ORDEN_DISPONIBLES.mismaCarrera : 0)
    );
  }
}
