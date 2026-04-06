import Swal from 'sweetalert2';

const uvgSwal = Swal.mixin({
  customClass: {
    confirmButton:
      'rounded-xl bg-primary-container px-6 py-3 font-bold text-white shadow-md hover:bg-primary transition-all',
    cancelButton:
      'rounded-xl bg-surface-container px-6 py-3 font-bold text-on-surface shadow-md hover:bg-surface-container-high transition-all',
    popup: 'rounded-2xl font-body',
    title: 'font-headline text-on-surface',
    htmlContainer: 'text-tertiary',
  },
  buttonsStyling: false,
  confirmButtonText: 'Aceptar',
});

export default uvgSwal;
