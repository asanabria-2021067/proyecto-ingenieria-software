import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCloudinaryUrl } from '../../common/validators/cloudinary-url.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateAsociacionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'nombre debe tener al menos 3 caracteres' })
  @MaxLength(255)
  nombre?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsCloudinaryUrl()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'La asociación debe representar al menos una carrera' })
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  idsCarreras?: number[];

  @IsOptional()
  @IsBoolean()
  archivada?: boolean;
}
