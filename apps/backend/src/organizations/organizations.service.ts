import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EstadoInvitacionOrganizacion,
  EstadoMembresia,
  EstadoOrganizacion,
  EstadoProyecto,
  Prisma,
  RolOrganizacion,
  VisibilidadOrganizacion,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationChatService } from './organization-chat.service';
import {
  ROLES_GESTION,
  ROLES_PUBLICAN,
  TIPO_OBJETO_ORGANIZACION,
  assertActiva,
  assertRol,
  assertVisible,
  auditar,
  bloquearOrganizacion,
  cargarContexto,
  notificar,
} from './organization-access';

const USUARIO_SELECT = { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } as const;

const ORG_SELECT = {
  idOrganizacion: true,
  nombreOrganizacion: true,
  descripcionOrganizacion: true,
  sitioWeb: true,
  logoUrl: true,
  visibilidad: true,
  estadoOrganizacion: true,
  fechaCreacion: true,
} as const;

/** Estados de proyecto que ve cualquiera que pueda ver la organización. */
const ESTADOS_PROYECTO_VISIBLES: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
  EstadoProyecto.CERRADO,
];

const MIEMBROS_ACTIVOS = { where: { estadoMembresia: EstadoMembresia.ACTIVA } } as const;

type OrgFila = Prisma.OrganizacionGetPayload<{ select: typeof ORG_SELECT }>;

function resumen({ estadoOrganizacion, ...org }: OrgFila, miRol: RolOrganizacion | null) {
  return {
    ...org,
    archivada: estadoOrganizacion === EstadoOrganizacion.INACTIVA,
    miRol,
    puedePublicar: !!miRol && ROLES_PUBLICAN.includes(miRol) && estadoOrganizacion === EstadoOrganizacion.ACTIVA,
  };
}

/** '' significa «quitar»: se guarda NULL. */
const vacioANull = (valor: string | undefined) => (valor === '' ? null : valor);

function avanceDe(tareas: { estadoTarea: string }[]) {
  const hecho = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  return { total: tareas.length, hecho, porcentaje: tareas.length === 0 ? 0 : Math.round((hecho / tareas.length) * 100) };
}

