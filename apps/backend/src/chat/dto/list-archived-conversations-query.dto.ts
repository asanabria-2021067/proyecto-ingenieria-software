import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * T-236: búsqueda de conversaciones archivadas por nombre de chat O por
 * persona participante — un solo campo `q` que el service compara contra
 * ambos (ver ChatService.listArchivedConversations). T-237 conectó la
 * comparación a la normalización de acentos de T-245 sin cambiar el
 * contrato del campo.
 */
export class ListArchivedConversationsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;
}
