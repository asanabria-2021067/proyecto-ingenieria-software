import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { DashboardReporteQueryDto } from './dashboard-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const AVISO_MENSAJE_MAX = 500;

/** MEJ-161: los destinatarios no viajan: el servidor los resuelve con estos filtros sobre los estudiantes de la asociación. */
export class AvisoAsociacionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'mensaje no puede estar vacío' })
  @MaxLength(AVISO_MENSAJE_MAX)
  mensaje!: string;

  @ValidateNested()
  @Type(() => DashboardReporteQueryDto)
  filtros!: DashboardReporteQueryDto;

  /** Lo que la persona vio en la confirmación; si la lista cambió desde entonces el envío se rechaza. */
  @IsInt()
  @Min(1)
  @Max(100000)
  cantidadEsperada!: number;
}
