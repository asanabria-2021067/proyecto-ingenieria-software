import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  Prisma,
  TipoProyecto,
  type EstadoParticipacion,
  type EstadoProyecto,
  type EstadoSprint,
  type EstadoTarea,
  type OrigenReporteTramo,
} from '@prisma/client';

/**
 * Fixtures genéricas de infraestructura para el harness de integración
 * PostgreSQL (T15). Cada helper crea explícitamente un único registro vía el
 * `PrismaClient` recibido por parámetro — sin conexión propia, sin estado
 * compartido entre invocaciones y sin depender de `prisma/seed`. El cleanup
 * (T16) y las suites de negocio (T18+) son responsabilidad de otras capas.
 */

interface IntegrationUserOverrides {
  correo?: string;
  contrasena?: string;
  nombre?: string;
  apellido?: string;
}

export async function createIntegrationUser(
  prisma: PrismaClient,
  overrides: IntegrationUserOverrides = {},
) {
  return prisma.usuario.create({
    data: {
      correo: overrides.correo ?? `integration-${randomUUID()}@example.test`,
      contrasena: overrides.contrasena ?? 'integration-test-hash',
      nombre: overrides.nombre ?? 'Integration',
      apellido: overrides.apellido ?? 'User',
    },
  });
}

interface IntegrationProjectOverrides {
  tituloProyecto?: string;
  descripcionProyecto?: string;
  tipoProyecto?: TipoProyecto;
  /** S7: estado inicial explícito (por defecto el del schema, BORRADOR); las rutas de escritura operativas exigen P/E. */
  estadoProyecto?: EstadoProyecto;
}

export async function createIntegrationProject(
  prisma: PrismaClient,
  creadoPor: number,
  overrides: IntegrationProjectOverrides = {},
) {
  return prisma.proyecto.create({
    data: {
      tituloProyecto: overrides.tituloProyecto ?? `Integration Project ${randomUUID()}`,
      descripcionProyecto:
        overrides.descripcionProyecto ?? 'Proyecto de integración generado por fixtures de test.',
      tipoProyecto: overrides.tipoProyecto ?? TipoProyecto.ACADEMICO_HORAS_BECA,
      creadoPor,
      ...(overrides.estadoProyecto !== undefined ? { estadoProyecto: overrides.estadoProyecto } : {}),
    },
  });
}

interface IntegrationProjectRoleOverrides {
  nombreRol?: string;
  cupos?: number;
}

export async function createIntegrationProjectRole(
  prisma: PrismaClient,
  idProyecto: number,
  overrides: IntegrationProjectRoleOverrides = {},
) {
  return prisma.rolProyecto.create({
    data: {
      idProyecto,
      nombreRol: overrides.nombreRol ?? `Rol ${randomUUID()}`,
      cupos: overrides.cupos ?? 1,
    },
  });
}

interface IntegrationParticipationOverrides {
  estadoParticipacion?: EstadoParticipacion;
}

export async function createIntegrationParticipation(
  prisma: PrismaClient,
  idUsuario: number,
  idRolProyecto: number,
  overrides: IntegrationParticipationOverrides = {},
) {
  return prisma.participacionProyecto.create({
    data: {
      idUsuario,
      idRolProyecto,
      ...(overrides.estadoParticipacion !== undefined
        ? { estadoParticipacion: overrides.estadoParticipacion }
        : {}),
    },
  });
}

interface IntegrationSprintOverrides {
  numero?: number;
  estado?: EstadoSprint;
}

/**
 * FND-08: Tarea.idSprint es obligatoria desde FND-03, así que toda
 * createIntegrationTask necesita un Sprint real del mismo proyecto — de ahí
 * este fixture. `numero` por defecto es 1 (no implementa MAX(numero)+1, eso
 * es lógica de producto futura); `estado` por defecto ACTIVO, coherente con
 * el uso típico de un fixture de test (proyecto de trabajo abierto).
 */
export async function createIntegrationSprint(
  prisma: PrismaClient,
  idProyecto: number,
  overrides: IntegrationSprintOverrides = {},
) {
  return prisma.sprint.create({
    data: {
      idProyecto,
      numero: overrides.numero ?? 1,
      ...(overrides.estado !== undefined ? { estado: overrides.estado } : {}),
    },
  });
}

interface IntegrationTaskOverrides {
  tituloTarea?: string;
  estadoTarea?: EstadoTarea;
  idRolProyecto?: number | null;
}

/**
 * `idSprint` es un parámetro explícito obligatorio (no un override opcional)
 * desde FND-08: Tarea.idSprint es NOT NULL desde FND-03, así que el llamador
 * siempre debe resolver/crear un Sprint del mismo proyecto primero (ver
 * `createIntegrationSprint`) — este fixture nunca crea un Sprint implícito
 * por su cuenta, para que el caller mantenga el control total del scope de
 * limpieza.
 */
export async function createIntegrationTask(
  prisma: PrismaClient,
  idProyecto: number,
  creadaPor: number,
  idSprint: number,
  overrides: IntegrationTaskOverrides = {},
) {
  return prisma.tarea.create({
    data: {
      idProyecto,
      creadaPor,
      idSprint,
      tituloTarea: overrides.tituloTarea ?? `Tarea ${randomUUID()}`,
      ...(overrides.estadoTarea !== undefined ? { estadoTarea: overrides.estadoTarea } : {}),
      ...(overrides.idRolProyecto !== undefined ? { idRolProyecto: overrides.idRolProyecto } : {}),
    },
  });
}

interface IntegrationTaskAssignmentOverrides {
  idParticipacion?: number;
  desasignadaEn?: Date | null;
  horasReales?: Prisma.Decimal | string | number | null;
  origenReporte?: OrigenReporteTramo;
  reconocidoEn?: Date | null;
}

/**
 * Los overrides existen porque las suites de tiempo del Sprint 7 necesitan
 * tramos cerrados, consumidos o de origen distinto de GRANULAR como punto de
 * partida: son estados que el producto alcanza por sus propias rutas, y
 * fabricarlos a mano en cada suite duplicaría el mismo `update` posterior.
 */
export async function createIntegrationTaskAssignment(
  prisma: PrismaClient,
  idTarea: number,
  idUsuario: number,
  asignadoPor: number,
  overrides: IntegrationTaskAssignmentOverrides = {},
) {
  return prisma.asignacionTarea.create({
    data: {
      idTarea,
      idUsuario,
      asignadoPor,
      ...(overrides.idParticipacion !== undefined ? { idParticipacion: overrides.idParticipacion } : {}),
      ...(overrides.desasignadaEn !== undefined ? { desasignadaEn: overrides.desasignadaEn } : {}),
      ...(overrides.horasReales !== undefined ? { horasReales: overrides.horasReales } : {}),
      ...(overrides.origenReporte !== undefined ? { origenReporte: overrides.origenReporte } : {}),
      ...(overrides.reconocidoEn !== undefined ? { reconocidoEn: overrides.reconocidoEn } : {}),
    },
  });
}
