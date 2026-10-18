import { IsIn } from 'class-validator';

export const DURACIONES_SILENCIO = ['1h', '8h', 'siempre'] as const;
export type DuracionSilencio = (typeof DURACIONES_SILENCIO)[number];

export class SilenciarConversationDto {
  @IsIn(DURACIONES_SILENCIO)
  duracion!: DuracionSilencio;
}
