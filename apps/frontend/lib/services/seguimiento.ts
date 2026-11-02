import { apiFetch, apiFetchBlob } from '@/lib/api/client';

export type ColorSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface HitoAtrasadoDTO {
  idHito: number;
  tituloHito: string;
  fechaLimite: string;
  diasAtraso: number;
}

/** `GET /proyectos/:id/seguimiento` (MEJ-54/55). */
export interface SeguimientoProyectoDTO {
  semaforo: {
    color: ColorSemaforo;
    motivos: string[];
    ayuda: Record<ColorSemaforo, string>;
  };
  hitosAtrasados: HitoAtrasadoDTO[];
}

export interface PersonaDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

/** `GET /proyectos/:id/resultados` (MEJ-56). */
export interface ResultadosProyectoDTO {
  proyecto: {
    idProyecto: number;
    tituloProyecto: string;
    descripcionProyecto: string;
    tipoProyecto: string;
    fechaInicio: string | null;
    fechaFinEstimada: string | null;
    fechaCierre: string | null;
    lider: { nombre: string; apellido: string };
    asociacion: { idAsociacion: number; nombre: string } | null;
    organizaciones: { idOrganizacion: number; nombreOrganizacion: string }[];
  };
  metricas: {
    integrantes: number;
    tareasTotales: number;
    tareasHechas: number;
    hitosTotales: number;
    hitosCompletados: number;
    sprintsCerrados: number;
    horasAcreditadas: number;
    reconocimientos: number;
  };
  hitos: { idHito: number; tituloHito: string; fechaLimite: string | null; completado: boolean }[];
  sprints: {
    numero: number;
    tareasPlanificadasCierre: number | null;
    tareasCompletadasCierre: number | null;
    porcentajeCumplimientoCierre: number | null;
  }[];
  equipo: (PersonaDTO & { roles: string[]; horasAcreditadas: number })[];
}

/** Fila del portafolio de una organización o asociación (MEJ-56). */
export interface ProyectoCerradoResumenDTO {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  fechaInicio: string | null;
  fechaCierre: string | null;
  integrantes: number;
  tareasHechas: number;
  horasAcreditadas: number;
}

export interface ReconocimientoDTO {
  idReconocimiento: number;
  mensaje: string;
  creadoEn: string;
  autor: PersonaDTO;
  receptor: PersonaDTO;
}

export interface ReconocimientosSprintDTO {
  reconocimientos: ReconocimientoDTO[];
  yaReconoci: boolean;
}

export interface RetrospectivaDTO {
  quePaso: string;
  quePodriaMejorar: string;
  acuerdos: string;
  actualizadaEn: string;
}

export type RetrospectivaInput = Pick<RetrospectivaDTO, 'quePaso' | 'quePodriaMejorar' | 'acuerdos'>;

export function getSeguimientoProyecto(idProyecto: number): Promise<SeguimientoProyectoDTO> {
  return apiFetch<SeguimientoProyectoDTO>(`/proyectos/${idProyecto}/seguimiento`);
}

export function getResultadosProyecto(idProyecto: number): Promise<ResultadosProyectoDTO> {
  return apiFetch<ResultadosProyectoDTO>(`/proyectos/${idProyecto}/resultados`);
}

export function getPortafolioOrganizacion(idOrganizacion: number): Promise<ProyectoCerradoResumenDTO[]> {
  return apiFetch<ProyectoCerradoResumenDTO[]>(`/organizaciones/${idOrganizacion}/portafolio`);
}

export function getPortafolioAsociacion(idAsociacion: number): Promise<ProyectoCerradoResumenDTO[]> {
  return apiFetch<ProyectoCerradoResumenDTO[]>(`/asociaciones/${idAsociacion}/portafolio`);
}

export function getReconocimientosSprint(idProyecto: number, idSprint: number): Promise<ReconocimientosSprintDTO> {
  return apiFetch<ReconocimientosSprintDTO>(`/proyectos/${idProyecto}/sprints/${idSprint}/reconocimientos`);
}

export function createReconocimiento(
  idProyecto: number,
  idSprint: number,
  input: { idReceptor: number; mensaje: string },
): Promise<unknown> {
  return apiFetch(`/proyectos/${idProyecto}/sprints/${idSprint}/reconocimientos`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getRetrospectivaSprint(idProyecto: number, idSprint: number): Promise<RetrospectivaDTO | null> {
  return apiFetch<RetrospectivaDTO | null>(`/proyectos/${idProyecto}/sprints/${idSprint}/retrospectiva`);
}

export function saveRetrospectivaSprint(
  idProyecto: number,
  idSprint: number,
  input: RetrospectivaInput,
): Promise<RetrospectivaDTO> {
  return apiFetch<RetrospectivaDTO>(`/proyectos/${idProyecto}/sprints/${idSprint}/retrospectiva`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** MEJ-23 - `GET /proyectos/:id/sprints/:sprintId/reporte/csv`. */
export function fetchSprintReportCsv(idProyecto: number, idSprint: number): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/sprints/${idSprint}/reporte/csv`, {
    headers: { Accept: 'text/csv' },
  });
}

/** MEJ-23 - `GET /proyectos/:id/sprints/:sprintId/reporte/pdf`. */
export function fetchSprintReportPdf(idProyecto: number, idSprint: number): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/sprints/${idSprint}/reporte/pdf`);
}
