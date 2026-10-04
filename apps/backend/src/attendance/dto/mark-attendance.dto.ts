import { IsBoolean } from 'class-validator';

/** T-296/T-297 (HU-177): marca o corrige la asistencia de UN integrante a UNA actividad. */
export class MarkAttendanceDto {
  @IsBoolean()
  asistio!: boolean;
}
