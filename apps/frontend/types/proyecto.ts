/**
 * Re-exporta los tipos desde el DTO canónico.
 * La fuente de verdad es lib/dto/project.dto.ts.
 * Este archivo existe para mantener compatibilidad con importaciones existentes.
 */
export type {
  CreadorDTO as CreadorProyecto,
  OrganizacionDTO as OrganizacionDetalle,
  ProyectoOrganizacionDTO as ProyectoOrganizacion,
  InteresDTO as Interes,
  ProyectoInteresDTO as ProyectoInteres,
  HabilidadDTO as Habilidad,
  RequisitoHabilidadDTO as RequisitoHabilidad,
  CarreraDTO as Carrera,
  RolProyectoDTO as RolProyecto,
  HitoDTO as Hito,
  TareaDTO as Tarea,
  ProyectoDetalleDTO as ProyectoDetalle,
} from '@/lib/dto/project.dto';
