import { TipoEntidadBitacora, TipoEventoBitacora } from '../tipos-evento-bitacora';

/** Mismo subconjunto público de Usuario que HISTORY_USUARIO_SELECT (sprints.service.ts) — nunca el objeto completo. */
export interface BitacoraActorDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

/**
 * Un evento funcional de la bitácora — proyección tipada de una fila cruda
 * de `BitacoraAuditoria` escrita por BitacoraEventosService (nunca una fila
 * genérica de AuditInterceptor, excluida por el filtro `accion IN (...)` de
 * BitacoraConsultaService).
 */
export interface EventoBitacoraDto {
  idAuditoria: number;
  tipoEvento: TipoEventoBitacora;
  tipoEntidad: TipoEntidadBitacora;
  idEntidad: number;
  idProyecto: number;
  idSprint: number | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
  fechaEvento: Date;
  actor: BitacoraActorDto | null;
}

/** Mismo shape de paginación que ProjectsService.findAllPaginated (`data`/`total`/`page`/`totalPages`). */
export interface BitacoraPaginadaDto {
  data: EventoBitacoraDto[];
  total: number;
  page: number;
  totalPages: number;
}

export interface FiltrosBitacoraInput {
  idSprint?: number;
  idActor?: number;
  tipoEvento?: TipoEventoBitacora;
  page: number;
  limit: number;
}
