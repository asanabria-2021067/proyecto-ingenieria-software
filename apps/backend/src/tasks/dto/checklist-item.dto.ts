import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateChecklistItemDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'texto no puede estar vacío' })
  @MaxLength(200)
  texto!: string;
}

export class UpdateChecklistItemDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'texto no puede estar vacío' })
  @MaxLength(200)
  texto?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  completado?: boolean;
}
