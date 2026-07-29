import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  MaxLength,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RoleRequisitoDto } from './create-role.dto';

/**
 * Edición de un rol existente (Sección 8). Todos los campos son opcionales:
 * `undefined` = no tocar ese campo; `null` (en `idCarreraRequerida` /
 * `horasSemanalesEstimadas`) = limpiar el valor. `requisitos`, cuando se envía,
 * reemplaza el conjunto completo de habilidades del rol (agregar o quitar
 * habilidades no expulsa participantes). El `idRolProyecto` nunca se edita:
 * viene por la ruta y se conserva.
 */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol no puede estar vacío' })
  @MaxLength(255)
  nombreRol?: string;

  @IsOptional()
  @IsString()
  descripcionRolProyecto?: string | null;

  @IsOptional()
  @IsInt()
  idCarreraRequerida?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Los cupos deben ser al menos 1' })
  cupos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  horasSemanalesEstimadas?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleRequisitoDto)
  requisitos?: RoleRequisitoDto[];
}
