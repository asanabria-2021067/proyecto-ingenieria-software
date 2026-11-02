import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EstadoInvitacionOrganizacion,
  EstadoMembresia,
  EstadoOrganizacion,
  EstadoUsuario,
  Prisma,
  RolOrganizacion,
  VisibilidadOrganizacion,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { OrganizationChatService } from './organization-chat.service';
import {
  ROLES_GESTION,
  USUARIO_SELECT,
  assertActiva,
  assertRol,
  assertVisible,
  auditar,
  bloquearOrganizacion,
  cargarContexto,
  notificar,
  venceEnDesde,
} from './organization-access';

const PENDIENTE = EstadoInvitacionOrganizacion.PENDIENTE;
const CANCELADA = EstadoInvitacionOrganizacion.CANCELADA;

const nombreCompleto = (u: { nombre: string; apellido: string }) => `${u.nombre} ${u.apellido}`;

/** Invitaciones (de la organización a una persona) y solicitudes de unirse (de la persona a una pública). Ambas vencen a los 14 días. */
@Injectable()
export class OrganizationInvitationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private chat: OrganizationChatService,
  ) {}

  /** Usuarios activos, sin administradores del sistema y que aún no son miembros. */
  async candidates(userId: number, idOrganizacion: number, q?: string) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede invitar');
    const palabras = (q ?? '').trim().split(/\s+/).filter(Boolean);
    if (palabras.join('').length < 3) return [];
    return this.prisma.usuario.findMany({
      where: {
        estado: EstadoUsuario.ACTIVO,
        rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } },
        membresiasOrganizacion: { none: { idOrganizacion, estadoMembresia: EstadoMembresia.ACTIVA } },
        AND: palabras.map((p) => ({
          OR: [
            { nombre: { contains: p, mode: 'insensitive' as const } },
            { apellido: { contains: p, mode: 'insensitive' as const } },
          ],
        })),
      },
      select: USUARIO_SELECT,
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
      take: 10,
    });
  }

  async invite(userId: number, idOrganizacion: number, dto: InviteMemberDto) {
    const creada = await this.prisma
      .$transaction(async (tx) => {
        await bloquearOrganizacion(tx, idOrganizacion);
        const ctx = await cargarContexto(tx, userId, idOrganizacion);
        assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede invitar');
        assertActiva(ctx);
        if (dto.rolOrganizacion === RolOrganizacion.ADMINISTRADOR && ctx.rol !== RolOrganizacion.PROPIETARIO) {
          throw new ForbiddenException('Solo el propietario nombra administradores');
        }

        const invitado = await tx.usuario.findFirst({
          where: dto.idUsuario !== undefined ? { idUsuario: dto.idUsuario } : { correo: { equals: dto.correo, mode: 'insensitive' } },
          select: { ...USUARIO_SELECT, estado: true, rolesAcceso: { where: { rolAcceso: { nombrePerfil: 'administrador' } }, select: { idUsuarioRolAcceso: true } } },
        });
        if (!invitado || invitado.estado !== EstadoUsuario.ACTIVO || invitado.rolesAcceso.length > 0) {
          throw new BadRequestException('Solo se puede invitar a usuarios activos que no sean administradores del sistema');
        }
        if (invitado.idUsuario === userId) throw new BadRequestException('No puedes invitarte a ti mismo');

        const miembro = await tx.usuarioOrganizacion.findUnique({
          where: { idUsuario_idOrganizacion: { idUsuario: invitado.idUsuario, idOrganizacion } },
          select: { estadoMembresia: true },
        });
        if (miembro?.estadoMembresia === EstadoMembresia.ACTIVA) throw new ConflictException('Esa persona ya es miembro');

        await this.cancelarVencidas(tx, idOrganizacion, invitado.idUsuario);
        const invitacion = await tx.invitacionOrganizacion.create({
          data: {
            idOrganizacion,
            idInvitado: invitado.idUsuario,
            idInvitadoPor: userId,
            rolOrganizacion: dto.rolOrganizacion,
            venceEn: venceEnDesde(),
          },
          select: INVITACION_SELECT,
        });
        await auditar(tx, userId, 'ORG_INVITACION_ENVIADA', idOrganizacion, {
          idInvitacion: invitacion.idInvitacion,
          idUsuario: invitado.idUsuario,
          rol: dto.rolOrganizacion,
        });
        const invitador = await tx.usuario.findUniqueOrThrow({ where: { idUsuario: userId }, select: { nombre: true, apellido: true } });
        return { invitacion, nombre: ctx.org.nombreOrganizacion, invitador: nombreCompleto(invitador) };
      })
      .catch(traducirPendienteDuplicada('Esa persona ya tiene una invitación pendiente'));
    await notificar(this.notifications, [creada.invitacion.invitado.idUsuario], 'INVITACION_ORGANIZACION', {
      organizationName: creada.nombre,
      organizationId: idOrganizacion,
      invitationId: creada.invitacion.idInvitacion,
      invitedBy: creada.invitador,
      roleName: dto.rolOrganizacion,
    });
    return creada.invitacion;
  }

  /** Invitaciones vigentes dirigidas al usuario. */
  listMine(userId: number) {
    return this.prisma.invitacionOrganizacion.findMany({
      where: { idInvitado: userId, estado: PENDIENTE, venceEn: { gt: new Date() }, organizacion: { estadoOrganizacion: EstadoOrganizacion.ACTIVA } },
      select: {
        idInvitacion: true,
        rolOrganizacion: true,
        creadaEn: true,
        venceEn: true,
        organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true, logoUrl: true, visibilidad: true } },
        invitadoPor: { select: USUARIO_SELECT },
      },
      orderBy: { creadaEn: 'desc' },
    });
  }

  async listForOrganization(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede ver las invitaciones');
    return this.prisma.invitacionOrganizacion.findMany({
      where: { idOrganizacion, estado: PENDIENTE, venceEn: { gt: new Date() } },
      select: INVITACION_SELECT,
      orderBy: { creadaEn: 'desc' },
    });
  }

  async cancel(userId: number, idOrganizacion: number, idInvitacion: number) {
    await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede cancelar invitaciones');
      const { count } = await tx.invitacionOrganizacion.updateMany({
        where: { idInvitacion, idOrganizacion, estado: PENDIENTE },
        data: { estado: CANCELADA, resueltaEn: new Date() },
      });
      if (count === 0) throw new NotFoundException('Invitación pendiente no encontrada');
      await auditar(tx, userId, 'ORG_INVITACION_CANCELADA', idOrganizacion, { idInvitacion });
    });
  }

  /** Solo el invitado, mientras esté pendiente y vigente. */
  async respond(userId: number, idInvitacion: number, aceptar: boolean) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const previa = await tx.invitacionOrganizacion.findUnique({ where: { idInvitacion }, select: { idOrganizacion: true } });
      if (!previa) throw new NotFoundException('Invitación no encontrada');
      await bloquearOrganizacion(tx, previa.idOrganizacion);
      const invitacion = await tx.invitacionOrganizacion.findUniqueOrThrow({
        where: { idInvitacion },
        select: { idInvitado: true, idInvitadoPor: true, idOrganizacion: true, rolOrganizacion: true, estado: true, venceEn: true },
      });
      // Una invitación ajena es indistinguible de una inexistente.
      if (invitacion.idInvitado !== userId) throw new NotFoundException('Invitación no encontrada');
      if (invitacion.estado !== PENDIENTE) throw new ConflictException('La invitación ya fue resuelta');
      if (invitacion.venceEn.getTime() <= Date.now()) throw new ConflictException('La invitación venció');
      const org = await tx.organizacion.findUniqueOrThrow({
        where: { idOrganizacion: invitacion.idOrganizacion },
        select: { nombreOrganizacion: true, estadoOrganizacion: true },
      });
      if (org.estadoOrganizacion !== EstadoOrganizacion.ACTIVA) throw new ForbiddenException('La organización está archivada');

      const ahora = new Date();
      if (aceptar) {
        await this.assertInvitadorVigente(tx, invitacion);
        await this.agregarMiembro(tx, invitacion.idOrganizacion, userId, invitacion.rolOrganizacion);
      }
      await tx.invitacionOrganizacion.update({
        where: { idInvitacion },
        data: { estado: aceptar ? EstadoInvitacionOrganizacion.ACEPTADA : EstadoInvitacionOrganizacion.RECHAZADA, resueltaEn: ahora },
      });
      await auditar(tx, userId, aceptar ? 'ORG_INVITACION_ACEPTADA' : 'ORG_INVITACION_RECHAZADA', invitacion.idOrganizacion, { idInvitacion });
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { idUsuario: userId }, select: { nombre: true, apellido: true } });
      return { invitacion, nombre: org.nombreOrganizacion, usuario: nombreCompleto(usuario) };
    });
    const { invitacion } = resultado;
    if (aceptar) await this.chat.sincronizarSinFallar(invitacion.idOrganizacion);
    await notificar(this.notifications, [invitacion.idInvitadoPor], 'ORGANIZACION_ACTUALIZADA', {
      organizationName: resultado.nombre,
      organizationId: invitacion.idOrganizacion,
      detail: `${resultado.usuario} ${aceptar ? 'aceptó' : 'rechazó'} tu invitación.`,
    });
    return { idInvitacion, idOrganizacion: invitacion.idOrganizacion, aceptada: aceptar };
  }

  async requestJoin(userId: number, idOrganizacion: number) {
    const resultado = await this.prisma
      .$transaction(async (tx) => {
        await bloquearOrganizacion(tx, idOrganizacion);
        const ctx = await cargarContexto(tx, userId, idOrganizacion);
        assertVisible(ctx);
        if (ctx.org.visibilidad !== VisibilidadOrganizacion.PUBLICA) throw new ForbiddenException('Esta organización no recibe solicitudes');
        assertActiva(ctx);
        if (ctx.rol) throw new ConflictException('Ya eres miembro de esta organización');

        await tx.solicitudUnirseOrganizacion.updateMany({
          where: { idOrganizacion, idUsuario: userId, estado: PENDIENTE, venceEn: { lte: new Date() } },
          data: { estado: CANCELADA, resueltaEn: new Date() },
        });
        const solicitud = await tx.solicitudUnirseOrganizacion.create({
          data: { idOrganizacion, idUsuario: userId, venceEn: venceEnDesde() },
          select: { idSolicitud: true, creadaEn: true, venceEn: true },
        });
        await auditar(tx, userId, 'ORG_SOLICITUD_ENVIADA', idOrganizacion, { idSolicitud: solicitud.idSolicitud });
        const [usuario, gestores] = await Promise.all([
          tx.usuario.findUniqueOrThrow({ where: { idUsuario: userId }, select: { nombre: true, apellido: true } }),
          tx.usuarioOrganizacion.findMany({
            where: { idOrganizacion, estadoMembresia: EstadoMembresia.ACTIVA, rolOrganizacion: { in: [...ROLES_GESTION] } },
            select: { idUsuario: true },
          }),
        ]);
        return { solicitud, nombre: ctx.org.nombreOrganizacion, usuario: nombreCompleto(usuario), gestores: gestores.map((g) => g.idUsuario) };
      })
      .catch(traducirPendienteDuplicada('Ya enviaste una solicitud a esta organización'));
    await notificar(this.notifications, resultado.gestores, 'SOLICITUD_UNIRSE_ORGANIZACION', {
      organizationName: resultado.nombre,
      organizationId: idOrganizacion,
      requestId: resultado.solicitud.idSolicitud,
      userName: resultado.usuario,
    });
    return resultado.solicitud;
  }

  async listRequests(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede ver las solicitudes');
    return this.prisma.solicitudUnirseOrganizacion.findMany({
      where: { idOrganizacion, estado: PENDIENTE, venceEn: { gt: new Date() } },
      select: { idSolicitud: true, creadaEn: true, venceEn: true, usuario: { select: USUARIO_SELECT } },
      orderBy: { creadaEn: 'asc' },
    });
  }

  /** Aceptar la solicitud admite a la persona como Lectura. */
  async resolveRequest(userId: number, idOrganizacion: number, idSolicitud: number, aceptar: boolean) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede resolver solicitudes');
      assertActiva(ctx);
      const solicitud = await tx.solicitudUnirseOrganizacion.findFirst({
        where: { idSolicitud, idOrganizacion },
        select: { idUsuario: true, estado: true, venceEn: true },
      });
      if (!solicitud) throw new NotFoundException('Solicitud no encontrada');
      if (solicitud.estado !== PENDIENTE) throw new ConflictException('La solicitud ya fue resuelta');
      if (solicitud.venceEn.getTime() <= Date.now()) throw new ConflictException('La solicitud venció');
      if (aceptar) await this.agregarMiembro(tx, idOrganizacion, solicitud.idUsuario, RolOrganizacion.LECTURA);
      await tx.solicitudUnirseOrganizacion.update({
        where: { idSolicitud },
        data: {
          estado: aceptar ? EstadoInvitacionOrganizacion.ACEPTADA : EstadoInvitacionOrganizacion.RECHAZADA,
          resueltaEn: new Date(),
          resueltaPor: userId,
        },
      });
      await auditar(tx, userId, aceptar ? 'ORG_SOLICITUD_ACEPTADA' : 'ORG_SOLICITUD_RECHAZADA', idOrganizacion, {
        idSolicitud,
        idUsuario: solicitud.idUsuario,
      });
      return { idSolicitante: solicitud.idUsuario, nombre: ctx.org.nombreOrganizacion };
    });
    if (aceptar) await this.chat.sincronizarSinFallar(idOrganizacion);
    await notificar(this.notifications, [resultado.idSolicitante], 'ORGANIZACION_ACTUALIZADA', {
      organizationName: resultado.nombre,
      organizationId: idOrganizacion,
      detail: aceptar ? 'Tu solicitud fue aceptada: ya eres miembro.' : 'Tu solicitud para unirte fue rechazada.',
    });
    return { idSolicitud, aceptada: aceptar };
  }

  /** Crea o reactiva la membresía y cierra lo que quedara pendiente entre la persona y la organización. */
  private async agregarMiembro(tx: Prisma.TransactionClient, idOrganizacion: number, idUsuario: number, rol: RolOrganizacion) {
    await tx.usuarioOrganizacion.upsert({
      where: { idUsuario_idOrganizacion: { idUsuario, idOrganizacion } },
      create: { idUsuario, idOrganizacion, rolOrganizacion: rol },
      update: { rolOrganizacion: rol, estadoMembresia: EstadoMembresia.ACTIVA },
    });
    const cierre = { estado: CANCELADA, resueltaEn: new Date() };
    await tx.invitacionOrganizacion.updateMany({ where: { idOrganizacion, idInvitado: idUsuario, estado: PENDIENTE }, data: cierre });
    await tx.solicitudUnirseOrganizacion.updateMany({ where: { idOrganizacion, idUsuario, estado: PENDIENTE }, data: cierre });
  }

  /** Quien invitó debe seguir pudiendo hacerlo: gestor activo, y Propietario si el rol es Administrador. */
  private async assertInvitadorVigente(
    tx: Prisma.TransactionClient,
    { idInvitadoPor, idOrganizacion, rolOrganizacion }: { idInvitadoPor: number; idOrganizacion: number; rolOrganizacion: RolOrganizacion },
  ) {
    const invitador = await tx.usuarioOrganizacion.findUnique({
      where: { idUsuario_idOrganizacion: { idUsuario: idInvitadoPor, idOrganizacion } },
      select: { rolOrganizacion: true, estadoMembresia: true },
    });
    const vigente =
      invitador?.estadoMembresia === EstadoMembresia.ACTIVA &&
      (invitador.rolOrganizacion === RolOrganizacion.PROPIETARIO ||
        (invitador.rolOrganizacion === RolOrganizacion.ADMINISTRADOR && rolOrganizacion !== RolOrganizacion.ADMINISTRADOR));
    if (!vigente) throw new ConflictException('La invitación ya no es válida');
  }

  private cancelarVencidas(tx: Prisma.TransactionClient, idOrganizacion: number, idInvitado: number) {
    return tx.invitacionOrganizacion.updateMany({
      where: { idOrganizacion, idInvitado, estado: PENDIENTE, venceEn: { lte: new Date() } },
      data: { estado: CANCELADA, resueltaEn: new Date() },
    });
  }
}

const INVITACION_SELECT = {
  idInvitacion: true,
  rolOrganizacion: true,
  creadaEn: true,
  venceEn: true,
  invitado: { select: USUARIO_SELECT },
  invitadoPor: { select: USUARIO_SELECT },
} as const;

/** El índice único parcial gana la carrera entre dos envíos simultáneos. */
function traducirPendienteDuplicada(mensaje: string) {
  return (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(mensaje);
    throw error;
  };
}
