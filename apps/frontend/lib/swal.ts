import Swal from 'sweetalert2';

const uvgSwal = Swal.mixin({
  customClass: {
    confirmButton:
      'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors',
    cancelButton:
      'rounded-lg bg-transparent border border-outline px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors',
    popup: 'rounded-xl shadow-lg font-body',
    title: 'text-lg font-semibold text-on-surface mb-2',
    htmlContainer: 'text-sm text-tertiary',
    actions: 'gap-2',
  },
  buttonsStyling: false,
  confirmButtonText: 'Aceptar',
  padding: '1.5rem',
});

export default uvgSwal;
