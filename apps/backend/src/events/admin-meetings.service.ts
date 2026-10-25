import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoliticaEdicionReunion, Prisma, TipoEvento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsService,
  type PostCommitEffect,
  type PostCommitEffectSink,
} from '../notifications/notifications.service';
import { GUATEMALA_TIME_ZONE } from '../common/utils/guatemala-date';
import { cargarProyectosParaReunion, motivoNoElegible, type ProyectoParaReunion } from './admin-meeting-eligibility';
import { administradoresActivos, cargarGestion, type MotivoGestion } from './admin-meeting-access';
import { equiposDeProyectos, proyectoDeCadaUsuario, unionDeEquipos } from './admin-meeting-team';
import { CreateAdminMeetingDto } from './dto/create-admin-meeting.dto';

type Tx = Prisma.TransactionClient;

/**
 * Campos de calendario de una reunión. Viven en cada EventoProyecto proyectado
 * (uno por proyecto), escritos idénticos en una sola transacción; el padre
 * ReunionAdministracion no los duplica.
 */
const CONTENIDO_SELECT = {
  tituloEvento: true,
  descripcionEvento: true,
  fechaInicio: true,
  fechaFin: true,
  antelacionMinutos: true,
  modalidad: true,
  ubicacionLat: true,
  ubicacionLng: true,
  ubicacionNombre: true,
  linkSesion: true,
} as const satisfies Prisma.EventoProyectoSelect;

export type ContenidoReunion = Prisma.EventoProyectoGetPayload<{ select: typeof CONTENIDO_SELECT }>;
const CAMPOS_CONTENIDO = Object.keys(CONTENIDO_SELECT) as (keyof ContenidoReunion)[];

const PROYECCION_SELECT = {
  idEvento: true,
  idProyecto: true,
  ...CONTENIDO_SELECT,
  proyecto: { select: { tituloProyecto: true, estadoProyecto: true } },
} as const satisfies Prisma.EventoProyectoSelect;

type Proyeccion = Prisma.EventoProyectoGetPayload<{ select: typeof PROYECCION_SELECT }>;

/** Datos públicos de una persona en las respuestas de Administración: nunca correo ni datos de cuenta. */
const PERSONA_SELECT = { idUsuario: true, nombre: true, apellido: true } as const;

const fechaTexto = (instante: Date) =>
  instante.toLocaleString('es-GT', { dateStyle: 'long', timeStyle: 'short', timeZone: GUATEMALA_TIME_ZONE });

const mismoValor = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/**
 * Contenido único de las proyecciones. Si alguna difiere (no debería: solo
 * este servicio las escribe y siempre todas juntas) no se elige una fila
 * arbitraria: se informa la inconsistencia y el contenido queda en null.
 */
export function contenidoCanonico(proyecciones: ContenidoReunion[]): {
  contenido: ContenidoReunion | null;
  integridad: 'OK' | 'INCONSISTENTE' | 'SIN_PROYECCIONES';
} {
  if (proyecciones.length === 0) return { contenido: null, integridad: 'SIN_PROYECCIONES' };
  const [primera, ...resto] = proyecciones;
  const iguales = resto.every((p) => CAMPOS_CONTENIDO.every((campo) => mismoValor(p[campo], primera[campo])));
  if (!iguales) return { contenido: null, integridad: 'INCONSISTENTE' };
  return { contenido: Object.fromEntries(CAMPOS_CONTENIDO.map((c) => [c, primera[c]])) as ContenidoReunion, integridad: 'OK' };
}

/**
 * HU-195 (T-362/T-364): reuniones de Administración con uno o varios
 * proyectos. Cada escritura es una transacción: el padre, las proyecciones,
 * los avisos (con clave de idempotencia) y la bitácora se confirman juntos, y
 * el socket solo se publica después del commit; un rollback no deja avisos.
 */
@Injectable()
export class AdminMeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actorId: number, dto: CreateAdminMeetingDto) {
    const contenido: ContenidoReunion = {
      tituloEvento: dto.tituloEvento,
      descripcionEvento: dto.descripcionEvento ?? null,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
      antelacionMinutos: dto.antelacionMinutos ?? 60,
      modalidad: dto.modalidad,
      ubicacionLat: dto.ubicacionLat ?? null,
      ubicacionLng: dto.ubicacionLng ?? null,
      ubicacionNombre: dto.ubicacionNombre ?? null,
      linkSesion: dto.linkSesion ?? null,
    };
    const ahora = new Date();
    this.validarContenido(contenido, ahora);
    const politica = dto.politicaEdicion ?? PoliticaEdicionReunion.TODOS_ADMINISTRADORES;
    const editores = this.normalizarEditores(politica, dto.editores, actorId);

