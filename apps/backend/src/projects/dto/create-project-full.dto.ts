import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayUnique,
  IsInt,
  MinLength,
  MaxLength,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@prisma/client';

export class RequisitoHabilidadDto {
  @IsInt()
  idHabilidad!: number;

  @IsEnum(NivelHabilidad, {
    message: `nivelMinimo debe ser uno de: ${Object.values(NivelHabilidad).join(', ')}`,
  })
  nivelMinimo!: NivelHabilidad;

  @IsBoolean()
  obligatorio!: boolean;
}

export class RolProyectoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombreRol!: string;

  @IsOptional()
  @IsString()
  descripcionRolProyecto?: string;

  @IsOptional()
  @IsInt()
  idCarreraRequerida?: number;

  @IsInt()
  @Min(1)
  cupos!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  horasSemanalesEstimadas?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitoHabilidadDto)
  requisitos?: RequisitoHabilidadDto[];
}

export class CreateProjectFullDto {
  // ─── Sección 1: datos generales ───────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'El título del proyecto es requerido' })
  @MinLength(5, { message: 'El título debe tener al menos 5 caracteres' })
  @MaxLength(200, { message: 'El título no puede superar 200 caracteres' })
  tituloProyecto!: string;

  @IsString()
  @IsNotEmpty({ message: 'La descripción del proyecto es requerida' })
  @MinLength(20, { message: 'La descripción debe tener al menos 20 caracteres' })
  descripcionProyecto!: string;

  @IsEnum(TipoProyecto, {
    message: `tipoProyecto debe ser uno de: ${Object.values(TipoProyecto).join(', ')}`,
  })
  tipoProyecto!: TipoProyecto;

  @IsEnum(ModalidadProyecto, {
    message: `modalidadProyecto debe ser uno de: ${Object.values(ModalidadProyecto).join(', ')}`,
  })
  modalidadProyecto!: ModalidadProyecto;

  @IsOptional()
  @IsString()
  objetivosProyecto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ubicacionProyecto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contextoAcademico?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  urlRecursoExterno?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fechaInicio debe ser una fecha válida (ISO 8601)' })
  fechaInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fechaFinEstimada debe ser una fecha válida (ISO 8601)' })
  fechaFinEstimada?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  organizacionesIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolProyectoDto)
  roles?: RolProyectoDto[];

  @IsEnum(['BORRADOR', 'EN_REVISION'], {
    message: "accion debe ser 'BORRADOR' o 'EN_REVISION'",
  })
  accion!: 'BORRADOR' | 'EN_REVISION';
}
