export type RolAyuda = 'estudiante' | 'lider' | 'junta' | 'coordinador' | 'admin';

export interface PreguntaAyuda {
  id: string;
  pregunta: string;
  respuesta: string;
  /** Pantalla de la app donde se hace lo que explica la respuesta. */
  ruta?: string;
}
