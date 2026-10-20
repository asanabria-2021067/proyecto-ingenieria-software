import { IsIn, ValidateIf } from 'class-validator';

export const CHAT_TEMA_COLORES = ['verde', 'azul', 'violeta', 'naranja', 'rosa', 'gris'] as const;

/** `temaColor: null` limpia el tema propio y vuelve al color por defecto. */
export class UpdateChatThemeDto {
  @ValidateIf((_object, value) => value !== null)
  @IsIn(CHAT_TEMA_COLORES)
  temaColor!: (typeof CHAT_TEMA_COLORES)[number] | null;
}
