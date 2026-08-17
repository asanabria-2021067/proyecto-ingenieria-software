/**
 * Contratos del dominio `exit-requests` (B5-B9,
 * apps/backend/src/exit-requests/exit-requests.service.ts). Reflejan
 * exactamente las filas/objetos que devuelve cada endpoint — ninguno de
 * estos métodos usa un DTO de respuesta dedicado, así que estos tipos
 * describen la forma real de lo que Prisma/el service retornan.
 */

import type { EstadoTarea } from '@/lib/types/tasks';

/**
 * Espejo exacto de `EstadoSolicitudSalida` (schema.prisma:600). No
 * reintroducir `PENDIENTE` (estado histórico ya reemplazado) ni inventar
 * `BORRADOR`/`EN_REVISION`/`FINALIZADA`.
 */
export type EstadoSolicitudSalida =
  | 'PREPARACION'
  | 'PENDIENTE_LIDER'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'CANCELADA';

/**
 * Fila completa de `SolicitudSalidaProyecto` (schema.prisma:595-611). Forma
 * devuelta por `createSolicitudSalida` (fila cruda de `create`) y por
 * `approveSolicitudSalida`/`rejectSolicitudSalida` (`{ ...solicitud,
 * estadoSolicitud, resueltaEn, resueltaPor }`, mismo conjunto de campos).
 */
export interface SolicitudSalidaDto {
  idSolicitud: number;
  idProyecto: number;
  idUsuario: number;
  motivo: string;
  estadoSolicitud: EstadoSolicitudSalida;
  solicitadaEn: string;
  resueltaEn: string | null;
  resueltaPor: number | null;
}

/**
 * Forma devuelta por `continueExitPreparation`/`cancelExitPreparation`
 * (exit-requests.service.ts:179-186, 230-237): un objeto construido a mano
 * que nunca incluye `resueltaEn`/`resueltaPor` (esas transiciones no
 * resuelven la solicitud, solo la mueven dentro de PREPARACION).
 */
export interface SolicitudSalidaTransicionDto {
  idSolicitud: number;
  idProyecto: number;
  idUsuario: number;
  motivo: string;
  solicitadaEn: string;
  estadoSolicitud: EstadoSolicitudSalida;
}

/** Body de `POST /proyectos/:id/solicitudes-salida` (`CreateSolicitudSalidaDto`). */
export interface CreateExitRequestInput {
  motivo: string;
}

/**
 * Una `AsignacionTarea` vigente que bloquea continuar la preparación
 * (exit-requests.service.ts:104-118, B6). `estadoPreparacion` es un campo
 * calculado por el backend a partir de `tieneHoras`/`tieneAvance` — el
 * frontend nunca lo recalcula.
 */
export interface ExitPreparationBlockerDto {
  idAsignacion: number;
  idTarea: number;
  tituloTarea: string;
  estadoTarea: EstadoTarea;
  fechaAsignacion: string;
  horasReales: number | null;
  tieneHoras: boolean;
  tieneAvance: boolean;
  estadoPreparacion: 'COMPLETA' | 'PENDIENTE';
}

/**
 * Subconjunto de `SolicitudSalidaDto` que expone `getExitPreparationSummary`
 * (exit-requests.service.ts:67-74, solo `select` de esos 5 campos — nunca
 * `motivo`/`resueltaEn`/`resueltaPor`).
 */
export interface ExitPreparationSolicitudDto {
  idSolicitud: number;
  idProyecto: number;
  idUsuario: number;
  estadoSolicitud: EstadoSolicitudSalida;
  solicitadaEn: string;
}

/**
 * `ExitPreparationSummary` (B6) — `GET /proyectos/:id/salida/preparacion`.
 * Read-model completo: el frontend no recalcula `cantidadBlockers` ni
 * `puedeContinuar` a partir de `blockers`, los consume tal cual.
 */
export interface ExitPreparationSummaryDto {
  solicitud: ExitPreparationSolicitudDto;
  blockers: ExitPreparationBlockerDto[];
  cantidadBlockers: number;
  puedeContinuar: boolean;
}

/**
 * Estados que cuentan como "solicitud abierta" para
 * `getSolicitudSalidaAbierta` (F11.1) — nunca `APROBADA`/`RECHAZADA`/
 * `CANCELADA`, que ese reader trata como ausencia de solicitud.
 */
export type EstadoSolicitudSalidaAbierta = 'PREPARACION' | 'PENDIENTE_LIDER';

/**
 * Forma exacta que devuelve `getSolicitudSalidaAbierta`
 * (exit-requests.service.ts, F11.1): mismo `select` de 6 campos que B6 más
 * `motivo`, nunca `resueltaEn`/`resueltaPor` (una solicitud abierta, por
 * definición, todavía no fue resuelta).
 */
export interface SolicitudSalidaAbiertaDto {
  idSolicitud: number;
  idProyecto: number;
  idUsuario: number;
  motivo: string;
  solicitadaEn: string;
  estadoSolicitud: EstadoSolicitudSalidaAbierta;
}

/**
 * `GET /proyectos/:id/salida/estado` (F11.1) — reader aditivo y
 * server-authoritative de la solicitud ABIERTA (`PREPARACION` o
 * `PENDIENTE_LIDER`) del actor en el proyecto. `solicitud: null` es un
 * resultado de lectura válido (nunca un error) cuando no existe ninguna.
 * Distinto de `ExitPreparationSummaryDto`: sin `blockers`, sin
 * `puedeContinuar` — ese sigue siendo trabajo exclusivo de B6.
 */
export interface CurrentExitRequestDto {
  solicitud: SolicitudSalidaAbiertaDto | null;
}
