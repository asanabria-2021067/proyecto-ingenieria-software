import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserNameSearchService } from '../common/search/user-name-search.service';

export const GLOBAL_SEARCH_LIMIT = 5;

export interface GlobalSearchGroup<T> {
  items: T[];
  hasMore: boolean;
}

export interface ProyectoResultadoBusqueda {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  modalidadProyecto: string;
}

export interface PersonaResultadoBusqueda {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  carrera: string | null;
}

export interface TareaResultadoBusqueda {
  idTarea: number;
  tituloTarea: string;
  idProyecto: number;
  tituloProyecto: string;
  estadoTarea: string;
}

export interface GlobalSearchResult {
  proyectos: GlobalSearchGroup<ProyectoResultadoBusqueda>;
  personas: GlobalSearchGroup<PersonaResultadoBusqueda>;
  tareas: GlobalSearchGroup<TareaResultadoBusqueda>;
}

const ESTADOS_PROYECTO_VISIBLES: EstadoProyecto[] = [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO];

function truncar<T>(filas: T[], limite: number): GlobalSearchGroup<T> {
  const hasMore = filas.length > limite;
  return { items: hasMore ? filas.slice(0, limite) : filas, hasMore };
}

/** Escapa los comodines de LIKE (%, _, \) — mismo criterio que UserNameSearchService. */
function likePattern(texto: string): string {
  const escapado = texto.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escapado}%`;
}

@Injectable()
export class GlobalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userNameSearch: UserNameSearchService,
  ) {}

  async buscarProyectos(q: string): Promise<GlobalSearchGroup<ProyectoResultadoBusqueda>> {
    const patron = likePattern(q);
    const filas = await this.prisma.$queryRaw<{ id_proyecto: number }[]>(Prisma.sql`
      SELECT id_proyecto FROM proyecto
      WHERE eliminado_en IS NULL
        AND immutable_unaccent(lower(titulo_proyecto)) LIKE immutable_unaccent(lower(${patron})) ESCAPE '\\'
    `);
    const ids = filas.map((f) => f.id_proyecto);

    const proyectos = await this.prisma.proyecto.findMany({
      where: { idProyecto: { in: ids }, estadoProyecto: { in: ESTADOS_PROYECTO_VISIBLES }, eliminadoEn: null },
      select: { idProyecto: true, tituloProyecto: true, tipoProyecto: true, modalidadProyecto: true },
      orderBy: { fechaCreacion: 'desc' },
      take: GLOBAL_SEARCH_LIMIT + 1,
    });

    return truncar(proyectos, GLOBAL_SEARCH_LIMIT);
  }

  async buscarPersonas(q: string): Promise<GlobalSearchGroup<PersonaResultadoBusqueda>> {
    const ids = await this.userNameSearch.findMatchingUserIds(q);

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        idUsuario: { in: ids },
        // Mismo criterio que el directorio de SocialService.buscarUsuarios:
        // los administradores no aparecen como resultado de búsqueda.
        rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } },
      },
      select: {
        idUsuario: true,
        nombre: true,
        apellido: true,
        fotoUrl: true,
        perfil: { select: { carrera: { select: { nombreCarrera: true } } } },
      },
      orderBy: { idUsuario: 'asc' },
      take: GLOBAL_SEARCH_LIMIT + 1,
    });

    const personas = usuarios.map((u) => ({
      idUsuario: u.idUsuario,
      nombre: u.nombre,
      apellido: u.apellido,
      fotoUrl: u.fotoUrl,
      carrera: u.perfil?.carrera?.nombreCarrera ?? null,
    }));

    return truncar(personas, GLOBAL_SEARCH_LIMIT);
  }

  async buscarTareas(q: string, userId: number): Promise<GlobalSearchGroup<TareaResultadoBusqueda>> {
    const patron = likePattern(q);
    const filas = await this.prisma.$queryRaw<{ id_tarea: number }[]>(Prisma.sql`
      SELECT id_tarea FROM tarea
      WHERE eliminado_en IS NULL
        AND immutable_unaccent(lower(titulo_tarea)) LIKE immutable_unaccent(lower(${patron})) ESCAPE '\\'
    `);
    const ids = filas.map((f) => f.id_tarea);

    const tareas = await this.prisma.tarea.findMany({
      where: {
        idTarea: { in: ids },
        eliminadoEn: null,
        // Solo tareas de proyectos donde el usuario es lider o participante
        // activo — nunca de todos los proyectos (T-270). CANCELADO se excluye
        // aparte: ProjectReadPolicyService le niega la lectura a todo el que
        // no sea LIDER/ADMIN incluso siendo participante activo, así que
        // mostrar sus tareas aquí llevaría a un enlace que 403ea al abrirlo.
        proyecto: {
          eliminadoEn: null,
          estadoProyecto: { not: EstadoProyecto.CANCELADO },
          OR: [
            { creadoPor: userId },
            {
              roles: {
                some: {
                  participaciones: {
                    some: { idUsuario: userId, estadoParticipacion: EstadoParticipacion.ACTIVO },
                  },
                },
              },
            },
          ],
        },
      },
      select: {
        idTarea: true,
        tituloTarea: true,
        idProyecto: true,
        estadoTarea: true,
        proyecto: { select: { tituloProyecto: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: GLOBAL_SEARCH_LIMIT + 1,
    });

    const items = tareas.map((t) => ({
      idTarea: t.idTarea,
      tituloTarea: t.tituloTarea,
      idProyecto: t.idProyecto,
      tituloProyecto: t.proyecto.tituloProyecto,
      estadoTarea: t.estadoTarea,
    }));

    return truncar(items, GLOBAL_SEARCH_LIMIT);
  }

  async buscar(userId: number, qRaw: string | undefined): Promise<GlobalSearchResult> {
    const q = (qRaw ?? '').trim();
    if (q.length === 0) {
      const vacio = { items: [], hasMore: false };
      return { proyectos: vacio, personas: vacio, tareas: vacio };
    }
    // Mismo mínimo que SocialService.buscarUsuarios: un solo carácter
    // hace fan-out contra toda la tabla sin acotar nada útil.
    if (q.length < 2) {
      throw new BadRequestException('La búsqueda requiere al menos 2 caracteres');
    }

    const [proyectos, personas, tareas] = await Promise.all([
      this.buscarProyectos(q),
      this.buscarPersonas(q),
      this.buscarTareas(q, userId),
    ]);

    return { proyectos, personas, tareas };
  }
}
