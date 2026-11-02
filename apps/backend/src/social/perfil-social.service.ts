import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoAmistad, EstadoProyecto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { HorasSemestreService } from '../horas-semestre/horas-semestre.service';
import { listarInsigniasUsuario } from '../insignias/insignias.service';
import { FILTRO_DIRECTORIO } from './social.service';

const ESTADOS_VISIBLES: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
  EstadoProyecto.CERRADO,
];
const ESTADOS_CON_CHAT: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
];
const LIMITE_ACTIVIDAD = 10;

export const MENSAJE_SIN_PROYECTO_COMPARTIDO = 'Para escribirse necesitan compartir un proyecto activo';

/** Organización pública o de la que quien mira es miembro activo (una privada no se revela a ajenos). */
const orgVisiblePara = (idVisor: number): Prisma.OrganizacionWhereInput => ({
  OR: [{ visibilidad: 'PUBLICA' }, { miembros: { some: { idUsuario: idVisor, estadoMembresia: 'ACTIVA' } } }],
});

/** Proyecto no ligado a una organización privada ajena a quien mira. */
const proyectoVisiblePara = (idVisor: number): Prisma.ProyectoWhereInput => ({
  eliminadoEn: null,
  estadoProyecto: { in: ESTADOS_VISIBLES },
  organizaciones: { every: { organizacion: orgVisiblePara(idVisor) } },
});

export type ActividadReciente = {
  tipo: 'PROYECTO' | 'INSIGNIA' | 'ORGANIZACION';
  fecha: string;
  titulo: string;
  detalle: string | null;
  idProyecto: number | null;
  idOrganizacion: number | null;
};

export interface CvProyecto {
  idProyecto: number;
  titulo: string;
  rol: string;
  inicio: string | null;
  fin: string | null;
  horasAcreditadas: number;
}

const dia = (f: Date | null) => (f ? f.toISOString().slice(0, 10) : null);

