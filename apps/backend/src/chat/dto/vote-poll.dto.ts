import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsPositive } from 'class-validator';

/** Opciones elegidas; un arreglo vacío retira el voto. */
export class VotePollDto {
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idsOpciones!: number[];
}
