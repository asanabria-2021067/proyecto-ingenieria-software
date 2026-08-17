import { apiFetch } from '@/lib/api/client';
import type {
  CreateExitRequestInput,
  CurrentExitRequestDto,
  ExitPreparationSummaryDto,
  SolicitudSalidaDto,
  SolicitudSalidaTransicionDto,
} from '@/lib/types/exit-requests';

/** B5 — `POST /proyectos/:id/solicitudes-salida` (crea la solicitud en PREPARACION). */
export function createExitRequest(
  idProyecto: number,
  input: CreateExitRequestInput,
): Promise<SolicitudSalidaDto> {
  return apiFetch<SolicitudSalidaDto>(`/proyectos/${idProyecto}/solicitudes-salida`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * F11.1 — `GET /proyectos/:id/salida/estado`. Reader server-authoritative de
 * la solicitud abierta del actor (PREPARACION o PENDIENTE_LIDER, o
 * `solicitud: null`). Nunca lanza por "no existe" — a diferencia de B6, esa
 * ausencia es una respuesta 200 válida.
 */
export function getCurrentExitRequest(idProyecto: number): Promise<CurrentExitRequestDto> {
  return apiFetch<CurrentExitRequestDto>(`/proyectos/${idProyecto}/salida/estado`);
}

/** B6 — `GET /proyectos/:id/salida/preparacion` (read-model de blockers de la PREPARACION del actor). */
export function getExitPreparationSummary(idProyecto: number): Promise<ExitPreparationSummaryDto> {
  return apiFetch<ExitPreparationSummaryDto>(`/proyectos/${idProyecto}/salida/preparacion`);
}

/** B7 — `POST /proyectos/:id/salida/preparacion/continuar` (PREPARACION -> PENDIENTE_LIDER). */
export function continueExitPreparation(idProyecto: number): Promise<SolicitudSalidaTransicionDto> {
  return apiFetch<SolicitudSalidaTransicionDto>(`/proyectos/${idProyecto}/salida/preparacion/continuar`, {
    method: 'POST',
  });
}

/** B8 — `POST /proyectos/:id/salida/preparacion/cancelar` (PREPARACION -> CANCELADA). */
export function cancelExitPreparation(idProyecto: number): Promise<SolicitudSalidaTransicionDto> {
  return apiFetch<SolicitudSalidaTransicionDto>(`/proyectos/${idProyecto}/salida/preparacion/cancelar`, {
    method: 'POST',
  });
}

/** B9 — `POST /proyectos/:id/solicitudes-salida/:idSolicitud/aprobar` (PENDIENTE_LIDER -> APROBADA). */
export function approveExitRequest(idProyecto: number, idSolicitud: number): Promise<SolicitudSalidaDto> {
  return apiFetch<SolicitudSalidaDto>(
    `/proyectos/${idProyecto}/solicitudes-salida/${idSolicitud}/aprobar`,
    { method: 'POST' },
  );
}

/** B9 — `POST /proyectos/:id/solicitudes-salida/:idSolicitud/rechazar` (PENDIENTE_LIDER -> RECHAZADA). */
export function rejectExitRequest(idProyecto: number, idSolicitud: number): Promise<SolicitudSalidaDto> {
  return apiFetch<SolicitudSalidaDto>(
    `/proyectos/${idProyecto}/solicitudes-salida/${idSolicitud}/rechazar`,
    { method: 'POST' },
  );
}
