import { IsBoolean, Matches } from 'class-validator';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** MEJ-136: reemplaza el horario de silencio completo del usuario. */
export class UpdateSilencioDto {
  @IsBoolean()
  activo!: boolean;

  @Matches(HORA, { message: 'horaInicio debe tener formato HH:mm' })
  horaInicio!: string;

  @Matches(HORA, { message: 'horaFin debe tener formato HH:mm' })
  horaFin!: string;
}
