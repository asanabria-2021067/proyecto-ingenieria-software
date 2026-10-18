export interface SilencioParticipante {
  silenciadaHasta?: Date | null;
  silenciadaSiempre?: boolean | null;
}

/** El silencio vence justo en `silenciadaHasta`: en ese instante ya no aplica. */
export function estaSilenciada(
  participante: SilencioParticipante | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!participante) return false;
  if (participante.silenciadaSiempre) return true;
  return !!participante.silenciadaHasta && participante.silenciadaHasta.getTime() > ahora.getTime();
}
