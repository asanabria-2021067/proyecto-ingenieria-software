import { DestinoArrastre } from '@prisma/client';
import { IsEnum, ValidateIf } from 'class-validator';


export class CloseSprintDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(DestinoArrastre, {
    message: `destino debe ser uno de: ${Object.values(DestinoArrastre).join(', ')}`,
  })
  destino?: DestinoArrastre;
}
