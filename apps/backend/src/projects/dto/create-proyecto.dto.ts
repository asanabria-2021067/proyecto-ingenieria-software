import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum TipoProyecto {
  INVESTIGACION = 'INVESTIGACION',
  DESARROLLO = 'DESARROLLO',
  SERVICIO_COMUNITARIO = 'SERVICIO_COMUNITARIO',
  PRACTICA_PROFESIONAL = 'PRACTICA_PROFESIONAL',
}

export enum ModalidadProyecto {
  PRESENCIAL = 'PRESENCIAL',
  VIRTUAL = 'VIRTUAL',
  HIBRIDA = 'HIBRIDA',
}

export class CreateProyectoDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(200)
  tituloProyecto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcionProyecto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objetivosProyecto?: string;

  @IsEnum(TipoProyecto)
  tipoProyecto!: TipoProyecto;

  @IsEnum(ModalidadProyecto)
  modalidadProyecto!: ModalidadProyecto;

  @IsOptional()
  @IsString()
  ubicacionProyecto?: string;

  @IsOptional()
  @IsString()
  contextoAcademico?: string;

  @IsOptional()
  @IsString()
  urlRecursoExterno?: string;

  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  fechaFinEstimada?: string;

  @IsNumber()
  idCreador!: number;
}
