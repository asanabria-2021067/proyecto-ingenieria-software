import uvgSwal from '@/lib/swal';

export type TipoAviso = 'exito' | 'error' | 'advertencia';

const AVISOS = {
  exito: { icon: 'success', etiqueta: 'Listo', clase: 'pill-success', duracion: 2500 },
  advertencia: { icon: 'warning', etiqueta: 'Atención', clase: 'pill-warning', duracion: 4500 },
  error: { icon: 'error', etiqueta: 'Error', clase: 'pill-error', duracion: 6000 },
} as const;

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mostrarAviso(tipo: TipoAviso, titulo: string, texto?: string) {
  const config = AVISOS[tipo];
  const etiqueta = `<span class="pill ${config.clase}">${config.etiqueta}</span>`;
  const cuerpo = texto ? `<p class="mt-micro">${escaparHtml(texto)}</p>` : '';
  return uvgSwal.fire({
    toast: true,
    position: 'top-end',
    backdrop: false,
    icon: config.icon,
    title: titulo,
    html: `${etiqueta}${cuerpo}`,
    timer: config.duracion,
    timerProgressBar: true,
    showConfirmButton: false,
    showCloseButton: true,
    closeButtonAriaLabel: 'Cerrar aviso',
    didOpen: (popup: HTMLElement) => {
      popup.addEventListener('mouseenter', () => uvgSwal.stopTimer());
      popup.addEventListener('mouseleave', () => uvgSwal.resumeTimer());
    },
  });
}

export const aviso = {
  exito: (titulo: string, texto?: string) => mostrarAviso('exito', titulo, texto),
  error: (titulo: string, texto?: string) => mostrarAviso('error', titulo, texto),
  advertencia: (titulo: string, texto?: string) => mostrarAviso('advertencia', titulo, texto),
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
