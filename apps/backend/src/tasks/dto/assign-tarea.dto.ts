import { IsInt } from 'class-validator';

export class AssignTareaDto {
  @IsInt()
  idUsuario!: number;
}