    const effects: PostCommitEffect[] = [];
    const sink: PostCommitEffectSink = { add: (effect) => effects.push(effect) };
    const idReunion = await this.prisma.$transaction(async (tx) => {
      await this.assertEditoresAdministradores(tx, editores);
      const proyectos = await this.proyectosConvocables(tx, dto.proyectos, contenido, ahora);

      const reunion = await tx.reunionAdministracion.create({
        data: { idCreador: actorId, politicaEdicion: politica, editores: { create: editores.map((idUsuario) => ({ idUsuario })) } },
        select: { idReunion: true, version: true },
      });
      await tx.eventoProyecto.createMany({
        data: dto.proyectos.map((idProyecto) => ({
          ...contenido,
          idProyecto,
          idCreador: actorId,
          idReunion: reunion.idReunion,
          tipoEvento: TipoEvento.REUNION,
        })),
      });

      const proyecciones = await this.proyeccionesActivas(tx, reunion.idReunion);
      const equipos = await equiposDeProyectos(tx, [...proyectos.values()]);
      await this.avisarEquipo(tx, 'REUNION_PROGRAMADA', reunion.idReunion, contenido, proyecciones, equipos, [...unionDeEquipos(equipos)], `reunion:${reunion.idReunion}:v${reunion.version}:programada`, sink);
      await this.auditar(tx, actorId, reunion.idReunion, 'REUNION_ADMIN_CREADA', 'POLITICA', {
        proyectos: dto.proyectos,
        politicaEdicion: politica,
        editores,
      });
      return reunion.idReunion;
    });
    await this.notifications.publishEffects(effects);
    return this.detalle(idReunion, actorId);
  }

  /** Detalle para Administración: contenido canónico, proyectos, permisos y si quien consulta la gestiona. */
  async detalle(idReunion: number, actorId: number) {
    const reunion = await this.prisma.reunionAdministracion.findUnique({
      where: { idReunion },
      select: {
        idReunion: true,
        idCreador: true,
        politicaEdicion: true,
        version: true,
        creadaEn: true,
        actualizadaEn: true,
        canceladaEn: true,
        creador: { select: PERSONA_SELECT },
        editores: { select: { usuario: { select: PERSONA_SELECT } }, orderBy: { idUsuario: 'asc' } },
      },
    });
    if (!reunion) throw new NotFoundException(`Reunión ${idReunion} no encontrada`);

    const proyecciones = await this.proyeccionesVigentes(this.prisma, reunion);
    const { contenido, integridad } = contenidoCanonico(proyecciones);
    const editores = reunion.editores.map((e) => e.usuario);
    const { gestion, puedeCambiarPolitica } = await cargarGestion(
      this.prisma,
      { idCreador: reunion.idCreador, politicaEdicion: reunion.politicaEdicion, editores: editores.map((e) => e.idUsuario) },
      actorId,
    );
    return {
      idReunion: reunion.idReunion,
      version: reunion.version,
      estado: reunion.canceladaEn ? 'CANCELADA' : contenido && contenido.fechaFin.getTime() < Date.now() ? 'PASADA' : 'ACTIVA',
      integridad,
      contenido,
      proyectos: proyecciones.map((p) => ({
        idProyecto: p.idProyecto,
        idEvento: p.idEvento,
        tituloProyecto: p.proyecto.tituloProyecto,
        estadoProyecto: p.proyecto.estadoProyecto,
      })),
      creador: reunion.creador,
      politicaEdicion: reunion.politicaEdicion,
      editores,
      creadaEn: reunion.creadaEn,
      actualizadaEn: reunion.actualizadaEn,
      canceladaEn: reunion.canceladaEn,
      canManage: gestion.puede,
      motivoGestion: gestion.puede ? gestion.motivo : null,
      puedeCambiarPolitica,
    };
  }

  // -------------------------------------------------------------------------
  // Reglas compartidas por crear, editar y cancelar.
  // -------------------------------------------------------------------------

  private validarContenido(contenido: ContenidoReunion, ahora: Date, fechaInicioCambia = true): void {
    if (contenido.fechaFin.getTime() <= contenido.fechaInicio.getTime()) {
      throw new BadRequestException('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio');
    }
    if (fechaInicioCambia && contenido.fechaInicio.getTime() < ahora.getTime()) {
      throw new BadRequestException('La fecha y hora de inicio no puede ser anterior al momento actual');
    }
    const { modalidad } = contenido;
    if ((modalidad === 'PRESENCIAL' || modalidad === 'MIXTA') && (contenido.ubicacionLat === null || contenido.ubicacionLng === null)) {
      throw new BadRequestException('Una reunión presencial o híbrida necesita su ubicación en el mapa');
    }
    if ((modalidad === 'VIRTUAL' || modalidad === 'MIXTA') && contenido.linkSesion === null) {
      throw new BadRequestException('Una reunión virtual o híbrida necesita el enlace de la sesión');
    }
  }

  /** Editores solo con ADMINISTRADORES_SELECCIONADOS; el creador ya gestiona, así que no se guarda como editor. */
  private normalizarEditores(politica: PoliticaEdicionReunion, editores: number[] | undefined, idCreador: number): number[] {
    const lista = [...new Set(editores ?? [])].filter((id) => id !== idCreador);
    if (politica !== PoliticaEdicionReunion.ADMINISTRADORES_SELECCIONADOS && lista.length > 0) {
      throw new BadRequestException('Los editores solo se indican con la política ADMINISTRADORES_SELECCIONADOS');
    }
    return lista;
  }

  private async assertEditoresAdministradores(tx: Tx, editores: number[]): Promise<void> {
    const autorizados = await administradoresActivos(tx, editores);
    const invalidos = editores.filter((id) => !autorizados.has(id));
    if (invalidos.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Los editores deben ser administradores con cuenta activa',
        editores: invalidos,
      });
    }
  }

  /**
   * Proyectos de una convocatoria NUEVA (crear o añadir): existen, están en
   * estado elegible y, si están cerrados, la creación, el inicio y el fin caen
   * en su ventana de dos meses. Si uno falla, falla todo, con el motivo por proyecto.
   */
  private async proyectosConvocables(
    tx: Tx,
    ids: number[],
    rango: { fechaInicio: Date; fechaFin: Date },
    ahora: Date,
  ): Promise<Map<number, ProyectoParaReunion>> {
    const proyectos = await cargarProyectosParaReunion(tx, ids);
    const rechazados = ids
      .map((idProyecto) => {
        const proyecto = proyectos.get(idProyecto);
        return { idProyecto, motivo: proyecto ? motivoNoElegible(proyecto, rango, ahora) : 'PROYECTO_INEXISTENTE' };
      })
      .filter((r) => r.motivo !== null);
    if (rechazados.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Hay proyectos que no se pueden convocar a esta reunión',
        proyectos: rechazados,
      });
    }
    return proyectos;
  }

  private proyeccionesActivas(db: Tx, idReunion: number): Promise<Proyeccion[]> {
    return db.eventoProyecto.findMany({
      where: { idReunion, eliminadoEn: null },
      select: PROYECCION_SELECT,
      orderBy: { idProyecto: 'asc' },
    });
  }

  /** Activas, o en una reunión cancelada las que se cancelaron con ella (mismo instante). */
  private proyeccionesVigentes(db: Tx, reunion: { idReunion: number; canceladaEn: Date | null }): Promise<Proyeccion[]> {
    if (!reunion.canceladaEn) return this.proyeccionesActivas(db, reunion.idReunion);
    return db.eventoProyecto.findMany({
      where: { idReunion: reunion.idReunion, eliminadoEn: reunion.canceladaEn },
      select: PROYECCION_SELECT,
      orderBy: { idProyecto: 'asc' },
    });
  }

  /**
   * Aviso de convocatoria o de cambio a `usuarios`: cada uno lo recibe una vez,
   * enlazado a la proyección de SU proyecto (la primera en la que está), sin
   * nombrar otros proyectos de la reunión.
   */
  private async avisarEquipo(
    tx: Tx,
    tipo: 'REUNION_PROGRAMADA' | 'REUNION_ACTUALIZADA',
    idReunion: number,
    contenido: ContenidoReunion,
    proyecciones: Proyeccion[],
    equipos: Map<number, number[]>,
    usuarios: number[],
    claveIdempotencia: string,
    sink: PostCommitEffectSink,
  ): Promise<void> {
    const destinatarios = new Set(usuarios);
    const asignado = proyectoDeCadaUsuario(equipos, proyecciones.map((p) => p.idProyecto));
    for (const proyeccion of proyecciones) {
      const ids = [...destinatarios].filter((id) => asignado.get(id) === proyeccion.idProyecto);
      if (ids.length === 0) continue;
      await this.notifications.persistTemplateTx(tx, ids, tipo, {
        meetingId: idReunion,
        eventId: proyeccion.idEvento,
        projectId: proyeccion.idProyecto,
        projectTitle: proyeccion.proyecto.tituloProyecto,
        eventTitle: contenido.tituloEvento,
        fechaInicioTexto: fechaTexto(contenido.fechaInicio),
        fechaInicioIso: contenido.fechaInicio.toISOString(),
      }, sink, { claveIdempotencia });
    }
  }

  /** Bitácora funcional en la misma transacción: si la operación revierte, el registro también. */
  private async auditar(
    tx: Tx,
    actorId: number,
    idReunion: number,
    accion: string,
    motivo: MotivoGestion,
    detalle: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.bitacoraAuditoria.create({
      data: {
        idUsuario: actorId,
        accion,
        tipoObjeto: 'REUNION_ADMINISTRACION',
        idObjeto: String(idReunion),
        detalleJson: { ...detalle, motivoGestion: motivo },
      },
    });
  }
}
