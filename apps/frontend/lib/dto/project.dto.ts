/**
 * DTOs que modelan exactamente la respuesta del backend.
 * Endpoint: GET /proyectos/:id
 * Cada campo refleja lo que el backend selecciona en ProjectsService.findOne().
 */

export interface CreadorDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
}

export interface OrganizacionDTO {
  idOrganizacion: number;
  nombreOrganizacion: string;
  tipoOrganizacion: string;
  descripcionOrganizacion: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
  sitioWeb: string | null;
  logoUrl: string | null;
  estadoOrganizacion: string;
}

export interface ProyectoOrganizacionDTO {
  idProyectoOrganizacion: number;
  idProyecto: number;
  idOrganizacion: number;
  rolOrganizacion: string;
  fechaVinculacion: string | null;
  organizacion: OrganizacionDTO;
}

export interface InteresDTO {
  idInteres: number;
  nombreInteres: string;
  descripcionInteres: string | null;
}

export interface ProyectoInteresDTO {
  idProyectoInteres: number;
  idProyecto: number;
  idInteres: number;
  interes: InteresDTO;
}

export interface HabilidadDTO {
  idHabilidad: number;
  nombreHabilidad: string;
  categoriaHabilidad: string;
  descripcionHabilidad: string | null;
}

export interface RequisitoHabilidadDTO {
  idRequisitoHabilidad: number;
  idRolProyecto: number;
  idHabilidad: number;
  nivelMinimo: string;
  obligatorio: boolean;
  habilidad: HabilidadDTO;
}

export interface CarreraDTO {
  idCarrera: number;
  nombreCarrera: string;
  facultad: string;
}

export interface RolProyectoDTO {
  idRolProyecto: number;
  idProyecto: number;
  nombreRol: string;
  descripcionRolProyecto: string | null;
  idCarreraRequerida: number | null;
  cupos: number;
  horasSemanalesEstimadas: number | null;
  requisitos: RequisitoHabilidadDTO[];
  carreraRequerida: CarreraDTO | null;
}

export interface HitoDTO {
  idHito: number;
  tituloHito: string;
  descripcionHito: string | null;
  fechaLimite: string | null;
  estadoHito: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO';
  orden: number;
}

export interface TareaDTO {
  idTarea: number;
  idHito: number | null;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA';
  fechaLimite: string | null;
}

/** DTO para items del listado — GET /proyectos y GET /proyectos?q= */
export interface ProyectoListItemDTO {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  estadoProyecto: string;
  modalidadProyecto: string;
  descripcionProyecto: string | null;
}

/** DTO de revisión — parte de la respuesta de GET /revisiones/proyectos/:id */
export interface RevisionProyectoDTO {
  idRevisionProyecto: number;
  estadoRevision: 'PENDIENTE' | 'APROBADA' | 'OBSERVADA';
  comentarioRevision: string | null;
  numeroEnvio: number;
  enviadaEn: string;
  revisadaEn: string | null;
  revisor: { idUsuario: number; nombre: string; apellido: string } | null;
}

/** DTO para items del listado propio — GET /proyectos/mine */
export interface MiProyectoListItemDTO extends ProyectoListItemDTO {
  fechaCreacion: string;
  fechaActualizacion: string | null;
  /** Última revisión (si existe) */
  revisiones: Pick<
    RevisionProyectoDTO,
    'idRevisionProyecto' | 'estadoRevision' | 'comentarioRevision' | 'numeroEnvio' | 'enviadaEn' | 'revisadaEn'
  >[];
}

/** Payload para crear un proyecto completo */
export interface CreateProjectPayload {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: string;
  modalidadProyecto: string;
  objetivosProyecto?: string;
  ubicacionProyecto?: string;
  contextoAcademico?: string;
  urlRecursoExterno?: string;
  fechaInicio?: string;
  fechaFinEstimada?: string;
  organizacionesIds?: number[];
  roles?: {
    nombreRol: string;
    descripcionRolProyecto?: string;
    idCarreraRequerida?: number;
    cupos: number;
    horasSemanalesEstimadas?: number;
    requisitos?: {
      idHabilidad: number;
      nivelMinimo: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
      obligatorio: boolean;
    }[];
  }[];
  accion: 'BORRADOR' | 'EN_REVISION';
}

/** Payload para resolver una revisión (admin) */
export interface ResolverRevisionPayload {
  resultado: 'APROBADA' | 'OBSERVADA';
  comentario?: string;
}

/** DTO raíz — contrato completo de GET /proyectos/:id */
export interface ProyectoDetalleDTO {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string | null;
  objetivosProyecto: string | null;
  tipoProyecto: string;
  estadoProyecto: string;
  modalidadProyecto: string;
  ubicacionProyecto: string | null;
  contextoAcademico: string | null;
  urlRecursoExterno: string | null;
  fechaPublicacion: string | null;
  fechaInicio: string | null;
  fechaFinEstimada: string | null;
  fechaCreacion: string;
  creador: CreadorDTO;
  organizaciones: ProyectoOrganizacionDTO[];
  intereses: ProyectoInteresDTO[];
  roles: RolProyectoDTO[];
  hitos: HitoDTO[];
  tareas?: TareaDTO[];
}
