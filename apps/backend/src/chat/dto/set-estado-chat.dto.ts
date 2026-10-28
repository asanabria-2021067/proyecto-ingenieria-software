import { TipoEstadoChat } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SetEstadoChatDto {
  @IsEnum(TipoEstadoChat)
  tipo!: TipoEstadoChat;

  /** Solo se usa (y es obligatorio) con tipo PERSONALIZADO. */
  @ValidateIf((o: SetEstadoChatDto) => o.tipo === TipoEstadoChat.PERSONALIZADO)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[^\p{Cc}]*$/u, { message: 'texto no puede tener caracteres de control' })
  texto?: string;

  /** ISO 8601; el servicio exige que sea futuro y de a lo sumo 24 h. Omitido o null = sin caducidad. */
  @IsOptional()
  @IsISO8601({ strict: true })
  venceEn?: string | null;
}
