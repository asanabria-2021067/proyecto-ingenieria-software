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
  popup: 'rounded-2xl shadow-xl font-body border border-outline-variant/30 bg-surface-container-lowest max-w-sm',
  title: 'text-base font-bold text-primary font-headline mt-2',
  htmlContainer: 'text-xs text-on-surface-variant leading-relaxed mt-1',
  confirmButton: 'rounded-xl bg-primary px-5 py-2 text-xs font-bold text-on-primary hover:bg-primary/90 transition-all shadow-md mx-4',
  cancelButton: 'rounded-xl bg-transparent border border-outline-variant/50 px-5 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-highest transition-colors mx-4',
  actions: 'gap-10 mt-4 w-full justify-center',
  icon: 'scale-75 mb-0', // Make the icon smaller and reduce margin
};

const uvgSwal = Swal.mixin({
  customClass: swalCustomClass,
  buttonsStyling: false,
  confirmButtonText: 'Aceptar',
  padding: '1.25rem',
});

export default uvgSwal;
