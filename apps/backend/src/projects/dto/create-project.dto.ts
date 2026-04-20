import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayUnique,
  IsInt,
  IsBoolean,
  Min,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TipoProyecto,
  ModalidadProyecto,
  NivelHabilidad,
} from '@prisma/client';

export class RequisitoHabilidadDto {
  @IsInt({ message: 'idHabilidad debe ser un número entero' })
  idHabilidad!: number;

  @IsOptional()
  @IsEnum(NivelHabilidad, {
    message: `nivelMinimo debe ser uno de: ${Object.values(NivelHabilidad).join(', ')}`,
  })
  nivelMinimo?: NivelHabilidad;

  @IsOptional()
  @IsBoolean({ message: 'obligatorio debe ser un booleano' })
  obligatorio?: boolean;
}

export class RolProyectoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es requerido' })
  @MaxLength(255)
  nombreRol!: string;

  @IsOptional()
  @IsString()
  descripcionRolProyecto?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'cupos debe ser al menos 1' })
  cupos?: number;

  @IsOptional()
  @IsInt()
  idCarreraRequerida?: number;

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

export class CreateProjectDto {
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

  @IsOptional()
  @IsString()
  objetivosProyecto?: string;

  @IsOptional()
  @IsEnum(ModalidadProyecto, {
    message: `modalidadProyecto debe ser uno de: ${Object.values(ModalidadProyecto).join(', ')}`,
  })
  modalidadProyecto?: ModalidadProyecto;

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
  @IsArray({ message: 'organizacionesIds debe ser un arreglo de números' })
  @ArrayUnique({ message: 'organizacionesIds no debe tener valores duplicados' })
  @IsInt({ each: true, message: 'Cada id de organización debe ser un número entero' })
  organizacionesIds?: number[];

  @IsOptional()
  @IsArray({ message: 'roles debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => RolProyectoDto)
  roles?: RolProyectoDto[];
}
