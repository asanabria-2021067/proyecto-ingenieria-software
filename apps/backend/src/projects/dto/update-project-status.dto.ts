import { IsEnum } from 'class-validator';
import { EstadoProyecto } from '@prisma/client';

export class UpdateProjectStatusDto {
  @IsEnum(EstadoProyecto)
  estadoProyecto: EstadoProyecto;
}
