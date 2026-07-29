import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  MaxLength,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NivelHabilidad } from '@prisma/client';

/**
 * Requisito de habilidad de un rol. Misma forma que `RequisitoHabilidadDto`
 * (create-project-full.dto) y `UpdateRequisitoHabilidadDto` (update-project.dto);
 * se declara aquí para que el módulo de roles no dependa de un DTO del módulo
 * de proyectos, sin cambiar el contrato de esos flujos.
 */
export class RoleRequisitoDto {
  @IsInt()
  idHabilidad!: number;

  @IsEnum(NivelHabilidad, {
    message: `nivelMinimo debe ser uno de: ${Object.values(NivelHabilidad).join(', ')}`,
  })
  nivelMinimo!: NivelHabilidad;

  @IsBoolean()
  obligatorio!: boolean;
}

/**
 * Crear un rol después de la creación inicial del proyecto (Sección 8). El
 * líder puede crear roles en cualquier momento mientras el proyecto no esté
 * eliminado; no se restringe por estado del proyecto.
 */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es requerido' })
  @MaxLength(255)
  nombreRol!: string;

  @IsOptional()
  @IsString()
  descripcionRolProyecto?: string;

  @IsOptional()
  @IsInt()
  idCarreraRequerida?: number;

  @IsInt()
  @Min(1, { message: 'Los cupos deben ser al menos 1' })
  cupos!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  horasSemanalesEstimadas?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleRequisitoDto)
  requisitos?: RoleRequisitoDto[];
}
