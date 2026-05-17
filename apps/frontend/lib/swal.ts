import Swal from 'sweetalert2';

const uvgSwal = Swal.mixin({
  customClass: {
    popup: 'rounded-2xl shadow-xl font-body border border-outline-variant/30 bg-surface-container-lowest max-w-sm',
    title: 'text-base font-bold text-primary font-headline mt-2',
    htmlContainer: 'text-xs text-on-surface-variant leading-relaxed mt-1',
    confirmButton: 'rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary/95 transition-all shadow-md',
    cancelButton: 'rounded-xl bg-transparent border border-outline-variant/50 px-5 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-highest transition-colors',
    actions: 'gap-3 mt-4 w-full justify-center',
    icon: 'scale-75 mb-0', // Make the icon smaller and reduce margin
  },
  buttonsStyling: false,
  confirmButtonText: 'Aceptar',
  padding: '1.25rem',
  color: 'inherit',
});

export default uvgSwal;