/** MEJ-26/27/28/63/64: lo que el perfil agrega al directorio social, siempre filtrado por quien mira. */
@Injectable()
export class PerfilSocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
    private readonly chat: ChatService,
  ) {}

  /** Perfil propio, o el de alguien que el directorio también muestra; si no, 404. */
  private async assertPerfilAccesible(idVisor: number, idObjetivo: number) {
    if (idVisor === idObjetivo) return;
    const visible = await this.prisma.usuario.findFirst({
      where: { idUsuario: idObjetivo, ...FILTRO_DIRECTORIO },
      select: { idUsuario: true },
    });
    if (!visible) throw new NotFoundException(`Usuario con id ${idObjetivo} no encontrado`);
  }

  /** MEJ-26: organizaciones, asociaciones de la carrera y horas acreditadas del semestre. */
  async resumen(idVisor: number, idObjetivo: number) {
    await this.assertPerfilAccesible(idVisor, idObjetivo);
    const [membresias, perfil, progreso, puedeMensaje] = await Promise.all([
      this.prisma.usuarioOrganizacion.findMany({
        where: { idUsuario: idObjetivo, estadoMembresia: 'ACTIVA', organizacion: orgVisiblePara(idVisor) },
        orderBy: { fechaIngreso: 'desc' },
        select: {
          rolOrganizacion: true,
          organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true, logoUrl: true } },
        },
      }),
      this.prisma.perfilEstudiante.findUnique({ where: { idUsuario: idObjetivo }, select: { idCarrera: true } }),
      this.horas.getProgreso(idObjetivo),
      this.puedeMensaje(idVisor, idObjetivo),
    ]);
    const asociaciones = perfil?.idCarrera
      ? await this.prisma.asociacion.findMany({
          where: { archivada: false, carreras: { some: { idCarrera: perfil.idCarrera } } },
          orderBy: { nombre: 'asc' },
          select: { idAsociacion: true, nombre: true, logoUrl: true },
        })
      : [];
    return {
      organizaciones: membresias.map((m) => ({ ...m.organizacion, rol: m.rolOrganizacion })),
      asociaciones,
      puedeMensaje,
      // Solo lo acreditado en UVGenius: metas y horas declaradas son privadas.
      horasSemestre: {
        anio: progreso.semestre.anio,
        periodo: progreso.semestre.periodo,
        becaAcreditadas: progreso.beca.acreditadas,
        extensionAcreditadas: progreso.extension.acreditadas,
      },
    };
  }

  /** MEJ-64: últimos movimientos públicos; proyectos y organizaciones privadas ajenas no aparecen. */
  async actividad(idVisor: number, idObjetivo: number): Promise<ActividadReciente[]> {
    await this.assertPerfilAccesible(idVisor, idObjetivo);
    const [participaciones, membresias, insignias] = await Promise.all([
      this.prisma.participacionProyecto.findMany({
        where: {
          idUsuario: idObjetivo,
          estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] },
          rolProyecto: { proyecto: proyectoVisiblePara(idVisor) },
        },
        orderBy: { fechaIngreso: 'desc' },
        take: LIMITE_ACTIVIDAD,
        select: {
          fechaIngreso: true,
          rolProyecto: { select: { nombreRol: true, proyecto: { select: { idProyecto: true, tituloProyecto: true } } } },
        },
      }),
      this.prisma.usuarioOrganizacion.findMany({
        where: { idUsuario: idObjetivo, estadoMembresia: 'ACTIVA', organizacion: orgVisiblePara(idVisor) },
        orderBy: { fechaIngreso: 'desc' },
        take: LIMITE_ACTIVIDAD,
        select: { fechaIngreso: true, organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true } } },
      }),
      listarInsigniasUsuario(this.prisma, idObjetivo, true),
    ]);
    const items: ActividadReciente[] = [
      ...participaciones.map((p) => ({
        tipo: 'PROYECTO' as const,
        fecha: p.fechaIngreso.toISOString(),
        titulo: p.rolProyecto.proyecto.tituloProyecto,
        detalle: p.rolProyecto.nombreRol,
        idProyecto: p.rolProyecto.proyecto.idProyecto,
        idOrganizacion: null,
      })),
      ...membresias.map((m) => ({
        tipo: 'ORGANIZACION' as const,
        fecha: m.fechaIngreso.toISOString(),
        titulo: m.organizacion.nombreOrganizacion,
        detalle: null,
        idProyecto: null,
        idOrganizacion: m.organizacion.idOrganizacion,
      })),
      ...insignias.flatMap((i) => {
        const fecha = Object.values(i.fechas).filter((f): f is string => f !== null).sort().pop();
        return fecha
          ? [{ tipo: 'INSIGNIA' as const, fecha, titulo: i.nombre, detalle: i.nivel, idProyecto: null, idOrganizacion: null }]
          : [];
      }),
    ];
    return items.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, LIMITE_ACTIVIDAD);
  }

  /** MEJ-27/63: proyectos cerrados de la persona con su rol, fechas y horas acreditadas. */
  async cv(idVisor: number, idObjetivo: number) {
    await this.assertPerfilAccesible(idVisor, idObjetivo);
    const cerrado = { ...proyectoVisiblePara(idVisor), estadoProyecto: EstadoProyecto.CERRADO };
    const [usuario, participaciones, liderados] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { idUsuario: idObjetivo },
        select: { nombre: true, apellido: true, perfil: { select: { carrera: { select: { nombreCarrera: true } } } } },
      }),
      this.prisma.participacionProyecto.findMany({
        where: {
          idUsuario: idObjetivo,
          estadoParticipacion: 'COMPLETADO',
          rolProyecto: { proyecto: cerrado },
        },
        select: {
          fechaIngreso: true,
          fechaSalida: true,
          rolProyecto: {
            select: {
              nombreRol: true,
              proyecto: { select: { idProyecto: true, tituloProyecto: true, fechaInicio: true, fechaFinEstimada: true } },
            },
          },
          registrosHoras: { where: { estadoHoras: 'APROBADA' }, select: { horasAprobadas: true } },
        },
      }),
      // El líder no tiene participación: su proyecto cerrado se lee de creadoPor.
      this.prisma.proyecto.findMany({
        where: { ...cerrado, creadoPor: idObjetivo },
        select: { idProyecto: true, tituloProyecto: true, fechaInicio: true, fechaFinEstimada: true },
      }),
    ]);
    if (!usuario) throw new NotFoundException(`Usuario con id ${idObjetivo} no encontrado`);
    const proyectos: CvProyecto[] = participaciones
      .map((p) => ({
        idProyecto: p.rolProyecto.proyecto.idProyecto,
        titulo: p.rolProyecto.proyecto.tituloProyecto,
        rol: p.rolProyecto.nombreRol,
        inicio: dia(p.fechaIngreso),
        fin: dia(p.fechaSalida ?? p.rolProyecto.proyecto.fechaFinEstimada),
        horasAcreditadas: p.registrosHoras.reduce((s, r) => s + Number(r.horasAprobadas ?? 0), 0),
      }))
      .concat(
        liderados.map((p) => ({
          idProyecto: p.idProyecto,
          titulo: p.tituloProyecto,
          rol: 'Líder del proyecto',
          inicio: dia(p.fechaInicio),
          fin: dia(p.fechaFinEstimada),
          horasAcreditadas: 0,
        })),
      )
      .sort((a, b) => (b.fin ?? '').localeCompare(a.fin ?? ''));
    return {
      nombre: `${usuario.nombre} ${usuario.apellido}`,
      carrera: usuario.perfil?.carrera?.nombreCarrera ?? null,
      proyectos,
      totalHorasAcreditadas: proyectos.reduce((s, p) => s + p.horasAcreditadas, 0),
    };
  }

  private async sonAmigos(a: number, b: number) {
    const amistad = await this.prisma.amistad.findFirst({
      where: {
        estado: EstadoAmistad.ACEPTADA,
        OR: [
          { idUsuarioSolicitante: a, idUsuarioReceptor: b },
          { idUsuarioSolicitante: b, idUsuarioReceptor: a },
        ],
      },
      select: { idAmistad: true },
    });
    return !!amistad;
  }

  /** Conversación individual ya abierta entre ambos, o un proyecto activo compartido donde crearla; null si no hay ninguno. */
  private async destinoMensaje(a: number, b: number) {
    const existente = await this.prisma.conversacion.findFirst({
      where: {
        tipo: 'INDIVIDUAL',
        eliminadaEn: null,
        proyecto: { eliminadoEn: null, estadoProyecto: { in: ESTADOS_CON_CHAT } },
        AND: [a, b].map((id) => ({ participantes: { some: { idUsuario: id } } })),
      },
      orderBy: { idConversacion: 'desc' },
      select: { idConversacion: true, idProyecto: true },
    });
    if (existente?.idProyecto) return { idConversacion: existente.idConversacion, idProyecto: existente.idProyecto };

    const participa = (id: number): Prisma.ProyectoWhereInput => ({
      OR: [{ creadoPor: id }, { roles: { some: { participaciones: { some: { idUsuario: id, estadoParticipacion: 'ACTIVO' } } } } }],
    });
    const compartido = await this.prisma.proyecto.findFirst({
      where: { eliminadoEn: null, estadoProyecto: { in: ESTADOS_CON_CHAT }, AND: [participa(a), participa(b)] },
      orderBy: { idProyecto: 'desc' },
      select: { idProyecto: true },
    });
    return compartido ? { idConversacion: null, idProyecto: compartido.idProyecto } : null;
  }

  /** El botón «Enviar mensaje» solo se ofrece cuando abrirMensajeDirecto va a funcionar. */
  private async puedeMensaje(idVisor: number, idObjetivo: number) {
    if (idVisor === idObjetivo || !(await this.sonAmigos(idVisor, idObjetivo))) return false;
    return !!(await this.destinoMensaje(idVisor, idObjetivo));
  }

  /**
   * MEJ-28: «Enviar mensaje» entre amigos aceptados. Reutiliza la conversación individual del chat de
   * proyecto: la que ya exista entre ambos o una nueva en un proyecto activo que compartan.
   */
  async abrirMensajeDirecto(idUsuario: number, idAmigo: number) {
    if (idUsuario === idAmigo) throw new ForbiddenException('No puedes escribirte a ti mismo');
    if (!(await this.sonAmigos(idUsuario, idAmigo))) throw new ForbiddenException('Solo puedes escribir a tus amigos');

    const destino = await this.destinoMensaje(idUsuario, idAmigo);
    if (!destino) throw new ConflictException(MENSAJE_SIN_PROYECTO_COMPARTIDO);
    if (destino.idConversacion) return { idConversacion: destino.idConversacion, idProyecto: destino.idProyecto };

    const conversacion = await this.chat.createConversation(destino.idProyecto, idUsuario, {
      tipo: 'INDIVIDUAL',
      idsParticipantes: [idAmigo],
    });
    return { idConversacion: conversacion.idConversacion, idProyecto: destino.idProyecto };
  }
}
