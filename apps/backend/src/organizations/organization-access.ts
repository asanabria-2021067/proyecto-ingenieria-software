import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { EstadoMembresia, EstadoOrganizacion, Prisma, RolOrganizacion, VisibilidadOrganizacion } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { NotificationTemplateData, NotificationTemplateKey } from '../notifications/templates/notification.templates';

type Db = Prisma.TransactionClient | PrismaService;

export const USUARIO_SELECT = { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } as const;

export const DIAS_VENCIMIENTO = 14;

export const venceEnDesde = (ahora: Date = new Date()): Date =>
  new Date(ahora.getTime() + DIAS_VENCIMIENTO * 24 * 60 * 60 * 1000);

/** Crean y editan proyectos a nombre de la organización. */
export const ROLES_PUBLICAN: readonly RolOrganizacion[] = [
  RolOrganizacion.PROPIETARIO,
  RolOrganizacion.ADMINISTRADOR,
  RolOrganizacion.EDITOR,
];

/** Invitan, quitan miembros, resuelven solicitudes y editan los datos. */
export const ROLES_GESTION: readonly RolOrganizacion[] = [RolOrganizacion.PROPIETARIO, RolOrganizacion.ADMINISTRADOR];

/** Roles que se pueden otorgar: el Propietario no se asigna, solo se transfiere. */
export const ROLES_ASIGNABLES = [RolOrganizacion.ADMINISTRADOR, RolOrganizacion.EDITOR, RolOrganizacion.LECTURA] as const;

export interface ContextoOrganizacion {
  org: {
    idOrganizacion: number;
    nombreOrganizacion: string;
    estadoOrganizacion: EstadoOrganizacion;
    visibilidad: VisibilidadOrganizacion;
  };
  /** Rol activo del usuario; `null` si no es miembro. */
  rol: RolOrganizacion | null;
}

export async function cargarContexto(db: Db, userId: number, idOrganizacion: number): Promise<ContextoOrganizacion> {
  const org = await db.organizacion.findUnique({
    where: { idOrganizacion },
    select: { idOrganizacion: true, nombreOrganizacion: true, estadoOrganizacion: true, visibilidad: true },
  });
  if (!org) throw new NotFoundException('Organización no encontrada');
  const membresia = await db.usuarioOrganizacion.findUnique({
    where: { idUsuario_idOrganizacion: { idUsuario: userId, idOrganizacion } },
    select: { rolOrganizacion: true, estadoMembresia: true },
  });
  const rol = membresia?.estadoMembresia === EstadoMembresia.ACTIVA ? membresia.rolOrganizacion : null;
  return { org, rol };
}

/** Una privada no revela su existencia a quien no es miembro. */
export function assertVisible({ org, rol }: ContextoOrganizacion): void {
  if (!rol && org.visibilidad === VisibilidadOrganizacion.PRIVADA) throw new NotFoundException('Organización no encontrada');
}

export function assertRol(ctx: ContextoOrganizacion, permitidos: readonly RolOrganizacion[], mensaje: string): RolOrganizacion {
  assertVisible(ctx);
  if (!ctx.rol || !permitidos.includes(ctx.rol)) throw new ForbiddenException(mensaje);
  return ctx.rol;
}

export function assertActiva({ org }: ContextoOrganizacion): void {
  if (org.estadoOrganizacion !== EstadoOrganizacion.ACTIVA) {
    throw new ForbiddenException('La organización está archivada: solo se puede consultar');
  }
}

/** Serializa los cambios de una organización dentro de la transacción. */
export async function bloquearOrganizacion(tx: Prisma.TransactionClient, idOrganizacion: number): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "organizacion" WHERE "id_organizacion" = ${idOrganizacion} FOR UPDATE`;
}

/**
 * Publicar a nombre de organizaciones: Propietario, Administrador o Editor
 * activo de cada una, y que no esté archivada. Todo fallo responde igual para
 * no revelar organizaciones ajenas.
 */
export async function assertPuedePublicar(db: Db, userId: number, idsOrganizacion: number[]): Promise<void> {
  const ids = [...new Set(idsOrganizacion)];
  if (ids.length === 0) return;
  const validas = await db.usuarioOrganizacion.count({
    where: {
      idUsuario: userId,
      idOrganizacion: { in: ids },
      estadoMembresia: EstadoMembresia.ACTIVA,
      rolOrganizacion: { in: [...ROLES_PUBLICAN] },
      organizacion: { estadoOrganizacion: EstadoOrganizacion.ACTIVA },
    },
  });
  if (validas !== ids.length) {
    throw new ForbiddenException('No puedes publicar a nombre de esta organización');
  }
}

/** Propietario, Administrador o Editor activo de una organización activa dueña del proyecto. */
export async function puedeEditarComoOrganizacion(db: Db, idProyecto: number, userId: number): Promise<boolean> {
  const miembro = await db.usuarioOrganizacion.count({
    where: {
      idUsuario: userId,
      estadoMembresia: EstadoMembresia.ACTIVA,
      rolOrganizacion: { in: [...ROLES_PUBLICAN] },
      organizacion: { estadoOrganizacion: EstadoOrganizacion.ACTIVA, proyectos: { some: { idProyecto } } },
    },
  });
  return miembro > 0;
}

/**
 * Miembro activo de alguna organización dueña del proyecto: lo ve en solo
 * lectura aunque no participe. Nunca autoriza escritura.
 */
export async function esMiembroDeOrganizacionDelProyecto(db: Db, idProyecto: number, userId: number): Promise<boolean> {
  const miembro = await db.usuarioOrganizacion.count({
    where: {
      idUsuario: userId,
      estadoMembresia: EstadoMembresia.ACTIVA,
      organizacion: { proyectos: { some: { idProyecto } } },
    },
  });
  return miembro > 0;
}

/** Entrada de la bitácora de auditoría de la organización, en la misma transacción del cambio. */
export function auditar(
  tx: Prisma.TransactionClient,
  idActor: number,
  accion: string,
  idOrganizacion: number,
  detalle: Prisma.InputJsonValue = {},
) {
  return tx.bitacoraAuditoria.create({
    data: {
      idUsuario: idActor,
      accion,
      tipoObjeto: TIPO_OBJETO_ORGANIZACION,
      idObjeto: String(idOrganizacion),
      detalleJson: detalle,
    },
  });
}

export const TIPO_OBJETO_ORGANIZACION = 'ORGANIZACION';

const logger = new Logger('Organizaciones');

/** Los avisos salen después del commit y nunca revierten ni rompen la operación principal. */
export async function notificar<K extends NotificationTemplateKey>(
  notifications: NotificationsService,
  userIds: number[],
  key: K,
  data: NotificationTemplateData[K],
): Promise<void> {
  try {
    await notifications.notifyFromTemplate(userIds, key, data);
  } catch (error) {
    logger.warn(`No se pudo notificar (${key}): ${String(error)}`);
  }
}
