import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';
import { ApplicationCreatedEvent } from '../notifications/events/application-created.event';
import { EstadoProyecto, MotivoRechazoPostulacion, Prisma, TipoEventoPostulacion, TipoNotificacion } from '@prisma/client';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { ChatCanalesService } from '../chat/chat-canales.service';
import { AdminMeetingsService } from '../events/admin-meetings.service';
import { BienvenidaService } from './bienvenida.service';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';
import { MAX_RESPUESTA_CORTA, MAX_RESPUESTA_LARGA } from './dto/pregunta-rol.dto';

/** MEJ-99: texto de cada motivo en el aviso al postulante. */
const TEXTO_MOTIVO: Record<MotivoRechazoPostulacion, string> = {
  PERFIL_NO_COINCIDE: 'Tu perfil no coincide con lo que busca el rol',
  CUPO_LLENO: 'El cupo del rol ya está lleno',
  HORARIO: 'El horario no es compatible',
  OTRO: 'Otro motivo',
};

/**
 * C043 (06 v2 §23/§32): crear, resolver y retirar una postulación corren en
 * el runner por proyecto con la familia `POSTULACION`. Cupo, duplicado y el
 * CAS de `PENDIENTE` se evalúan dentro del lock, y la activación de la
 * participación ocurre en esa misma transacción, de modo que resolver nunca
 * deja una aceptación sin integrante ni duplica una participación previa.
 * Resolver no convierte al administrador en operador del equipo: sigue
 * exigiéndose el líder del proyecto. El auto-rechazo por cierre no vive aquí.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly chatCanales?: ChatCanalesService,
    // HU-195: convocatoria a las reuniones de Administración futuras del proyecto al que entra.
    private readonly adminMeetings?: AdminMeetingsService,
    // MEJ-102: bienvenida del lider en #general.
    private readonly bienvenida?: BienvenidaService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /** MEJ-100: un paso por tipo y postulación; registrarlo otra vez no hace nada (índice único). */
  private registrarEvento(db: Prisma.TransactionClient | PrismaService, idPostulacion: number, tipo: TipoEventoPostulacion) {
    return db.eventoPostulacion.createMany({ data: [{ idPostulacion, tipo }], skipDuplicates: true });
  }

  /**
   * MEJ-97: valida las respuestas contra las preguntas VIGENTES del rol (obligatorias respondidas,
   * límite por tipo, sin ids ajenos ni repetidos) y devuelve las filas con copia del enunciado.
   */
  private async validarRespuestas(
    tx: Prisma.TransactionClient,
    idRolProyecto: number,
    respuestas: CreatePostulacionDto['respuestas'] = [],
  ) {
    const preguntas = await tx.preguntaRol.findMany({ where: { idRolProyecto }, orderBy: { orden: 'asc' } });
    const dadas = new Map<number, string>();
    for (const r of respuestas) {
      if (!preguntas.some((p) => p.idPregunta === r.idPregunta)) {
        throw new BadRequestException('Una respuesta no corresponde a una pregunta de este rol');
      }
      if (dadas.has(r.idPregunta)) {
        throw new BadRequestException('Una pregunta no puede responderse más de una vez');
      }
      dadas.set(r.idPregunta, r.respuesta.trim());
    }
    const filas: Prisma.RespuestaPostulacionCreateWithoutPostulacionInput[] = [];
    for (const p of preguntas) {
      const respuesta = dadas.get(p.idPregunta) ?? '';
      if (!respuesta) {
        if (p.obligatoria) throw new BadRequestException(`Responde la pregunta obligatoria: "${p.enunciado}"`);
        continue;
      }
      const maximo = p.tipo === 'CORTA' ? MAX_RESPUESTA_CORTA : MAX_RESPUESTA_LARGA;
      if (respuesta.length > maximo) {
        throw new BadRequestException(`La respuesta a "${p.enunciado}" no puede superar ${maximo} caracteres`);
      }
      filas.push({ pregunta: { connect: { idPregunta: p.idPregunta } }, enunciado: p.enunciado, tipo: p.tipo, respuesta, orden: p.orden });
    }
    return filas;
  }

  /** MEJ-100: eventos guardados + los pasos de postulaciones anteriores a la línea de tiempo (fecha de envío y de resolución). */
  private conLineaDeTiempo<
    P extends {
      estadoPostulacion: string;
      fechaPostulacion: Date;
      fechaResolucion: Date | null;
      eventos: { tipo: TipoEventoPostulacion; fecha: Date }[];
    },
  >(p: P) {
    const eventos = [...p.eventos];
    const falta = (tipo: TipoEventoPostulacion) => !eventos.some((e) => e.tipo === tipo);
    if (falta('ENVIADA')) eventos.push({ tipo: 'ENVIADA', fecha: p.fechaPostulacion });
    const resuelta = p.estadoPostulacion as TipoEventoPostulacion;
    if (p.fechaResolucion && ['ACEPTADA', 'RECHAZADA', 'RETIRADA'].includes(resuelta) && falta(resuelta)) {
      eventos.push({ tipo: resuelta, fecha: p.fechaResolucion });
    }
    return { ...p, eventos: eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()) };
  }

  async create(dto: CreatePostulacionDto, postulanteId: number) {
    // 1. Verificar que el usuario existe
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: postulanteId },
    });

    if (!usuario) {
      throw new NotFoundException(
        `El usuario con id ${postulanteId} no existe`,
      );
    }

    // 2. Verificar que el rol existe y el proyecto está postulable
    const rol = await this.prisma.rolProyecto.findUnique({
      where: { idRolProyecto: dto.idRolProyecto },
      include: { proyecto: true },
    });

    if (!rol) {
      throw new NotFoundException(
        `El rol con id ${dto.idRolProyecto} no existe`,
      );
    }

    // C043 (06 v2 §23): el estado del proyecto, el cupo y el duplicado se
    // vuelven a evaluar DENTRO del lock; la lectura de arriba solo resuelve la
    // identidad del proyecto al que pertenece el rol.
    // C030: la notificación al líder se persiste en la MISMA transacción que
    // crea la postulación; el socket se publica solo después del commit. El
    // listener `application.created` ya no emite una segunda notificación.
    const effects: PostCommitEffect[] = [];
    const postulacion = await this.projectTx.run(
      rol.proyecto.idProyecto,
      postulanteId,
      'applications.create',
      async (ctx) => {
      const { tx } = ctx;
      const proyectoBloqueado = this.lockedProject(ctx);
      if (proyectoBloqueado.estadoProyecto === EstadoProyecto.EN_SOLICITUD_CIERRE) {
        throw new ConflictException('El proyecto está en solicitud de cierre');
      }
      const esPublicado = proyectoBloqueado.estadoProyecto === EstadoProyecto.PUBLICADO;
      const esEnProgreso = proyectoBloqueado.estadoProyecto === EstadoProyecto.EN_PROGRESO;

      if (!esPublicado && !esEnProgreso) {
        throw new BadRequestException(
          'Solo se puede postular a proyectos en estado PUBLICADO o EN_PROGRESO con cupos disponibles',
        );
      }

      if (esEnProgreso) {
        const activas = await tx.participacionProyecto.count({
          where: {
            idRolProyecto: dto.idRolProyecto,
            estadoParticipacion: 'ACTIVO',
          },
        });
        if (activas >= rol.cupos) {
          throw new BadRequestException(
            'El rol ya alcanzó su límite de cupos activos en EN_PROGRESO',
          );
        }
      }

      const postulacionExistente = await tx.postulacion.findFirst({
        where: {
          idUsuarioPostulante: postulanteId,
          idRolProyecto: dto.idRolProyecto,
          estadoPostulacion: { not: 'RETIRADA' },
        },
      });

      if (postulacionExistente) {
        throw new BadRequestException(
          'Ya te has postulado anteriormente a este rol en el proyecto',
        );
      }

      await this.policy.assertWriteTx(tx, proyectoBloqueado, 'POSTULACION', postulanteId);

      const respuestas = await this.validarRespuestas(tx, dto.idRolProyecto, dto.respuestas);
      const creada = await tx.postulacion.create({
        data: {
          idUsuarioPostulante: postulanteId,
          idRolProyecto: dto.idRolProyecto,
          justificacion: dto.justificacion,
          respuestas: { create: respuestas },
          eventos: { create: { tipo: 'ENVIADA' } },
        },
        include: {
          rolProyecto: {
            include: { proyecto: true },
          },
          postulante: {
            select: {
              nombre: true,
              apellido: true,
            },
          },
        },
      });

      // El líder puede ser el propio postulante; en ese caso no se notifica.
      if (rol.proyecto.creadoPor !== postulanteId) {
        await this.notificationsService.persistTemplateTx(
          tx,
          [rol.proyecto.creadoPor],
          'NUEVA_POSTULACION',
          {
            userName: `${creada.postulante.nombre} ${creada.postulante.apellido}`,
            roleName: creada.rolProyecto.nombreRol,
            projectTitle: rol.proyecto.tituloProyecto,
            projectId: rol.proyecto.idProyecto,
            applicationId: creada.idPostulacion,
            roleId: dto.idRolProyecto,
          },
          { add: (effect) => effects.push(effect) },
        );
      }

      return creada;
      },
    );
    await this.notificationsService.publishEffects(effects);

    // Emit event (event-driven): se conserva para cualquier otro listener.
    this.eventEmitter.emit(
      'application.created',
      new ApplicationCreatedEvent(
        postulacion.idPostulacion,
        postulanteId,
        rol.proyecto.idProyecto,
        dto.idRolProyecto,
      ),
    );

    return postulacion;
  }

  /**
   * C043 (06 v2 §41 E086): con actor, la lista queda acotada a lo que ese
   * actor puede ver —sus propias postulaciones y las de los proyectos que
   * lidera—, nunca a un listado global de solicitudes ajenas. El parámetro es
   * opcional solo para el consumidor interno de equipo, que ya validó el
   * liderazgo del proyecto antes de llamar; la ruta HTTP siempre lo envía.
   */
  async findAll(actorId?: number) {
    return this.prisma.postulacion.findMany({
      ...(actorId === undefined
        ? {}
        : {
            where: {
              OR: [
                { idUsuarioPostulante: actorId },
                // Una retirada solo le interesa a su autor.
                { rolProyecto: { proyecto: { creadoPor: actorId } }, estadoPostulacion: { not: 'RETIRADA' } },
              ],
            },
          }),
      include: {
        postulante: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
          },
        },
        respuestas: { orderBy: { orden: 'asc' } },
        rolProyecto: {
          include: { proyecto: true },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
  }

  /** C043 (§41 E087): alcance personal por definición — solo las propias. */
  async findMine(userId: number) {
    const postulaciones = await this.prisma.postulacion.findMany({
      where: { idUsuarioPostulante: userId },
      include: {
        respuestas: { orderBy: { orden: 'asc' } },
        eventos: { select: { tipo: true, fecha: true }, orderBy: { fecha: 'asc' } },
        rolProyecto: {
          include: {
            proyecto: {
              select: {
                idProyecto: true,
                tituloProyecto: true,
                estadoProyecto: true,
              },
            },
          },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
    return postulaciones.map((p) => this.conLineaDeTiempo(p));
  }

  /**
   * C043 (§41 E088): la postulación propia es una lectura personal; el líder
   * del proyecto la ve a través de la política de lectura (§34). Para
   * cualquier otro actor es indistinguible de inexistente.
   */
  async findOne(id: number, actorId?: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      include: {
        postulante: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
          },
        },
        respuestas: { orderBy: { orden: 'asc' } },
        rolProyecto: {
          include: {
            proyecto: true,
            requisitos: {
              include: { habilidad: true },
            },
          },
        },
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    if (actorId !== undefined && postulacion.idUsuarioPostulante !== actorId) {
      await this.readPolicy.assertRead(undefined, {
        projectId: postulacion.rolProyecto.proyecto.idProyecto,
        actorId,
        scope: 'equipo',
      });
      if (postulacion.rolProyecto.proyecto.creadoPor !== actorId) {
        throw new NotFoundException(`Postulación con id ${id} no encontrada`);
      }
      // MEJ-100: la primera apertura del líder queda como «vista» (idempotente); una ya resuelta o retirada no cambia.
      if (postulacion.estadoPostulacion === 'PENDIENTE') await this.registrarEvento(this.prisma, id, 'VISTA');
    }

    return postulacion;
  }

  /**
   * Aceptar una postulación debe producir un integrante activo real, no solo
   * cambiar el estado de la fila `Postulacion` — de lo contrario la persona
   * queda "aceptada" en el papel pero invisible en /miembros y sin poder
   * recibir tareas (idParticipacion inexistente). Reutiliza una
   * `ParticipacionProyecto` previa del mismo (usuario, rol) si existe
   * —típicamente RETIRADO de un ciclo anterior— reactivándola en vez de
   * crear una fila duplicada; solo crea una nueva cuando no existe ninguna.
   * Enlaza `idPostulacion` para conservar la trazabilidad del origen, igual
   * que ya hace `seed.ts`.
   */
  private async activarParticipacionPorPostulacion(
    tx: Prisma.TransactionClient,
    idUsuario: number,
    idRolProyecto: number,
    idPostulacion: number,
  ) {
    const existente = await tx.participacionProyecto.findFirst({
      where: { idUsuario, idRolProyecto },
      orderBy: { idParticipacion: 'desc' },
    });

    if (existente?.estadoParticipacion === 'ACTIVO') {
      // Ya activo (carrera/reintento) — no duplicar ni tocar fechaIngreso, y
      // no vuelve a consumir cupo: la comprobación de abajo solo aplica a las
      // altas que sí ocupan una plaza nueva.
      return existente;
    }

    /**
     * El cupo del rol se verifica AQUÍ, no solo al postular: `create` solo lo
     * evalúa cuando el proyecto está EN_PROGRESO, así que un rol PUBLICADO
     * podía acumular postulaciones y aceptarse todas, dejando más
     * participaciones ACTIVO que `cupos`. Es el mismo criterio que ya aplica
     * `RolesService.selfAssign` (la otra vía de alta), y corre dentro del lock
     * del proyecto, así que dos aceptaciones concurrentes no pueden pasar
     * ambas.
     */
    const rol = await tx.rolProyecto.findUniqueOrThrow({
      where: { idRolProyecto },
      select: { cupos: true, nombreRol: true },
    });
    const activos = await tx.participacionProyecto.count({
      where: { idRolProyecto, estadoParticipacion: 'ACTIVO' },
    });
    if (activos >= rol.cupos) {
      throw new ConflictException(
        `El rol "${rol.nombreRol}" ya alcanzó su límite de ${rol.cupos} cupo(s) activo(s)`,
      );
    }

    if (!existente) {
      return tx.participacionProyecto.create({
        data: { idUsuario, idRolProyecto, idPostulacion, estadoParticipacion: 'ACTIVO' },
      });
    }

    return tx.participacionProyecto.update({
      where: { idParticipacion: existente.idParticipacion },
      data: {
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date(),
        fechaSalida: null,
        idPostulacion,
      },
    });
  }

  async updateEstado(
    id: number,
    dto: UpdateEstadoPostulacionDto,
    resolutorId: number,
  ) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      include: {
        rolProyecto: {
          include: { proyecto: true },
        },
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    if (postulacion.estadoPostulacion !== 'PENDIENTE') {
      throw new BadRequestException('Esta postulación ya fue resuelta');
    }

    if (postulacion.rolProyecto.proyecto.creadoPor !== resolutorId) {
      throw new ForbiddenException(
        'Solo el creador del proyecto puede resolver postulaciones',
      );
    }

    const esAceptada = dto.estadoPostulacion === 'ACEPTADA';
    const comentario = dto.comentarioResolucion?.trim() || null;
    const motivo = esAceptada ? null : (dto.motivoRechazo ?? null);
    if (!esAceptada) {
      if (!motivo) throw new BadRequestException('Elige el motivo del rechazo');
      if (motivo === 'OTRO' && !comentario) {
        throw new BadRequestException('Con el motivo "Otro" el comentario es obligatorio');
      }
    }
    const tituloProyecto = postulacion.rolProyecto.proyecto.tituloProyecto;
    const nombreRol = postulacion.rolProyecto.nombreRol;
    const estado = dto.estadoPostulacion;
    const effects: PostCommitEffect[] = [];

    const postulacionActualizada = await this.projectTx.run(
      postulacion.rolProyecto.proyecto.idProyecto,
      resolutorId,
      'applications.updateEstado',
      async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'POSTULACION', resolutorId);
      // `updateMany` condicionado por PENDIENTE (mismo patrón que
      // SprintsService/ExitRequestsService): si otra resolución concurrente
      // ya ganó la carrera entre el findUnique de arriba y este punto,
      // count === 0 y se traduce a ConflictException en vez de resolver dos
      // veces la misma postulación (y, con ACEPTADA, crear dos
      // participaciones).
      const resuelta = await tx.postulacion.updateMany({
        where: { idPostulacion: id, estadoPostulacion: 'PENDIENTE' },
        data: {
          estadoPostulacion: dto.estadoPostulacion,
          comentarioResolucion: comentario,
          motivoRechazo: motivo,
          resueltaPor: resolutorId,
          fechaResolucion: new Date(),
        },
      });
      if (resuelta.count !== 1) {
        throw new ConflictException('Esta postulación ya fue resuelta');
      }

      await this.registrarEvento(tx, id, esAceptada ? 'ACEPTADA' : 'RECHAZADA');

      if (esAceptada) {
        await this.activarParticipacionPorPostulacion(
          tx,
          postulacion.idUsuarioPostulante,
          postulacion.idRolProyecto,
          id,
        );
        await this.adminMeetings?.notificarIngresoTx(
          tx,
          postulacion.idUsuarioPostulante,
          postulacion.rolProyecto.proyecto.idProyecto,
          { add: (effect) => effects.push(effect) },
        );
      }

      // C043: la notificación al postulante se persiste en la MISMA
      // transacción que resuelve; el socket se publica tras el commit.
      await this.notificationsService.persistUsersTx(
        tx,
        [postulacion.idUsuarioPostulante],
        {
          tipoNotificacion: TipoNotificacion.POSTULACION_RESUELTA,
          tituloNotificacion: esAceptada
            ? 'Tu postulación fue aceptada'
            : 'Tu postulación fue rechazada',
          mensajeNotificacion: esAceptada
            ? `Felicidades, tu postulación para el rol "${nombreRol}" en el proyecto "${tituloProyecto}" ha sido aceptada.`
            : `Tu postulación para el rol "${nombreRol}" en el proyecto "${tituloProyecto}" ha sido rechazada. Motivo: ${motivo ? TEXTO_MOTIVO[motivo] : ''}.${comentario ? ` Comentario: ${comentario}` : ''}`,
          datosJson: {
            idPostulacion: postulacion.idPostulacion,
            idProyecto: postulacion.rolProyecto.proyecto.idProyecto,
            idRolProyecto: postulacion.idRolProyecto,
            estadoPostulacion: estado,
            motivoRechazo: motivo,
          },
        },
        { add: (effect) => effects.push(effect) },
      );

      return tx.postulacion.findUniqueOrThrow({
        where: { idPostulacion: id },
        include: { rolProyecto: { include: { proyecto: true } } },
      });
      },
    );

    await this.notificationsService.publishEffects(effects);

    // El nuevo integrante entra a #general (y a ningún otro canal).
    if (esAceptada) await this.chatCanales?.sincronizarSinFallar(postulacion.rolProyecto.proyecto.idProyecto);
    if (esAceptada) await this.bienvenida?.enviarSinFallar(postulacion.rolProyecto.proyecto.idProyecto, postulacion.idUsuarioPostulante);
    if (esAceptada) this.eventEmitter.emit(INSIGNIAS_EVENTO, { claves: ['postulaciones'], idUsuarios: [postulacion.idUsuarioPostulante] });

    return postulacionActualizada;
  }

  /**
   * C043 (§23): retirar la propia postulación solo mientras siga PENDIENTE.
   * Autoría y estado se reevalúan dentro del lock del proyecto. MEJ-96: ya no
   * se borra; queda RETIRADA con su paso en la línea de tiempo y se avisa al líder.
   */
  async retirar(id: number, userId: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      select: {
        idPostulacion: true,
        idUsuarioPostulante: true,
        idRolProyecto: true,
        estadoPostulacion: true,
        postulante: { select: { nombre: true, apellido: true } },
        rolProyecto: {
          select: { nombreRol: true, proyecto: { select: { idProyecto: true, creadoPor: true, tituloProyecto: true } } },
        },
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    if (postulacion.idUsuarioPostulante !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta postulación',
      );
    }

    if (postulacion.estadoPostulacion !== 'PENDIENTE') {
      throw new BadRequestException(
        'Solo puedes cancelar postulaciones en estado PENDIENTE',
      );
    }

    const proyecto = postulacion.rolProyecto.proyecto;
    const effects: PostCommitEffect[] = [];
    await this.projectTx.run(proyecto.idProyecto, userId, 'applications.retirar', async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'POSTULACION', userId);
      const retirada = await tx.postulacion.updateMany({
        where: { idPostulacion: id, idUsuarioPostulante: userId, estadoPostulacion: 'PENDIENTE' },
        data: { estadoPostulacion: 'RETIRADA', fechaResolucion: new Date() },
      });
      if (retirada.count !== 1) {
        throw new ConflictException('Esta postulación ya fue resuelta o retirada');
      }
      await this.registrarEvento(tx, id, 'RETIRADA');
      if (proyecto.creadoPor !== userId) {
        const userName = `${postulacion.postulante.nombre} ${postulacion.postulante.apellido}`;
        const roleName = postulacion.rolProyecto.nombreRol;
        await this.notificationsService.persistUsersTx(
          tx,
          [proyecto.creadoPor],
          {
            tipoNotificacion: TipoNotificacion.NUEVA_POSTULACION,
            tituloNotificacion: 'Postulación retirada',
            mensajeNotificacion: `${userName} retiró su postulación para el rol "${roleName}" en tu proyecto "${proyecto.tituloProyecto}".`,
            datosJson: {
              userName,
              roleName,
              projectTitle: proyecto.tituloProyecto,
              projectId: proyecto.idProyecto,
              applicationId: id,
              roleId: postulacion.idRolProyecto,
              retirada: true,
            },
          },
          { add: (effect) => effects.push(effect) },
        );
      }
    });
    await this.notificationsService.publishEffects(effects);

    return { mensaje: 'Postulación retirada exitosamente', estadoPostulacion: 'RETIRADA' };
  }

  /** MEJ-100: el líder marca la postulación «en revisión». Idempotente; solo mientras siga PENDIENTE. */
  async marcarEnRevision(id: number, actorId: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      select: { estadoPostulacion: true, rolProyecto: { select: { proyecto: { select: { creadoPor: true } } } } },
    });
    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }
    if (postulacion.rolProyecto.proyecto.creadoPor !== actorId) {
      throw new ForbiddenException('Solo el creador del proyecto puede revisar postulaciones');
    }
    if (postulacion.estadoPostulacion !== 'PENDIENTE') {
      throw new BadRequestException('Esta postulación ya fue resuelta');
    }
    await this.registrarEvento(this.prisma, id, 'EN_REVISION');
    return this.prisma.eventoPostulacion.findMany({
      where: { idPostulacion: id },
      select: { tipo: true, fecha: true },
      orderBy: { fecha: 'asc' },
    });
  }
}
