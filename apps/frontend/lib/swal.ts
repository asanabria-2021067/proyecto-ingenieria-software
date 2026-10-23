import type { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

/**
 * SweetAlert2 combina `Swal.mixin(...)` con las opciones de cada `.fire()`
 * mediante `Object.assign` (merge superficial): si una llamada pasa su
 * propio `customClass`, reemplaza por completo este objeto en vez de
 * fusionarse con él. Por eso cualquier `.fire()` que necesite un color de
 * botón distinto (p. ej. confirmaciones destructivas en rojo) debe
 * spread-earlo: `customClass: { ...swalCustomClass, confirmButton: '...' }`.
 */
export const swalCustomClass = {
  popup: 'rounded-card shadow-raised font-body border border-outline-variant bg-card max-w-sm',
  title: 'type-section text-text-primary mt-tight',
  htmlContainer: 'type-body text-text-secondary mt-micro',
  confirmButton: 'rounded-md bg-primary px-card py-tight text-body font-medium text-on-primary hover:bg-primary/90 transition-colors',
  cancelButton: 'rounded-md bg-transparent border border-outline-variant px-card py-tight text-body font-medium text-text-primary hover:bg-muted transition-colors',
  actions: 'gap-inline mt-stack w-full justify-center',
  icon: 'scale-75 mb-0', // Make the icon smaller and reduce margin
};

// Check estático (sin el dibujo animado por defecto de SweetAlert2): se
// inyecta como `iconHtml` en vez de pelear con sus keyframes CSS, que dejan
// el ícono a medio dibujar si se les desactiva la animación.
const CHECK_ICON_HTML =
  '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" style="stroke:var(--color-on-status-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 7"/></svg>';

// T-293 (HU-176): sweetalert2 viajaba en el JS inicial de todo el dashboard
// aunque solo se usa al mostrar un aviso. Se importa la primera vez que se
// llama a `fire` y la instancia se reutiliza; si la carga falla, se reintenta
// en la siguiente llamada.
type SwalInstance = typeof import('sweetalert2').default;
let base: Promise<SwalInstance> | null = null;

function cargarBase(): Promise<SwalInstance> {
  base ??= import('sweetalert2')
    .then(({ default: Swal }) =>
      Swal.mixin({
        customClass: swalCustomClass,
        buttonsStyling: false,
        confirmButtonText: 'Aceptar',
        padding: '1.25rem',
      }),
    )
    .catch((error: unknown) => {
      base = null;
      throw error;
    });
  return base;
}

const uvgSwal = {
  fire: async (options: SweetAlertOptions): Promise<SweetAlertResult> => {
    const swal = await cargarBase();
    return swal.fire(
      options.icon === 'success' && !options.iconHtml ? { ...options, iconHtml: CHECK_ICON_HTML } : options,
    );
  },
};

export default uvgSwal;
