import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * T-236: búsqueda de conversaciones archivadas por nombre de chat O por
 * persona participante — un solo campo `q` que el service compara contra
 * ambos (ver ChatService.listArchivedConversations). Sin normalización de
 * acentos todavía: esa función la implementa Saúl en T-245 (HU-161); cuando
 * exista, este mismo campo se conecta ahí sin cambiar el contrato.
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
