import {
  TipoProyecto,
  EstadoProyecto,
  ModalidadProyecto,
} from '@prisma/client';

export class CreateProjectDto {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: TipoProyecto;
  creadoPor: number;

  // Opcionales
  objetivosProyecto?: string;
  estadoProyecto?: EstadoProyecto;
  modalidadProyecto?: ModalidadProyecto;
  ubicacionProyecto?: string;
  contextoAcademico?: string;
  urlRecursoExterno?: string;
  fechaInicio?: string;
  fechaFinEstimada?: string;
}
