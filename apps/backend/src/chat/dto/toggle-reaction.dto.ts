import { IsIn, IsString } from 'class-validator';

// Lista corta permitida (en escapes unicode): pulgar arriba, corazon, risa, fiesta, sorpresa, tristeza, gracias, ojos.
export const EMOJIS_REACCION = [
  '\u{1F44D}',
  '❤️',
  '\u{1F602}',
  '\u{1F389}',
  '\u{1F62E}',
  '\u{1F622}',
  '\u{1F64F}',
  '\u{1F440}',
] as const;

export class ToggleReactionDto {
  @IsString()
  @IsIn(EMOJIS_REACCION, { message: 'emoji no permitido' })
  emoji!: string;
}
