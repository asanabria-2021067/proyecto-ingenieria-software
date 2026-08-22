import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateConversationDto {
  @IsIn(['GRUPAL', 'INDIVIDUAL'])
  tipo!: 'GRUPAL' | 'INDIVIDUAL';

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'nombre no puede estar vacío' })
  @MaxLength(255)
  nombre?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un participante' })
  @ArrayUnique()
  @IsInt({ each: true })
  idsParticipantes!: number[];
}
