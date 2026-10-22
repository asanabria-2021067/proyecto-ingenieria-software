import type { ChatTemaColor } from '@/lib/types/chat';

/**
 * Paleta de temas del chat. Las clases van completas (no armadas con
 * plantillas) para que Tailwind las detecte.
 *
 * Contraste WCAG AA (>= 4.5:1) del texto sobre la burbuja propia:
 * - claro: fondo tono 700 con texto blanco.
 * - oscuro: fondo tono 300 con texto tono 950.
 * test/chat-temas.spec.ts calcula las razones con los hex de cada tono.
 */
export const CHAT_TEMAS: Record<ChatTemaColor, { nombre: string; burbuja: string; acento: string; muestra: string }> = {
  verde: {
    nombre: 'Verde',
    burbuja: 'bg-green-700 text-white dark:bg-green-300 dark:text-green-950',
    acento: 'border-t-4 border-t-green-700 dark:border-t-green-300',
    muestra: 'bg-green-700 dark:bg-green-300',
  },
  azul: {
    nombre: 'Azul',
    burbuja: 'bg-blue-700 text-white dark:bg-blue-300 dark:text-blue-950',
    acento: 'border-t-4 border-t-blue-700 dark:border-t-blue-300',
    muestra: 'bg-blue-700 dark:bg-blue-300',
  },
  violeta: {
    nombre: 'Violeta',
    burbuja: 'bg-violet-700 text-white dark:bg-violet-300 dark:text-violet-950',
    acento: 'border-t-4 border-t-violet-700 dark:border-t-violet-300',
    muestra: 'bg-violet-700 dark:bg-violet-300',
  },
  naranja: {
    nombre: 'Naranja',
    burbuja: 'bg-orange-700 text-white dark:bg-orange-300 dark:text-orange-950',
    acento: 'border-t-4 border-t-orange-700 dark:border-t-orange-300',
    muestra: 'bg-orange-700 dark:bg-orange-300',
  },
  rosa: {
    nombre: 'Rosa',
    burbuja: 'bg-pink-700 text-white dark:bg-pink-300 dark:text-pink-950',
    acento: 'border-t-4 border-t-pink-700 dark:border-t-pink-300',
    muestra: 'bg-pink-700 dark:bg-pink-300',
  },
  gris: {
    nombre: 'Gris',
    burbuja: 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-950',
    acento: 'border-t-4 border-t-slate-700 dark:border-t-slate-300',
    muestra: 'bg-slate-700 dark:bg-slate-300',
  },
};

const BURBUJA_POR_DEFECTO = 'bg-primary text-primary-foreground';

/** Clases de la burbuja propia; sin tema (o clave desconocida) usa el color por defecto. */
export function claseBurbujaPropia(tema: ChatTemaColor | null | undefined): string {
  return (tema && CHAT_TEMAS[tema]?.burbuja) || BURBUJA_POR_DEFECTO;
}

export function claseAcentoCabecera(tema: ChatTemaColor | null | undefined): string {
  return (tema && CHAT_TEMAS[tema]?.acento) || '';
}