const ORDEN_ROL: Record<RolOrganizacion, number> = {
  PROPIETARIO: 0,
  ADMINISTRADOR: 1,
  EDITOR: 2,
  LECTURA: 3,
  MIEMBRO: 3,
};

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private chat: OrganizationChatService,
  ) {}

  async create(userId: number, dto: CreateOrganizationDto) {
    const creada = await this.prisma
      .$transaction(async (tx) => {
        await this.assertNombreLibre(tx, dto.nombreOrganizacion);
        const org = await tx.organizacion.create({
          data: {
            nombreOrganizacion: dto.nombreOrganizacion,
            descripcionOrganizacion: vacioANull(dto.descripcionOrganizacion),
            sitioWeb: vacioANull(dto.sitioWeb),
            logoUrl: vacioANull(dto.logoUrl),
            visibilidad: dto.visibilidad ?? VisibilidadOrganizacion.PRIVADA,
            creadaPor: userId,
            miembros: { create: { idUsuario: userId, rolOrganizacion: RolOrganizacion.PROPIETARIO } },
          },
          select: ORG_SELECT,
        });
        await auditar(tx, userId, 'ORG_CREADA', org.idOrganizacion, { nombre: org.nombreOrganizacion, visibilidad: org.visibilidad });
        return org;
      })
      .catch(traducirNombreDuplicado);
    await this.chat.sincronizarSinFallar(creada.idOrganizacion);
    return resumen(creada, RolOrganizacion.PROPIETARIO);
  }

  private async assertNombreLibre(db: Prisma.TransactionClient, nombre: string, excluir?: number) {
    const existente = await db.organizacion.findFirst({
      where: {
        nombreOrganizacion: { equals: nombre, mode: 'insensitive' },
        ...(excluir ? { idOrganizacion: { not: excluir } } : {}),
      },
      select: { idOrganizacion: true },
    });
    if (existente) throw new ConflictException('Ya existe una organización con ese nombre');
  }

  async update(userId: number, idOrganizacion: number, dto: UpdateOrganizationDto) {
    const actualizada = await this.prisma
      .$transaction(async (tx) => {
        await bloquearOrganizacion(tx, idOrganizacion);
        const ctx = await cargarContexto(tx, userId, idOrganizacion);
        assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede editar la organización');
        assertActiva(ctx);
        if (dto.visibilidad !== undefined && dto.visibilidad !== ctx.org.visibilidad && ctx.rol !== RolOrganizacion.PROPIETARIO) {
          throw new ForbiddenException('Solo el propietario puede cambiar la visibilidad');
        }
        if (dto.nombreOrganizacion !== undefined) await this.assertNombreLibre(tx, dto.nombreOrganizacion, idOrganizacion);
        const org = await tx.organizacion.update({
          where: { idOrganizacion },
          data: {
            nombreOrganizacion: dto.nombreOrganizacion,
            descripcionOrganizacion: vacioANull(dto.descripcionOrganizacion),
            sitioWeb: vacioANull(dto.sitioWeb),
            logoUrl: vacioANull(dto.logoUrl),
            visibilidad: dto.visibilidad,
          },
          select: ORG_SELECT,
        });
        await auditar(tx, userId, 'ORG_EDITADA', idOrganizacion, { campos: Object.keys(dto) });
        return { org, rol: ctx.rol };
      })
      .catch(traducirNombreDuplicado);
    return resumen(actualizada.org, actualizada.rol);
  }

  async listMine(userId: number) {
    const filas = await this.prisma.usuarioOrganizacion.findMany({
      where: { idUsuario: userId, estadoMembresia: EstadoMembresia.ACTIVA },
      select: {
        rolOrganizacion: true,
        organizacion: {
          select: { ...ORG_SELECT, _count: { select: { miembros: MIEMBROS_ACTIVOS, proyectos: true } } },
        },
      },
      orderBy: { organizacion: { nombreOrganizacion: 'asc' } },
    });
    return filas.map(({ rolOrganizacion, organizacion: { _count, ...org } }) => ({
      ...resumen(org, rolOrganizacion),
      totalMiembros: _count.miembros,
      totalProyectos: _count.proyectos,
    }));
  }

  /** Buscador de organizaciones públicas y activas, con una muestra de sus proyectos. */
  async search(userId: number, { q, page = 1, limit = 12 }: { q?: string; page?: number; limit?: number }) {
    const where: Prisma.OrganizacionWhereInput = {
      visibilidad: VisibilidadOrganizacion.PUBLICA,
      estadoOrganizacion: EstadoOrganizacion.ACTIVA,
      ...(q?.trim() ? { nombreOrganizacion: { contains: q.trim(), mode: 'insensitive' } } : {}),
    };
    const proyectosVisibles = { proyecto: { estadoProyecto: { in: ESTADOS_PROYECTO_VISIBLES }, eliminadoEn: null } };
    const [filas, total] = await Promise.all([
      this.prisma.organizacion.findMany({
        where,
        select: {
          ...ORG_SELECT,
          _count: { select: { miembros: MIEMBROS_ACTIVOS, proyectos: { where: proyectosVisibles } } },
          miembros: { where: { idUsuario: userId, estadoMembresia: EstadoMembresia.ACTIVA }, select: { rolOrganizacion: true } },
          solicitudes: {
            where: { idUsuario: userId, estado: EstadoInvitacionOrganizacion.PENDIENTE, venceEn: { gt: new Date() } },
            select: { idSolicitud: true },
          },
          proyectos: {
            where: proyectosVisibles,
            take: 3,
            orderBy: { fechaVinculacion: 'desc' },
            select: { proyecto: { select: { idProyecto: true, tituloProyecto: true, estadoProyecto: true } } },
          },
        },
        orderBy: { nombreOrganizacion: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organizacion.count({ where }),
    ]);
    return {
      data: filas.map(({ _count, miembros, solicitudes, proyectos, ...org }) => ({
        ...resumen(org, miembros[0]?.rolOrganizacion ?? null),
        totalMiembros: _count.miembros,
        totalProyectos: _count.proyectos,
        solicitudPendiente: solicitudes.length > 0,
        proyectos: proyectos.map((p) => p.proyecto),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Una privada solo existe para sus miembros; los miembros ven además la lista con roles. */
  async detail(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertVisible(ctx);
    const esMiembro = ctx.rol !== null;
    const gestiona = !!ctx.rol && ROLES_GESTION.includes(ctx.rol);
    const ahora = new Date();
    const pendiente = { estado: EstadoInvitacionOrganizacion.PENDIENTE, venceEn: { gt: ahora } };

    const [org, miembros, proyectos, invitaciones, solicitudes, miSolicitud] = await Promise.all([
      this.prisma.organizacion.findUniqueOrThrow({ where: { idOrganizacion }, select: ORG_SELECT }),
      this.prisma.usuarioOrganizacion.findMany({
        where: { idOrganizacion, estadoMembresia: EstadoMembresia.ACTIVA },
        select: { rolOrganizacion: true, fechaIngreso: true, usuario: { select: USUARIO_SELECT } },
      }),
      this.prisma.proyecto.findMany({
        where: {
          eliminadoEn: null,
          estadoProyecto: { in: ESTADOS_PROYECTO_VISIBLES },
          organizaciones: { some: { idOrganizacion } },
        },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          tipoProyecto: true,
          estadoProyecto: true,
          fechaPublicacion: true,
          creador: { select: USUARIO_SELECT },
          tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true } },
        },
        orderBy: { fechaCreacion: 'desc' },
      }),
      gestiona ? this.prisma.invitacionOrganizacion.count({ where: { idOrganizacion, ...pendiente } }) : 0,
      gestiona ? this.prisma.solicitudUnirseOrganizacion.count({ where: { idOrganizacion, ...pendiente } }) : 0,
      esMiembro
        ? null
        : this.prisma.solicitudUnirseOrganizacion.findFirst({ where: { idOrganizacion, idUsuario: userId, ...pendiente }, select: { idSolicitud: true } }),
    ]);

    return {
      ...resumen(org, ctx.rol),
      totalMiembros: miembros.length,
      miembros: esMiembro
        ? miembros
            .map(({ usuario, ...m }) => ({ ...usuario, rolOrganizacion: m.rolOrganizacion, fechaIngreso: m.fechaIngreso }))
            .sort((a, b) => ORDEN_ROL[a.rolOrganizacion] - ORDEN_ROL[b.rolOrganizacion] || a.nombre.localeCompare(b.nombre))
        : null,
      proyectos: proyectos.map(({ tareas, ...p }) => ({
        ...p,
        publicadoPor: org.nombreOrganizacion,
        avance: avanceDe(tareas),
      })),
      invitacionesPendientes: gestiona ? invitaciones : null,
      solicitudesPendientes: gestiona ? solicitudes : null,
      solicitudPendiente: !esMiembro && miSolicitud !== null,
    };
  }

  async changeRole(userId: number, idOrganizacion: number, idObjetivo: number, nuevoRol: RolOrganizacion) {
    const { nombre } = await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede cambiar roles');
      assertActiva(ctx);
      if (idObjetivo === userId) throw new ForbiddenException('No puedes cambiar tu propio rol');
      const objetivo = await this.miembroActivo(tx, idOrganizacion, idObjetivo);
      if (objetivo.rolOrganizacion === RolOrganizacion.PROPIETARIO) {
        throw new ForbiddenException('El rol del propietario no se cambia: transfiere la propiedad');
      }
      if (ctx.rol === RolOrganizacion.ADMINISTRADOR) {
        const objetivoEsAdmin = objetivo.rolOrganizacion === RolOrganizacion.ADMINISTRADOR;
        if (objetivoEsAdmin || nuevoRol === RolOrganizacion.ADMINISTRADOR) {
          throw new ForbiddenException('Solo el propietario nombra o cambia administradores');
        }
      }
      await tx.usuarioOrganizacion.update({
        where: { idUsuario_idOrganizacion: { idUsuario: idObjetivo, idOrganizacion } },
        data: { rolOrganizacion: nuevoRol },
      });
      await auditar(tx, userId, 'ORG_ROL_CAMBIADO', idOrganizacion, {
        idUsuario: idObjetivo,
        rolAnterior: objetivo.rolOrganizacion,
        rolNuevo: nuevoRol,
      });
      return { nombre: ctx.org.nombreOrganizacion };
    });
    await notificar(this.notifications, [idObjetivo], 'ORGANIZACION_ACTUALIZADA', {
      organizationName: nombre,
      organizationId: idOrganizacion,
      detail: `Tu rol en la organización ahora es ${nuevoRol}.`,
    });
    return { idUsuario: idObjetivo, rolOrganizacion: nuevoRol };
  }

  async removeMember(userId: number, idOrganizacion: number, idObjetivo: number) {
    const { nombre } = await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede quitar miembros');
      assertActiva(ctx);
      if (idObjetivo === userId) throw new BadRequestException('Para irte de la organización usa «Salir»');
      const objetivo = await this.miembroActivo(tx, idOrganizacion, idObjetivo);
      if (objetivo.rolOrganizacion === RolOrganizacion.PROPIETARIO) {
        throw new ForbiddenException('No se puede quitar al propietario');
      }
      if (ctx.rol === RolOrganizacion.ADMINISTRADOR && objetivo.rolOrganizacion === RolOrganizacion.ADMINISTRADOR) {
        throw new ForbiddenException('Solo el propietario puede quitar a un administrador');
      }
      await tx.usuarioOrganizacion.delete({
        where: { idUsuario_idOrganizacion: { idUsuario: idObjetivo, idOrganizacion } },
      });
      await auditar(tx, userId, 'ORG_MIEMBRO_QUITADO', idOrganizacion, { idUsuario: idObjetivo, rol: objetivo.rolOrganizacion });
      return { nombre: ctx.org.nombreOrganizacion };
    });
    await this.chat.sincronizarSinFallar(idOrganizacion);
    await notificar(this.notifications, [idObjetivo], 'ORGANIZACION_ACTUALIZADA', {
      organizationName: nombre,
      organizationId: idOrganizacion,
      detail: 'Ya no formas parte de la organización.',
    });
  }

  async leave(userId: number, idOrganizacion: number) {
    await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertVisible(ctx);
      if (!ctx.rol) throw new ForbiddenException('No eres miembro de esta organización');
      if (ctx.rol === RolOrganizacion.PROPIETARIO) {
        throw new ForbiddenException('El propietario debe transferir la propiedad antes de salir');
      }
      await tx.usuarioOrganizacion.delete({
        where: { idUsuario_idOrganizacion: { idUsuario: userId, idOrganizacion } },
      });
      await auditar(tx, userId, 'ORG_MIEMBRO_SALIO', idOrganizacion, { rol: ctx.rol });
    });
    await this.chat.sincronizarSinFallar(idOrganizacion);
  }

  async transferOwnership(userId: number, idOrganizacion: number, idNuevoPropietario: number) {
    const { nombre } = await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, [RolOrganizacion.PROPIETARIO], 'Solo el propietario puede transferir la propiedad');
      assertActiva(ctx);
      if (idNuevoPropietario === userId) throw new BadRequestException('Ya eres el propietario');
      await this.miembroActivo(tx, idOrganizacion, idNuevoPropietario);
      // Primero se degrada al actual: el índice único admite un solo propietario activo.
      await tx.usuarioOrganizacion.update({
        where: { idUsuario_idOrganizacion: { idUsuario: userId, idOrganizacion } },
        data: { rolOrganizacion: RolOrganizacion.ADMINISTRADOR },
      });
      await tx.usuarioOrganizacion.update({
        where: { idUsuario_idOrganizacion: { idUsuario: idNuevoPropietario, idOrganizacion } },
        data: { rolOrganizacion: RolOrganizacion.PROPIETARIO },
      });
      await auditar(tx, userId, 'ORG_PROPIEDAD_TRANSFERIDA', idOrganizacion, { idPropietarioNuevo: idNuevoPropietario });
      return { nombre: ctx.org.nombreOrganizacion };
    });
    await notificar(this.notifications, [idNuevoPropietario], 'ORGANIZACION_ACTUALIZADA', {
      organizationName: nombre,
      organizationId: idOrganizacion,
      detail: 'Ahora eres el propietario de la organización.',
    });
    return { idPropietario: idNuevoPropietario };
  }

  async archive(userId: number, idOrganizacion: number) {
    const { nombre, miembros } = await this.prisma.$transaction(async (tx) => {
      await bloquearOrganizacion(tx, idOrganizacion);
      const ctx = await cargarContexto(tx, userId, idOrganizacion);
      assertRol(ctx, [RolOrganizacion.PROPIETARIO], 'Solo el propietario puede archivar la organización');
      if (ctx.org.estadoOrganizacion === EstadoOrganizacion.INACTIVA) {
        throw new ConflictException('La organización ya está archivada');
      }
      await tx.organizacion.update({ where: { idOrganizacion }, data: { estadoOrganizacion: EstadoOrganizacion.INACTIVA } });
      // Pendientes que ya no se pueden resolver.
      const cierre = { estado: EstadoInvitacionOrganizacion.CANCELADA, resueltaEn: new Date() };
      const pendiente = { idOrganizacion, estado: EstadoInvitacionOrganizacion.PENDIENTE };
      await tx.invitacionOrganizacion.updateMany({ where: pendiente, data: cierre });
      await tx.solicitudUnirseOrganizacion.updateMany({ where: pendiente, data: cierre });
      await auditar(tx, userId, 'ORG_ARCHIVADA', idOrganizacion);
      const miembros = await tx.usuarioOrganizacion.findMany({
        where: { idOrganizacion, estadoMembresia: EstadoMembresia.ACTIVA, idUsuario: { not: userId } },
        select: { idUsuario: true },
      });
      return { nombre: ctx.org.nombreOrganizacion, miembros: miembros.map((m) => m.idUsuario) };
    });
    await notificar(this.notifications, miembros, 'ORGANIZACION_ACTUALIZADA', {
      organizationName: nombre,
      organizationId: idOrganizacion,
      detail: 'La organización fue archivada: queda en solo lectura.',
    });
    return { idOrganizacion, archivada: true };
  }

  async auditLog(userId: number, idOrganizacion: number, { page = 1, limit = 20 }: { page?: number; limit?: number }) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador puede ver la bitácora');
    const where = { tipoObjeto: TIPO_OBJETO_ORGANIZACION, idObjeto: String(idOrganizacion) };
    const [data, total] = await Promise.all([
      this.prisma.bitacoraAuditoria.findMany({
        where,
        select: {
          idAuditoria: true,
          accion: true,
          detalleJson: true,
          fechaEvento: true,
          usuario: { select: USUARIO_SELECT },
        },
        orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bitacoraAuditoria.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  private async miembroActivo(tx: Prisma.TransactionClient, idOrganizacion: number, idUsuario: number) {
    const miembro = await tx.usuarioOrganizacion.findUnique({
      where: { idUsuario_idOrganizacion: { idUsuario, idOrganizacion } },
      select: { rolOrganizacion: true, estadoMembresia: true },
    });
    if (!miembro || miembro.estadoMembresia !== EstadoMembresia.ACTIVA) {
      throw new NotFoundException('El usuario no es miembro de la organización');
    }
    return miembro;
  }
}

function traducirNombreDuplicado(error: unknown): never {
  // El índice único sobre lower(nombre) gana la carrera entre dos creaciones simultáneas.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Ya existe una organización con ese nombre');
  }
  throw error;
}
