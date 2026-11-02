import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoInvitacionRol, EstadoUsuario, NivelHabilidad, Prisma, TipoNotificacion } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ChatCanalesService } from '../chat/chat-canales.service';
import { AdminMeetingsService } from '../events/admin-meetings.service';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { calcularCoincidencia } from '../common/coincidencia-habilidades';
import { CreateInvitacionRolDto } from './dto/create-invitacion-rol.dto';

export const SUGERENCIAS_MAXIMO = 20;
const SUGERENCIAS_VENTANA = 200;
const MAX_HABILIDADES = 20;

const nombreCompleto = (u: { nombre: string; apellido: string }) => `${u.nombre} ${u.apellido}`;

/**
 * MEJ-22/62: el líder invita directo a un estudiante a un rol, y la persona acepta o rechaza.
 * Aceptar activa la participación en la misma transacción bajo el lock del proyecto (cupo y estado
 * se reevalúan ahí), igual que aceptar una postulación. Solo el líder invita; solo el invitado responde.
 */
@Injectable()
export class RoleInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly chatCanales?: ChatCanalesService,
    private readonly adminMeetings?: AdminMeetingsService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) throw new NotFoundException('Proyecto no encontrado');
    return ctx.project;
  }

  async invitar(userId: number, dto: CreateInvitacionRolDto) {
    if (dto.idUsuario === userId) throw new BadRequestException('No puedes invitarte a ti mismo');
    const rol = await this.prisma.rolProyecto.findUnique({
      where: { idRolProyecto: dto.idRolProyecto },
      select: { idRolProyecto: true, nombreRol: true, cupos: true, proyecto: { select: { idProyecto: true, tituloProyecto: true, eliminadoEn: true } } },
    });
    if (!rol || rol.proyecto.eliminadoEn) throw new NotFoundException('Rol no encontrado');

    const effects: PostCommitEffect[] = [];
    const invitacion = await this.projectTx.run(rol.proyecto.idProyecto, userId, 'roleInvitations.invitar', async (ctx) => {
      const { tx } = ctx;
      const proyecto = this.lockedProject(ctx);
      if (proyecto.creadoPor !== userId) throw new ForbiddenException('Solo el líder del proyecto invita a un rol');
      // Publicado o en progreso, igual que postularse.
      await this.policy.assertWriteTx(tx, proyecto, 'POSTULACION', userId);

      const invitado = await tx.usuario.findFirst({
        where: { idUsuario: dto.idUsuario, estado: EstadoUsuario.ACTIVO, rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } } },
        select: { idUsuario: true },
      });
      if (!invitado) throw new NotFoundException('Estudiante no encontrado');

      const [activos, yaParticipa, pendiente, postulado] = await Promise.all([
        tx.participacionProyecto.count({ where: { idRolProyecto: rol.idRolProyecto, estadoParticipacion: 'ACTIVO' } }),
        tx.participacionProyecto.count({ where: { idRolProyecto: rol.idRolProyecto, idUsuario: dto.idUsuario, estadoParticipacion: 'ACTIVO' } }),
        tx.invitacionRolProyecto.count({ where: { idRolProyecto: rol.idRolProyecto, idInvitado: dto.idUsuario, estado: EstadoInvitacionRol.PENDIENTE } }),
        tx.postulacion.count({ where: { idRolProyecto: rol.idRolProyecto, idUsuarioPostulante: dto.idUsuario, estadoPostulacion: 'PENDIENTE' } }),
      ]);
      if (yaParticipa > 0) throw new ConflictException('Esta persona ya participa en ese rol');
      if (pendiente > 0) throw new ConflictException('Esta persona ya tiene una invitación pendiente a ese rol');
      if (postulado > 0) throw new ConflictException('Esta persona ya se postuló a ese rol: resuelve su postulación');
      if (activos >= rol.cupos) throw new ConflictException(`El rol "${rol.nombreRol}" no tiene cupos disponibles`);

      const creada = await tx.invitacionRolProyecto.create({
        data: { idRolProyecto: rol.idRolProyecto, idInvitado: dto.idUsuario, idInvitadoPor: userId, mensaje: dto.mensaje?.trim() || null },
        select: { idInvitacionRol: true, idRolProyecto: true, idInvitado: true, estado: true, creadaEn: true },
      });
      const lider = await tx.usuario.findUniqueOrThrow({ where: { idUsuario: userId }, select: { nombre: true, apellido: true } });
      await this.notifications.persistTemplateTx(
        tx,
        [dto.idUsuario],
        'INVITACION_ROL_PROYECTO',
        {
          projectTitle: rol.proyecto.tituloProyecto,
          projectId: rol.proyecto.idProyecto,
          roleName: rol.nombreRol,
          roleId: rol.idRolProyecto,
          invitationId: creada.idInvitacionRol,
          invitedBy: nombreCompleto(lider),
        },
        { add: (effect) => effects.push(effect) },
      );
      return creada;
    });
    await this.notifications.publishEffects(effects);
    return invitacion;
  }

  /** Invitaciones pendientes dirigidas al usuario. */
  async mias(userId: number) {
    return this.prisma.invitacionRolProyecto.findMany({
      where: { idInvitado: userId, estado: EstadoInvitacionRol.PENDIENTE, rolProyecto: { proyecto: { eliminadoEn: null } } },
      orderBy: { creadaEn: 'desc' },
      select: {
        idInvitacionRol: true,
        mensaje: true,
        creadaEn: true,
        invitadoPor: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } },
        rolProyecto: {
          select: {
            idRolProyecto: true,
            nombreRol: true,
            descripcionRolProyecto: true,
            proyecto: { select: { idProyecto: true, tituloProyecto: true, estadoProyecto: true } },
          },
        },
      },
    });
  }

  /** Invitaciones pendientes de un proyecto: solo las ve su líder (para marcar «Invitado» en la UI). */
  async delProyecto(userId: number, idProyecto: number) {
    const proyecto = await this.prisma.proyecto.findFirst({ where: { idProyecto, eliminadoEn: null }, select: { creadoPor: true } });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    if (proyecto.creadoPor !== userId) throw new ForbiddenException('No eres el líder de este proyecto');
    return this.prisma.invitacionRolProyecto.findMany({
      where: { estado: EstadoInvitacionRol.PENDIENTE, rolProyecto: { idProyecto } },
      orderBy: { creadaEn: 'desc' },
      select: { idInvitacionRol: true, idRolProyecto: true, idInvitado: true, creadaEn: true },
    });
  }

  async responder(userId: number, idInvitacionRol: number, aceptar: boolean) {
    const inv = await this.prisma.invitacionRolProyecto.findUnique({
      where: { idInvitacionRol },
      select: {
        idInvitado: true,
        idInvitadoPor: true,
        estado: true,
        rolProyecto: { select: { idRolProyecto: true, nombreRol: true, cupos: true, proyecto: { select: { idProyecto: true, tituloProyecto: true } } } },
      },
    });
    // Ajena e inexistente responden igual: nadie ve invitaciones que no son suyas.
    if (!inv || inv.idInvitado !== userId) throw new NotFoundException('Invitación no encontrada');
    if (inv.estado !== EstadoInvitacionRol.PENDIENTE) throw new ConflictException('Esta invitación ya fue respondida');

    const { rolProyecto: rol } = inv;
    const effects: PostCommitEffect[] = [];
    await this.projectTx.run(rol.proyecto.idProyecto, userId, 'roleInvitations.responder', async (ctx) => {
      const { tx } = ctx;
      // CAS: dos respuestas simultáneas no resuelven dos veces ni crean dos participaciones.
      const resuelta = await tx.invitacionRolProyecto.updateMany({
        where: { idInvitacionRol, idInvitado: userId, estado: EstadoInvitacionRol.PENDIENTE },
        data: { estado: aceptar ? EstadoInvitacionRol.ACEPTADA : EstadoInvitacionRol.RECHAZADA, resueltaEn: new Date() },
      });
      if (resuelta.count !== 1) throw new ConflictException('Esta invitación ya fue respondida');

      if (aceptar) {
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'POSTULACION', userId);
        const activos = await tx.participacionProyecto.count({ where: { idRolProyecto: rol.idRolProyecto, estadoParticipacion: 'ACTIVO' } });
        if (activos >= rol.cupos) throw new ConflictException(`El rol "${rol.nombreRol}" ya no tiene cupos disponibles`);
        const previa = await tx.participacionProyecto.findFirst({
          where: { idUsuario: userId, idRolProyecto: rol.idRolProyecto },
          orderBy: { idParticipacion: 'desc' },
        });
        if (!previa) {
          await tx.participacionProyecto.create({ data: { idUsuario: userId, idRolProyecto: rol.idRolProyecto, estadoParticipacion: 'ACTIVO' } });
        } else if (previa.estadoParticipacion !== 'ACTIVO') {
          await tx.participacionProyecto.update({
            where: { idParticipacion: previa.idParticipacion },
            data: { estadoParticipacion: 'ACTIVO', fechaIngreso: new Date(), fechaSalida: null },
          });
        }
        await this.adminMeetings?.notificarIngresoTx(tx, userId, rol.proyecto.idProyecto, { add: (effect) => effects.push(effect) });
      }

      const invitado = await tx.usuario.findUniqueOrThrow({ where: { idUsuario: userId }, select: { nombre: true, apellido: true } });
      await this.notifications.persistUsersTx(
        tx,
        [inv.idInvitadoPor],
        {
          tipoNotificacion: TipoNotificacion.INVITACION_ROL_PROYECTO,
          tituloNotificacion: aceptar ? 'Aceptaron tu invitación' : 'Rechazaron tu invitación',
          mensajeNotificacion: `${nombreCompleto(invitado)} ${aceptar ? 'aceptó' : 'rechazó'} tu invitación al rol "${rol.nombreRol}" de "${rol.proyecto.tituloProyecto}".`,
          datosJson: { idProyecto: rol.proyecto.idProyecto, idRolProyecto: rol.idRolProyecto, idInvitacionRol, aceptada: aceptar },
        },
        { add: (effect) => effects.push(effect) },
      );
    });
    await this.notifications.publishEffects(effects);

    if (aceptar) {
      await this.chatCanales?.sincronizarSinFallar(rol.proyecto.idProyecto);
      this.eventEmitter.emit(INSIGNIAS_EVENTO, { claves: ['postulaciones'], idUsuarios: [userId] });
    }
    return { idInvitacionRol, estado: aceptar ? EstadoInvitacionRol.ACEPTADA : EstadoInvitacionRol.RECHAZADA };
  }

  /**
   * MEJ-62: a quién invitar a un rol que se está creando o editando. Compara las habilidades pedidas
   * (ids del formulario, nivel mínimo básico) con las de cada estudiante activo y ordena por % de
   * coincidencia, con la misma carrera como desempate. Con `idProyecto` solo lo consulta su líder y
   * deja fuera a quienes ya participan. Devuelve solo nombre, foto, carrera y habilidades en común.
   */
  async sugerencias(
    userId: number,
    query: { habilidades: number[]; idCarrera?: number; idProyecto?: number; limite?: number },
  ) {
    const habilidades = [...new Set(query.habilidades)].slice(0, MAX_HABILIDADES);
    if (habilidades.length === 0 && query.idCarrera === undefined) return [];
    const limite = Math.min(Math.max(query.limite ?? 8, 1), SUGERENCIAS_MAXIMO);

    const excluidos = new Set<number>([userId]);
    if (query.idProyecto !== undefined) {
      const proyecto = await this.prisma.proyecto.findFirst({
        where: { idProyecto: query.idProyecto, eliminadoEn: null },
        select: { creadoPor: true, roles: { select: { participaciones: { where: { estadoParticipacion: 'ACTIVO' }, select: { idUsuario: true } } } } },
      });
      if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
      if (proyecto.creadoPor !== userId) throw new ForbiddenException('No eres el líder de este proyecto');
      for (const r of proyecto.roles) for (const p of r.participaciones) excluidos.add(p.idUsuario);
    }

    const criterios: Prisma.UsuarioWhereInput[] = [];
    if (habilidades.length > 0) criterios.push({ habilidades: { some: { idHabilidad: { in: habilidades } } } });
    if (query.idCarrera !== undefined) criterios.push({ perfil: { idCarrera: query.idCarrera } });

    const candidatos = await this.prisma.usuario.findMany({
      where: {
        estado: EstadoUsuario.ACTIVO,
        idUsuario: { notIn: [...excluidos] },
        perfil: { isNot: null },
        rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } },
        OR: criterios,
      },
      take: SUGERENCIAS_VENTANA,
      select: {
        idUsuario: true,
        nombre: true,
        apellido: true,
        fotoUrl: true,
        perfil: { select: { idCarrera: true, carrera: { select: { nombreCarrera: true } } } },
        habilidades: {
          where: { idHabilidad: { in: habilidades } },
          select: { idHabilidad: true, nivelHabilidad: true, habilidad: { select: { nombreHabilidad: true } } },
        },
      },
    });

    const requisitos = habilidades.map((idHabilidad) => ({ idHabilidad, nivelMinimo: NivelHabilidad.BASICO, obligatorio: false }));
    return candidatos
      .map((c) => {
        const mapa = new Map(c.habilidades.map((h) => [h.idHabilidad, h.nivelHabilidad]));
        const coincidencia = calcularCoincidencia(requisitos, mapa);
        return {
          idUsuario: c.idUsuario,
          nombre: c.nombre,
          apellido: c.apellido,
          fotoUrl: c.fotoUrl,
          carrera: c.perfil?.carrera?.nombreCarrera ?? null,
          mismaCarrera: query.idCarrera !== undefined && c.perfil?.idCarrera === query.idCarrera,
          porcentaje: coincidencia?.porcentaje ?? 0,
          habilidadesEnComun: c.habilidades.map((h) => h.habilidad.nombreHabilidad),
        };
      })
      .filter((s) => s.porcentaje > 0 || s.mismaCarrera)
      .sort((a, b) => b.porcentaje - a.porcentaje || Number(b.mismaCarrera) - Number(a.mismaCarrera))
      .slice(0, limite);
  }
}
