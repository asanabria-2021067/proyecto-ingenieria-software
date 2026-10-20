import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const CHAT_SEARCH_MAX_LIMIT = 50;

const toNumber = ({ value }: { value: unknown }) => (value === '' || value === undefined ? undefined : Number(value));
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SearchMessagesQueryDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(2, { message: 'q debe tener al menos 2 caracteres' })
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  idAutor?: number;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(CHAT_SEARCH_MAX_LIMIT)
  limite?: number;
}
