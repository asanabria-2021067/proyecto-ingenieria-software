import { apiFetch } from '@/lib/api/client';

export const MOTIVO_BAJA_MIN = 10;
export const MOTIVO_BAJA_MAX = 500;

/** GET /proyectos/:id/carga-equipo: líder, administrador y coordinador en su alcance. */
export interface CargaEquipo {
  semana: { desde: string; hasta: string };
  sprintActivo: { idSprint: number; numero: number } | null;
  integrantes: Array<{
    idUsuario: number;
    nombre: string;
    apellido: string;
    tareasAbiertas: number;
    horasSemana: number;
    horasSprint: number;
  }>;
}

export interface BajaIntegranteResultado {
  idProyecto: number;
  idUsuario: number;
  estadoParticipacion: 'RETIRADO';
  participacionesRetiradas: number;
  tareasSinAsignar: number;
  fechaSalida: string;
}

export const getCargaEquipo = (idProyecto: number) => apiFetch<CargaEquipo>(`/proyectos/${idProyecto}/carga-equipo`);

/** POST /proyectos/:id/equipo/:idUsuario/baja: solo administrador o coordinador en su alcance. */
export const darDeBajaIntegrante = (idProyecto: number, idUsuario: number, motivo: string) =>
  apiFetch<BajaIntegranteResultado>(`/proyectos/${idProyecto}/equipo/${idUsuario}/baja`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
