export type TipoProyecto =
  | 'ACADEMICO_HORAS_BECA'
  | 'ACADEMICO_EXPERIENCIA'
  | 'EXTRACURRICULAR_EXTENSION';

export type EstadoProyecto = 'BORRADOR' | 'PUBLICADO' | 'EN_PROGRESO' | 'CERRADO';

export type ModalidadProyecto = 'PRESENCIAL' | 'VIRTUAL' | 'MIXTA';

export interface Proyecto {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: TipoProyecto;
  estadoProyecto: EstadoProyecto;
  modalidadProyecto: ModalidadProyecto;
  fechaInicio: string | null;
  fechaFinEstimada: string | null;
  fechaCreacion: string;
  creador: {
    nombre: string;
    apellido: string;
  };
  organizaciones: Array<{
    organizacion: {
      nombreOrganizacion: string;
    };
  }>;
}

export interface CreateProyectoDto {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: TipoProyecto;
  creadoPor: number;
  objetivosProyecto?: string;
  modalidadProyecto?: ModalidadProyecto;
  ubicacionProyecto?: string;
  fechaInicio?: string;
  fechaFinEstimada?: string;
}
