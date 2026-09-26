import { IsOptional, IsString } from 'class-validator';

export class GlobalSearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
