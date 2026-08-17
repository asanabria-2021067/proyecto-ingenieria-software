import { IsInt, IsPositive } from 'class-validator';

export class CreateSeguimientoDto {
  @IsInt()
  @IsPositive()
  idSeguido!: number;
}
