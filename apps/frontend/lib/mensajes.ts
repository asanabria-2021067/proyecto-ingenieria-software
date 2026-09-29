import { toast } from 'sonner';

export type TipoAviso = 'exito' | 'error' | 'advertencia';

const DURACION_MS: Record<TipoAviso, number> = {
  exito: 2500,
  advertencia: 4500,
  error: 6000,
};

// Avisos rapidos (no bloquean, se apilan y desaparecen solos): Sonner. Los
// dialogs de confirmacion/resultado que SI requieren que el usuario los
// atienda siguen en SweetAlert2 (ver lib/swal.ts) — dos sistemas, cada uno
// para su caso, no uno sustituye al otro.
export const aviso = {
  exito: (titulo: string, texto?: string) => toast.success(titulo, { description: texto, duration: DURACION_MS.exito }),
  error: (titulo: string, texto?: string) => toast.error(titulo, { description: texto, duration: DURACION_MS.error }),
  advertencia: (titulo: string, texto?: string) =>
    toast.warning(titulo, { description: texto, duration: DURACION_MS.advertencia }),
};

export interface OpcionesConfirmar {
  titulo: string;
  descripcion: string;
  textoAccion: string;
  destructiva?: boolean;
}

export interface SolicitudConfirmacion extends OpcionesConfirmar {
  responder: (confirmado: boolean) => void;
}

type OyenteConfirmacion = (solicitud: SolicitudConfirmacion) => void;

let oyente: OyenteConfirmacion | null = null;
const enEspera: SolicitudConfirmacion[] = [];

export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolve) => {
    const solicitud: SolicitudConfirmacion = { ...opciones, responder: resolve };
    if (oyente) oyente(solicitud);
    else enEspera.push(solicitud);
  });
}

export function escucharConfirmaciones(nuevo: OyenteConfirmacion): () => void {
  oyente = nuevo;
  while (enEspera.length > 0) {
    const solicitud = enEspera.shift();
    if (solicitud) nuevo(solicitud);
  }
  return () => {
    if (oyente === nuevo) oyente = null;
  };
}
