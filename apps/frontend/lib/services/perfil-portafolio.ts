import { apiFetch } from '@/lib/api/client';

/** MEJ-146: `GET /perfil/me/portafolio`. El token solo lo ve su dueño. */
export interface PortafolioEstado {
  activo: boolean;
  indexable: boolean;
  token: string | null;
}

/** MEJ-146: contenido de `/portafolio/:token` (lista blanca del backend, sin correo, carné, teléfono ni horas). */
export interface PortafolioPublico {
  nombre: string;
  carrera: string | null;
  habilidades: { nombre: string; nivel: string; confirmaciones: number }[];
  proyectos: { titulo: string; rol: string }[];
  indexable: boolean;
}

/** MEJ-147: `GET /perfil/:id/habilidades`. */
export interface HabilidadConfirmable {
  idHabilidad: number;
  nombre: string;
  nivel: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
  confirmaciones: number;
  confirmadaPorMi: boolean;
  puedoConfirmar: boolean;
}

/** MEJ-148: dia 0 = lunes a 6 = domingo; hora 0-23 (inicio del bloque de 1 hora). */
export interface BloqueDisponible {
  dia: number;
  hora: number;
}

export interface DisponibilidadSemanal {
  zonaHoraria: string;
  bloques: BloqueDisponible[];
}

/** MEJ-149 */
export interface EnlacePerfil {
  idEnlace: number;
  url: string;
  tipo: 'GITHUB' | 'LINKEDIN' | 'BEHANCE' | 'SITIO';
  titulo: string | null;
  sitio: string;
}

/** MEJ-150: cifras propias del semestre actual. */
export interface ResumenSemestre {
  semestre: { anio: number; periodo: 1 | 2 };
  horasAcreditadas: number;
  proyectos: number;
  tareasCompletadas: number;
  reconocimientos: number;
  insignias: { clave: string; nombre: string; nivel: string | null }[];
}

export const getPortafolioEstado = () => apiFetch<PortafolioEstado>('/perfil/me/portafolio');

export const actualizarPortafolio = (cambios: { activo?: boolean; indexable?: boolean }) =>
  apiFetch<PortafolioEstado>('/perfil/me/portafolio', { method: 'PUT', body: JSON.stringify(cambios) });

export const regenerarPortafolio = () => apiFetch<PortafolioEstado>('/perfil/me/portafolio/regenerar', { method: 'POST' });

export const getHabilidadesConfirmables = (id: number) => apiFetch<HabilidadConfirmable[]>(`/perfil/${id}/habilidades`);

export const confirmarHabilidad = (id: number, idHabilidad: number) =>
  apiFetch<{ ok: true }>(`/perfil/${id}/habilidades/${idHabilidad}/confirmacion`, { method: 'PUT' });

export const retirarConfirmacion = (id: number, idHabilidad: number) =>
  apiFetch<{ ok: true }>(`/perfil/${id}/habilidades/${idHabilidad}/confirmacion`, { method: 'DELETE' });

export const getDisponibilidad = (id: number) => apiFetch<DisponibilidadSemanal>(`/perfil/${id}/disponibilidad`);

export const guardarDisponibilidad = (bloques: BloqueDisponible[]) =>
  apiFetch<DisponibilidadSemanal>('/perfil/me/disponibilidad', { method: 'PUT', body: JSON.stringify({ bloques }) });

export const getEnlacesPerfil = (id: number) => apiFetch<EnlacePerfil[]>(`/perfil/${id}/enlaces`);

export const guardarEnlacesPerfil = (urls: string[]) =>
  apiFetch<EnlacePerfil[]>('/perfil/me/enlaces', { method: 'PUT', body: JSON.stringify({ urls }) });

export const getResumenSemestre = () => apiFetch<ResumenSemestre>('/perfil/me/semestre');

/** MEJ-142: disponibilidad de varias personas por día; solo horas libres, nunca el detalle de un evento ajeno. */
export interface AsistenteReuniones {
  zonaHoraria: string;
  horaInicio: number;
  horaFin: number;
  fechas: string[];
  personas: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    fotoUrl: string | null;
    esYo: boolean;
    sinDisponibilidad: boolean;
    dias: { fecha: string; libres: number[]; /** Solo en la propia persona. */ fechaLimite?: boolean }[];
  }[];
  sugerencias: { fecha: string; horaInicio: number; horaFin: number }[];
}

