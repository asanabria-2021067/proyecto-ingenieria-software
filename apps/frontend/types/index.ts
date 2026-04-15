export type EstadoProyecto =
  | 'BORRADOR'
  | 'EN_REVISION'
  | 'OBSERVADO'
  | 'PUBLICADO'
  | 'EN_PROGRESO'
  | 'EN_SOLICITUD_CIERRE'
  | 'CERRADO'
  | 'CANCELADO';

export type EstadoRevisionProyecto = 'PENDIENTE' | 'APROBADA' | 'OBSERVADA';

export type RevisionProyecto = {
  idRevisionProyecto: number;
  estadoRevision: EstadoRevisionProyecto;
  comentarioRevision: string | null;
  numeroEnvio: number;
  enviadaEn: string;
  revisadaEn: string | null;
  revisor?: { idUsuario: number; nombre: string; apellido: string } | null;
};
export type TipoProyecto =
  | 'ACADEMICO_HORAS_BECA'
  | 'ACADEMICO_EXPERIENCIA'
  | 'EXTRACURRICULAR_EXTENSION';
export type ModalidadProyecto = 'PRESENCIAL' | 'VIRTUAL' | 'MIXTA';
export type EstadoPostulacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
export type NivelHabilidad = 'BASICO' | 'INTERMEDIO' | 'AVANZADO';

export type Habilidad = { nombreHabilidad: string };
export type Requisito = {
  nivelMinimo: NivelHabilidad;
  obligatorio: boolean;
  habilidad: Habilidad;
};
export type Rol = {
  idRolProyecto: number;
  nombreRol: string;
  descripcionRolProyecto?: string;
  cupos: number;
  horasSemanalesEstimadas?: number;
  carreraRequerida?: { nombreCarrera: string };
  requisitos: Requisito[];
};
export type Proyecto = {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string;
  objetivosProyecto?: string;
  tipoProyecto: TipoProyecto;
  estadoProyecto: EstadoProyecto;
  modalidadProyecto: ModalidadProyecto;
  ubicacionProyecto?: string;
  fechaInicio?: string;
  fechaFinEstimada?: string;
  fechaPublicacion?: string;
  creador: { idUsuario: number; nombre: string; apellido: string; correo: string };
  organizaciones: { organizacion: { nombreOrganizacion: string } }[];
  intereses: { interes: { nombreInteres: string } }[];
  roles: Rol[];
};
export type ProyectoResumen = {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: TipoProyecto;
  estadoProyecto: EstadoProyecto;
  modalidadProyecto: ModalidadProyecto;
  fechaPublicacion?: string;
  organizaciones: { organizacion: { nombreOrganizacion: string } }[];
  intereses: { interes: { nombreInteres: string } }[];
  roles: { idRolProyecto: number }[];
};
export type Postulacion = {
  idPostulacion: number;
  justificacion: string;
  estadoPostulacion: EstadoPostulacion;
  fechaPostulacion: string;
  comentarioResolucion?: string;
  rolProyecto: {
    nombreRol: string;
    proyecto: {
      idProyecto: number;
      tituloProyecto: string;
      estadoProyecto: EstadoProyecto;
    };
  };
};
export const TIPO_LABEL: Record<TipoProyecto, string> = {
  ACADEMICO_HORAS_BECA: 'Horas Beca',
  ACADEMICO_EXPERIENCIA: 'Experiencia',
  EXTRACURRICULAR_EXTENSION: 'Extensión',
};
export const MODALIDAD_LABEL: Record<ModalidadProyecto, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  MIXTA: 'Mixta',
};
export const NIVEL_LABEL: Record<NivelHabilidad, string> = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
};
