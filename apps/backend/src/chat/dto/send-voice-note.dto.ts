import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { NOTA_VOZ_MAX_SEGUNDOS } from '../chat-nota-voz';

/** Campo de texto del multipart de una nota de voz. */
export class SendVoiceNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTA_VOZ_MAX_SEGUNDOS, { message: `La nota de voz dura como máximo ${NOTA_VOZ_MAX_SEGUNDOS} segundos` })
  duracionSegundos!: number;
}
