import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export const MAX_RESPONSABLES_ADICIONALES = 9;

/** MEJ-109: responsables ademas del principal (se reemplaza el conjunto completo). */
export class SetResponsablesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_RESPONSABLES_ADICIONALES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsUsuarios!: number[];
}
