import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';
import { ApplicationCreatedEvent } from '../notifications/events/application-created.event';
import { EstadoProyecto, Prisma, TipoNotificacion } from '@prisma/client';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

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
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
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
        },
      });

      if (postulacionExistente) {
        throw new BadRequestException(
          'Ya te has postulado anteriormente a este rol en el proyecto',
        );
      }

      await this.policy.assertWriteTx(tx, proyectoBloqueado, 'POSTULACION', postulanteId);

      const creada = await tx.postulacion.create({
        data: {
          idUsuarioPostulante: postulanteId,
          idRolProyecto: dto.idRolProyecto,
          justificacion: dto.justificacion,
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
                { rolProyecto: { proyecto: { creadoPor: actorId } } },
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
        rolProyecto: {
          include: { proyecto: true },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
  }

  /** C043 (§41 E087): alcance personal por definición — solo las propias. */
  async findMine(userId: number) {
    return this.prisma.postulacion.findMany({
      where: { idUsuarioPostulante: userId },
      include: {
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
          comentarioResolucion: dto.comentarioResolucion ?? null,
          resueltaPor: resolutorId,
          fechaResolucion: new Date(),
        },
      });
      if (resuelta.count !== 1) {
        throw new ConflictException('Esta postulación ya fue resuelta');
      }

      if (esAceptada) {
        await this.activarParticipacionPorPostulacion(
          tx,
          postulacion.idUsuarioPostulante,
          postulacion.idRolProyecto,
          id,
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
            : `Tu postulación para el rol "${nombreRol}" en el proyecto "${tituloProyecto}" ha sido rechazada.${dto.comentarioResolucion ? ` Comentario: ${dto.comentarioResolucion}` : ''}`,
          datosJson: {
            idPostulacion: postulacion.idPostulacion,
            idProyecto: postulacion.rolProyecto.proyecto.idProyecto,
            idRolProyecto: postulacion.idRolProyecto,
            estadoPostulacion: estado,
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

    return postulacionActualizada;
  }

  /**
   * C043 (§23): retirar la propia postulación solo mientras siga PENDIENTE.
   * Autoría y estado se reevalúan dentro del lock del proyecto.
   */
  async delete(id: number, userId: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      select: {
        idPostulacion: true,
        idUsuarioPostulante: true,
        estadoPostulacion: true,
        rolProyecto: { select: { idProyecto: true } },
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

    await this.projectTx.run(
      postulacion.rolProyecto.idProyecto,
      userId,
      'applications.delete',
      async (ctx) => {
        const { tx } = ctx;
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'POSTULACION', userId);
        const retirada = await tx.postulacion.deleteMany({
          where: { idPostulacion: id, idUsuarioPostulante: userId, estadoPostulacion: 'PENDIENTE' },
        });
        if (retirada.count !== 1) {
          throw new ConflictException('Esta postulación ya fue resuelta o retirada');
        }
      },
    );

    return { mensaje: 'Postulación cancelada exitosamente' };
  }
}
