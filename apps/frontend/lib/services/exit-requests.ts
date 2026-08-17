import { apiFetch } from '@/lib/api/client';
import type {
  CreateExitRequestInput,
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
