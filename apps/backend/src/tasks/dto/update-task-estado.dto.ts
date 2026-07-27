import { IsEnum } from 'class-validator';
import { EstadoTarea } from '@prisma/client';

export class UpdateTaskEstadoDto {
  @IsEnum(EstadoTarea, {
    message: `estadoTarea debe ser uno de: ${Object.values(EstadoTarea).join(', ')}`,
  })
  estadoTarea!: EstadoTarea;
}
