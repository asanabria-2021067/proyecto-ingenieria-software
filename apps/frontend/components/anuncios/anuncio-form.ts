import type { AnuncioAdmin, AnuncioInput } from '@/lib/services/anuncios';

export type EstadoAnuncio = 'VIGENTE' | 'PROGRAMADO' | 'VENCIDO' | 'DESPUBLICADO';

export const ESTADO_ANUNCIO_LABEL: Record<EstadoAnuncio, string> = {
  VIGENTE: 'Vigente',
  PROGRAMADO: 'Programado',
  VENCIDO: 'Vencido',
  DESPUBLICADO: 'Despublicado',
};

export function estadoAnuncio(a: Pick<AnuncioAdmin, 'activo' | 'fechaInicio' | 'fechaFin'>, ahora = new Date()): EstadoAnuncio {
  if (!a.activo) return 'DESPUBLICADO';
  if (new Date(a.fechaInicio) > ahora) return 'PROGRAMADO';
  if (new Date(a.fechaFin) <= ahora) return 'VENCIDO';
  return 'VIGENTE';
}

/** Valor de `<input type="datetime-local">` (hora local) a partir de un instante ISO. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface AnuncioFormValues {
  titulo: string;
  mensaje: string;
  nivel: AnuncioInput['nivel'];
  audiencia: AnuncioInput['audiencia'];
  /** `datetime-local` */
  fechaInicio: string;
  fechaFin: string;
}

export function valoresIniciales(a?: AnuncioAdmin, ahora = new Date()): AnuncioFormValues {
  if (a) {
    return {
      titulo: a.titulo,
      mensaje: a.mensaje,
      nivel: a.nivel,
      audiencia: a.audiencia,
      fechaInicio: toLocalInput(a.fechaInicio),
      fechaFin: toLocalInput(a.fechaFin),
    };
  }
  return {
    titulo: '',
    mensaje: '',
    nivel: 'INFO',
    audiencia: 'TODOS',
    fechaInicio: toLocalInput(ahora.toISOString()),
    fechaFin: toLocalInput(new Date(ahora.getTime() + 7 * 86_400_000).toISOString()),
  };
}

/** Mensaje de error del formulario o `null` si los valores son enviables. */
export function validarFormulario(v: AnuncioFormValues): string | null {
  if (!v.titulo.trim()) return 'El título es obligatorio.';
  if (!v.mensaje.trim()) return 'El mensaje es obligatorio.';
  const inicio = new Date(v.fechaInicio);
  const fin = new Date(v.fechaFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return 'Indica fecha de inicio y de fin.';
  if (fin <= inicio) return 'La fecha de fin debe ser posterior a la de inicio.';
  return null;
}

export function toInput(v: AnuncioFormValues): AnuncioInput {
  return {
    titulo: v.titulo.trim(),
    mensaje: v.mensaje.trim(),
    nivel: v.nivel,
    audiencia: v.audiencia,
    fechaInicio: new Date(v.fechaInicio).toISOString(),
    fechaFin: new Date(v.fechaFin).toISOString(),
  };
}
