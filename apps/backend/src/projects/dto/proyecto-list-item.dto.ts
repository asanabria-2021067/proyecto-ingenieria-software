import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class ProyectoListItemDto {
  @IsNumber()
  idProyecto!: number;

  @IsString()
  @IsNotEmpty()
  tituloProyecto!: string;

  @IsString()
  @IsNotEmpty()
  tipoProyecto!: string;

  @IsString()
  @IsNotEmpty()
  estadoProyecto!: string;

  @IsString()
  @IsNotEmpty()
  modalidadProyecto!: string;

  @IsOptional()
  @IsString()
  descripcionProyecto!: string | null;
}