export const getAsistenteReuniones = (p: { invitados: number[]; desde?: string; dias?: number; horas?: number }) => {
  const q = new URLSearchParams({ invitados: p.invitados.join(',') });
  if (p.desde) q.set('desde', p.desde);
  if (p.dias) q.set('dias', String(p.dias));
  if (p.horas) q.set('horas', String(p.horas));
  return apiFetch<AsistenteReuniones>(`/perfil/asistente-reuniones?${q.toString()}`);
};

/** MEJ-152 */
export interface PersonaParecida {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  carrera: string | null;
  proyectosParecidos: number;
  ejemploProyecto: string;
  interesesEnComun: number;
}

export const getPersonasParecidas = (id: number) => apiFetch<PersonaParecida[]>(`/perfil/${id}/personas-parecidas`);

/** MEJ-153 */
export interface PersonaRestringida {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}
export interface Restricciones {
  bloqueados: PersonaRestringida[];
  silenciados: PersonaRestringida[];
}
export type TipoRestriccion = 'bloqueo' | 'silencio';

export const getRestricciones = () => apiFetch<Restricciones>('/restricciones');
export const aplicarRestriccion = (tipo: TipoRestriccion, idObjetivo: number) =>
  apiFetch<Restricciones>(`/restricciones/${tipo}/${idObjetivo}`, { method: 'PUT' });
export const quitarRestriccion = (tipo: TipoRestriccion, idObjetivo: number) =>
  apiFetch<Restricciones>(`/restricciones/${tipo}/${idObjetivo}`, { method: 'DELETE' });

/** MEJ-154 */
export type MotivoReportePerfil = 'SPAM' | 'ACOSO' | 'CONTENIDO_INAPROPIADO' | 'SUPLANTACION' | 'OTRO';
export type EstadoReportePerfil = 'PENDIENTE' | 'DESCARTADO' | 'ATENDIDO';

export const MOTIVOS_REPORTE: { valor: MotivoReportePerfil; etiqueta: string }[] = [
  { valor: 'SPAM', etiqueta: 'Spam o publicidad' },
  { valor: 'ACOSO', etiqueta: 'Acoso o trato irrespetuoso' },
  { valor: 'CONTENIDO_INAPROPIADO', etiqueta: 'Contenido inapropiado' },
  { valor: 'SUPLANTACION', etiqueta: 'Suplantación de identidad' },
  { valor: 'OTRO', etiqueta: 'Otro motivo' },
];

export interface ReportePerfil {
  idReporte: number;
  motivo: MotivoReportePerfil;
  detalle: string | null;
  idMensaje: number | null;
  textoMensaje: string | null;
  estado: EstadoReportePerfil;
  nota: string | null;
  creadoEn: string;
  resueltoEn: string | null;
  reportante: { idUsuario: number; nombre: string; apellido: string };
  reportado: { idUsuario: number; nombre: string; apellido: string };
}

export const reportarPerfil = (p: { idReportado: number; idMensaje?: number; motivo: MotivoReportePerfil; detalle?: string }) =>
  apiFetch<{ mensaje: string }>('/reportes-perfil', { method: 'POST', body: JSON.stringify(p) });
export const listarReportesPerfil = (estado: EstadoReportePerfil) =>
  apiFetch<ReportePerfil[]>(`/admin/reportes-perfil?estado=${estado}`);
export const resolverReportePerfil = (idReporte: number, accion: 'descartar' | 'actuar', nota?: string) =>
  apiFetch<{ idReporte: number; estado: EstadoReportePerfil }>(`/admin/reportes-perfil/${idReporte}`, {
    method: 'PATCH',
    body: JSON.stringify({ accion, nota }),
  });

/** MEJ-102 */
export interface BienvenidaProyecto {
  mensaje: string | null;
  porDefecto: string;
}
export const getBienvenida = (idProyecto: number) => apiFetch<BienvenidaProyecto>(`/proyectos/${idProyecto}/mensaje-bienvenida`);
export const guardarBienvenida = (idProyecto: number, mensaje: string | null) =>
  apiFetch<BienvenidaProyecto>(`/proyectos/${idProyecto}/mensaje-bienvenida`, { method: 'PUT', body: JSON.stringify({ mensaje }) });
