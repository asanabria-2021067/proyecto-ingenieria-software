import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCatalogItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;
}

