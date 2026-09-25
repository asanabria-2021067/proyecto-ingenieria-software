import Swal from 'sweetalert2';

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
  confirmButton: 'rounded-control bg-primary px-card py-tight text-body font-medium text-on-primary hover:bg-primary/90 transition-colors',
  cancelButton: 'rounded-control bg-transparent border border-outline-variant px-card py-tight text-body font-medium text-text-primary hover:bg-muted transition-colors',
  actions: 'gap-inline mt-stack w-full justify-center',
  icon: 'scale-75 mb-0', // Make the icon smaller and reduce margin
};

/**
 * T-277: `html`, `title` y `footer` de SweetAlert2 se insertan como HTML
 * (a diferencia de JSX, no se escapan). Todo dato de usuario que se
 * interpole en `html` debe pasar por aquí; para un título sin formato,
 * usar `titleText` en vez de `title`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const uvgSwal = Swal.mixin({
  customClass: swalCustomClass,
  buttonsStyling: false,
  confirmButtonText: 'Aceptar',
  padding: '1.25rem',
});

export default uvgSwal;
