export interface GlobalSearchGroupDTO<T> {
  items: T[];
  hasMore: boolean;
}

export interface ProyectoResultadoBusquedaDTO {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  modalidadProyecto: string;
}

export interface PersonaResultadoBusquedaDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  carrera: string | null;
}

export interface TareaResultadoBusquedaDTO {
  idTarea: number;
  tituloTarea: string;
  idProyecto: number;
  tituloProyecto: string;
  estadoTarea: string;
}

export interface GlobalSearchResponseDTO {
  proyectos: GlobalSearchGroupDTO<ProyectoResultadoBusquedaDTO>;
  personas: GlobalSearchGroupDTO<PersonaResultadoBusquedaDTO>;
  tareas: GlobalSearchGroupDTO<TareaResultadoBusquedaDTO>;
}
