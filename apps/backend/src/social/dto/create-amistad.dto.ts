import { IsInt, IsPositive } from 'class-validator';

export class CreateAmistadDto {
  @IsInt()
  @IsPositive()
  idReceptor!: number;
}
