export const CLAVE_TEMA = 'theme';

export function temaOscuroGuardado(): boolean {
  let guardado: string | null = null;
  try {
    guardado = window.localStorage.getItem(CLAVE_TEMA);
  } catch {
    guardado = null;
  }
  if (guardado === 'dark') return true;
  if (guardado === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function aplicarTemaGuardado(raiz: HTMLElement = document.documentElement): void {
  raiz.classList.toggle('dark', temaOscuroGuardado());
}
