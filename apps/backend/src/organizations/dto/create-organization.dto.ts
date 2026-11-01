import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VisibilidadOrganizacion } from '@prisma/client';
import { IsCloudinaryUrl } from '../../common/validators/cloudinary-url.validator';
import { IsHttpUrl } from '../../common/validators/http-url.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(120)
  nombreOrganizacion!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  descripcionOrganizacion?: string;

  @IsOptional()
  @IsEnum(VisibilidadOrganizacion)
  visibilidad?: VisibilidadOrganizacion;

  /** `secure_url` de Cloudinary, como la foto de perfil; '' = sin logo. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsCloudinaryUrl()
  logoUrl?: string;

  /** '' = sin sitio web. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsHttpUrl()
  sitioWeb?: string;
}
