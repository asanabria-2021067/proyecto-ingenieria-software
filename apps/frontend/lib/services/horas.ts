import { apiFetch } from '@/lib/api/client';

/**
 * Capa de servicio de horas/cierre de participación (T-115/T-116).
 * Refleja el contrato real de `HorasController`
 * (apps/backend/src/horas/horas.controller.ts), montado en
 * `proyectos/:projectId/participaciones/:participacionId/horas`. Mismo
 * patrón que `lib/services/roles.ts`.
 */

export interface DesgloseTareaDTO {
  idTarea: number;
  tituloTarea: string;
  horas: number;
}

export interface DesgloseHorasDTO {
  idParticipacion: number;
  usuario: { nombre: string; apellido: string };
  horasCalculadas: number;
  tareas: DesgloseTareaDTO[];
}

export interface CerrarParticipacionInput {
  horasReconocidas?: number;
  justificacion?: string;
}

export interface CerrarParticipacionResultDTO {
  idParticipacion: number;
  estadoParticipacion: 'COMPLETADO';
  horasCalculadas: number;
  horasReconocidas: number;
  justificacionAjuste: string | null;
}

export function getDesgloseHoras(
  idProyecto: number,
  idParticipacion: number,
): Promise<DesgloseHorasDTO> {
  return apiFetch<DesgloseHorasDTO>(
    `/proyectos/${idProyecto}/participaciones/${idParticipacion}/horas/desglose`,
  );
}

export function cerrarParticipacion(
  idProyecto: number,
  idParticipacion: number,
  input: CerrarParticipacionInput,
): Promise<CerrarParticipacionResultDTO> {
  return apiFetch<CerrarParticipacionResultDTO>(
    `/proyectos/${idProyecto}/participaciones/${idParticipacion}/horas/cerrar`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
