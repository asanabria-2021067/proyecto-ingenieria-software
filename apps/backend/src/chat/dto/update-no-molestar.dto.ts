import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsTimeZone,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Modo no molestar del chat: reemplaza la preferencia completa del usuario. */
export class UpdateNoMolestarDto {
  @IsBoolean()
  activo!: boolean;

  @Matches(HORA, { message: 'horaInicio debe tener formato HH:mm' })
  horaInicio!: string;

  @Matches(HORA, { message: 'horaFin debe tener formato HH:mm' })
  horaFin!: string;

  /** 0 = domingo ... 6 = sabado */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana!: number[];

  @IsOptional()
  @IsTimeZone()
  zona?: string;
}
