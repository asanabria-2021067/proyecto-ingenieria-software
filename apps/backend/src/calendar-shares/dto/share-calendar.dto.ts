import { IsInt, Min } from 'class-validator';

/** HU-184: compartir mi calendario (solo lectura) con otro usuario. */
export class ShareCalendarDto {
  @IsInt({ message: 'idUsuario debe ser un número entero' })
  @Min(1)
  idUsuario!: number;
}
