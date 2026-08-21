import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class CreateSolicitudSalidaDto {
  // Igual que tituloHito en CreateHitoDto: @Transform recorta espacios antes
  // de validar, así que un motivo compuesto solo de whitespace ("   ") llega
  // vacío a @MinLength y se rechaza, en vez de colarse por @IsNotEmpty().
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'motivo no puede estar vacío' })
  motivo!: string;
}
