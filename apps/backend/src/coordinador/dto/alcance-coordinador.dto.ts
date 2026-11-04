import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class GuardarAlcanceDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  carreraIds!: number[];

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  facultades!: string[];
}
