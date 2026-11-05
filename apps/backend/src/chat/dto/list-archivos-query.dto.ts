import { IsIn, IsOptional } from 'class-validator';
import { ListLinksQueryDto } from './list-links-query.dto';

export const TIPOS_ARCHIVO = ['imagen', 'documento', 'audio'] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

export class ListArchivosQueryDto extends ListLinksQueryDto {
  /** MEJ-135: acota la galeria a imagenes, documentos o notas de voz. */
  @IsOptional()
  @IsIn(TIPOS_ARCHIVO)
  tipo?: TipoArchivo;
}
