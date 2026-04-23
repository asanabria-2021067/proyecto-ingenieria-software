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

export class UpdateRequisitoHabilidadDto {
  @IsInt()
  idHabilidad!: number;

  @IsEnum(NivelHabilidad)
  nivelMinimo!: NivelHabilidad;

  @IsBoolean()
  obligatorio!: boolean;
}

export class UpdateRolProyectoDto {
  @IsOptional()
  @IsInt()
  idRolProyecto?: number;

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
  @Type(() => UpdateRequisitoHabilidadDto)
  requisitos?: UpdateRequisitoHabilidadDto[];
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(200)
  tituloProyecto?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  descripcionProyecto?: string;

  @IsOptional()
  @IsEnum(TipoProyecto)
  tipoProyecto?: TipoProyecto;

  @IsOptional()
  @IsEnum(ModalidadProyecto)
  modalidadProyecto?: ModalidadProyecto;

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
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFinEstimada?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  organizacionesIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRolProyectoDto)
  roles?: UpdateRolProyectoDto[];
}
