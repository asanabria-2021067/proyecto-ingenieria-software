import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCatalogItemDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsOptional()
  @IsString()
  categoria?: string;
}

