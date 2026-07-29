import { IsInt, Min } from 'class-validator';

// Nombre del campo respaldado por el modelo Prisma AsignacionTarea.idUsuario
// (schema.prisma), que ya representa al usuario asignado a nivel de
// persistencia. No existe ningún contrato previo (controller, frontend,
// tests) que use un nombre distinto para este endpoint de asignación.
export class AssignTaskDto {
  @IsInt()
  @Min(1)
  idUsuario!: number;
}
