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
} from 'class-validator';
import {
  TipoProyecto,
  ModalidadProyecto,
} from '@prisma/client';

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

  // Opcionales
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
}
