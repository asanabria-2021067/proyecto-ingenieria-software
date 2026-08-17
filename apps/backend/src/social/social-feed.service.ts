import { Injectable } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from './social.service';

const ESTADOS_VISIBLES: EstadoProyecto[] = [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO];
const MAX_PROYECTOS_POR_SECCION = 10;
const MAX_AMIGOS_POR_PROYECTO = 3;

const PROYECTO_FEED_SELECT = {
  idProyecto: true,
  tituloProyecto: true,
  estadoProyecto: true,
  fechaCreacion: true,
  creadoPor: true,
  creador: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } },
  roles: {
    select: {
      participaciones: {
        where: { estadoParticipacion: EstadoParticipacion.ACTIVO },
        select: { idUsuario: true, usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } },
      },
    },
  },
} as const;

@Injectable()
export class SocialFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
  ) {}

  async getFeed(idUsuario: number) {
    const nombrePerfil = await this.getNombrePerfil(idUsuario);

    if (nombrePerfil === 'administrador') {
      return { proyectosDeAmigos: [], proyectosDeSeguidos: [] };
    }

    const excluirPropios = nombrePerfil === 'lider_asociacion';
    const [amigoIds, seguidoIds] = await Promise.all([
      this.social.getAmigoIds(idUsuario),
      this.social.getSeguidoIds(idUsuario),
    ]);

    const proyectosDeAmigos = await this.buildSeccion(idUsuario, amigoIds, excluirPropios, []);
    const proyectosDeSeguidos = await this.buildSeccion(
      idUsuario,
      seguidoIds,
      excluirPropios,
      proyectosDeAmigos.map((p) => p.idProyecto),
    );

    return { proyectosDeAmigos, proyectosDeSeguidos };
  }

  private async getNombrePerfil(idUsuario: number): Promise<string> {
    const roles = await this.prisma.usuarioRolAcceso.findMany({
      where: { idUsuario },
      select: { rolAcceso: { select: { nombrePerfil: true } } },
    });
    const nombres = roles.map((r) => r.rolAcceso.nombrePerfil);
    if (nombres.includes('administrador')) return 'administrador';
    if (nombres.includes('lider_asociacion')) return 'lider_asociacion';
    return 'estudiante';
  }

  private async buildSeccion(
    idUsuario: number,
    personIds: number[],
    excluirPropios: boolean,
    excluirProyectoIds: number[],
  ) {
    if (personIds.length === 0) return [];

    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        estadoProyecto: { in: ESTADOS_VISIBLES },
        idProyecto: { notIn: excluirProyectoIds },
        ...(excluirPropios ? { creadoPor: { not: idUsuario } } : {}),
        OR: [
          { creadoPor: { in: personIds } },
          { roles: { some: { participaciones: { some: { idUsuario: { in: personIds }, estadoParticipacion: EstadoParticipacion.ACTIVO } } } } },
        ],
      },
      orderBy: { fechaCreacion: 'desc' },
      take: MAX_PROYECTOS_POR_SECCION,
      select: PROYECTO_FEED_SELECT,
    });

    const personIdsSet = new Set(personIds);

    return proyectos.map((proyecto) => {
      const participantes = proyecto.roles.flatMap((rol) => rol.participaciones.map((p) => p.usuario));
      const candidatos = personIdsSet.has(proyecto.creadoPor) ? [proyecto.creador, ...participantes] : participantes;

      const amigosVistos = new Map<number, (typeof candidatos)[number]>();
      for (const candidato of candidatos) {
        if (!amigosVistos.has(candidato.idUsuario)) {
          amigosVistos.set(candidato.idUsuario, candidato);
        }
      }

      return {
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        estadoProyecto: proyecto.estadoProyecto,
        amigosParticipantes: Array.from(amigosVistos.values()).slice(0, MAX_AMIGOS_POR_PROYECTO),
      };
    });
  }
}
