import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateRegistroHorasDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  metaBeca?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  becaDeclarada?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  metaExtension?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  extensionDeclarada?: number;
}
