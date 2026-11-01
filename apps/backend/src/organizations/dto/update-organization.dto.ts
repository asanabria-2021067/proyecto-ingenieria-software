import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VisibilidadOrganizacion } from '@prisma/client';
import { IsCloudinaryUrl } from '../../common/validators/cloudinary-url.validator';
import { IsHttpUrl } from '../../common/validators/http-url.validator';
import { trim } from './create-organization.dto';

export class UpdateOrganizationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(120)
  nombreOrganizacion?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  descripcionOrganizacion?: string;

  /** Solo el Propietario la cambia. */
  @IsOptional()
  @IsEnum(VisibilidadOrganizacion)
  visibilidad?: VisibilidadOrganizacion;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsCloudinaryUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsHttpUrl()
  sitioWeb?: string;
}
