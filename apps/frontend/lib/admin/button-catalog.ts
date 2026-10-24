/**
 * Catálogo de botones (vista Diagnóstico → Botones): muestras de los botones que hoy se
 * escriben con clases en línea, sin un componente ni una constante exportada que importar.
 *
 * Cada muestra guarda el archivo de donde sale y los fragmentos de clase tal como están allí.
 * `test/button-catalog.spec.ts` comprueba que cada fragmento sigue existiendo, literal, en su
 * archivo: si alguien cambia ese botón sin actualizar el catálogo, la prueba falla. Los
 * botones que sí se pueden importar no pasan por aquí: la vista los importa directamente.
 */

export interface MuestraInline {
  etiqueta: string;
  /** Ruta desde `apps/frontend`. */
  archivo: string;
  /** Fragmentos de `className` presentes, literales, en `archivo`; se pintan unidos. */
  clases: string[];
  disabled?: boolean;
  /** Muestra solo el icono (botones de icono); `etiqueta` queda como nombre accesible. */
  soloIcono?: boolean;
  /** Las clases van sobre el componente `Button` con esta variante, como en su archivo; sin ella, sobre un `<button>`. */
  variante?: 'default' | 'outline';
  tamano?: 'sm';
}

export type FamiliaInline =
  | 'barraSuperior'
  | 'plegado'
  | 'accionFila'
  | 'grisAVerde'
  | 'estadoVacio'
  | 'pieDialogo'
  | 'compactos'
  | 'enlaces'
  | 'chips'
  | 'conmutadores'
  | 'chat'
  | 'cerrar'
  | 'formularios'
  | 'flotante'
  | 'paginacion'
  | 'pieTarjeta';

export const BOTONES_INLINE: Record<FamiliaInline, MuestraInline[]> = {
  barraSuperior: [
    {
      etiqueta: 'Cambiar tema',
      archivo: 'components/theme-toggle.tsx',
      clases: ['flex size-10 items-center justify-center rounded-md bg-muted text-text-primary motion-icon hover:bg-surface-container-high'],
      soloIcono: true,
    },
    {
      etiqueta: 'Repetir tour de bienvenida',
      archivo: 'components/dashboard/DashboardLayout.tsx',
      clases: ['flex size-10 items-center justify-center rounded-md bg-muted text-text-secondary motion-icon hover:bg-surface-container-high hover:text-text-primary'],
      soloIcono: true,
    },
    {
      etiqueta: 'Actualizar',
      archivo: 'components/admin/AdminLayout.tsx',
      clases: [
        'flex size-10 items-center justify-center rounded-md bg-muted text-text-secondary outline-none motion-icon hover:bg-surface-container-high hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60',
      ],
      soloIcono: true,
    },
    {
      etiqueta: 'Notificaciones',
      archivo: 'components/layout/notifications-bell.tsx',
      clases: ['relative flex items-center justify-center h-10 w-10 rounded-md text-on-surface hover:bg-surface-container-high motion-icon cursor-pointer'],
      soloIcono: true,
    },
  ],
  plegado: [
    {
      etiqueta: 'Plegar la sidebar del proyecto',
      archivo: 'components/projects/project-sidebar.tsx',
      clases: [
        'flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      ],
      soloIcono: true,
    },
    {
      etiqueta: 'Acciones del proyecto',
      archivo: 'components/projects/navigation/project-actions-menu.tsx',
      clases: [
        'flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-surface-container-high hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      ],
      soloIcono: true,
    },
  ],
  accionFila: [
    {
      etiqueta: 'Ver perfil',
      archivo: 'app/dashboard/admin/usuarios/page.tsx',
      clases: ['flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface motion-control motion-focus hover:bg-primary hover:text-on-primary'],
    },
    {
      etiqueta: 'Ver detalle',
      archivo: 'components/admin/security/security-events-table.tsx',
      clases: ['flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface motion-control motion-focus hover:bg-primary hover:text-on-primary'],
    },
    {
      etiqueta: 'Limpiar filtros (sin filtros)',
      archivo: 'components/admin/security/security-events-filters.tsx',
      clases: [
        'flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface motion-control motion-focus enabled:hover:bg-primary enabled:hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-50',
      ],
      disabled: true,
    },
    {
      etiqueta: 'Generar enlace',
      archivo: 'app/dashboard/admin/solicitudes-recuperacion/page.tsx',
      clases: ['flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-on-primary motion-action motion-glow-primary motion-focus hover:bg-primary/90 disabled:opacity-50'],
    },
  ],
  grisAVerde: [
    {
      etiqueta: 'Cancelar (fichas del administrador)',
      archivo: 'components/admin/ProjectFeedbackSheet.tsx',
      clases: ['flex items-center gap-2 rounded-md bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface motion-control motion-focus hover:bg-primary hover:text-on-primary'],
    },
    {
      etiqueta: 'Cancelar (Mi proyecto, estudiante)',
      archivo: 'app/dashboard/projects/mine/[id]/my-project-view-client.tsx',
      clases: ['flex items-center gap-2 rounded-md bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface motion-control motion-focus hover:bg-primary hover:text-on-primary'],
    },
  ],
  estadoVacio: [
    {
      etiqueta: 'Reintentar',
      archivo: 'app/dashboard/error.tsx',
      clases: ['inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary motion-action motion-glow-primary motion-focus hover:bg-primary/90'],
    },
    {
      etiqueta: 'Explorar proyectos',
      archivo: 'app/dashboard/projects/mine/page.tsx',
      clases: ['inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface-container-lowest px-5 py-2.5 text-sm font-bold text-on-surface motion-control motion-focus hover:border-outline hover:bg-surface-container'],
    },
    {
      etiqueta: 'Limpiar filtros (Gestión de Usuarios)',
      archivo: 'app/dashboard/admin/usuarios/page.tsx',
      clases: ['flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium text-tertiary hover:bg-surface-container-high motion-control motion-focus'],
    },
  ],
  pieDialogo: [
    {
      etiqueta: 'Cancelar',
      variante: 'outline',
      archivo: 'components/projects/create-milestone-dialog.tsx',
      clases: ['h-10 rounded-md border-outline-variant text-xs font-bold'],
    },
    {
      etiqueta: 'Crear hito',
      variante: 'default',
      archivo: 'components/projects/create-milestone-dialog.tsx',
      clases: ['h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90 motion-glow-primary'],
    },
    {
      etiqueta: 'Crear chat',
      variante: 'default',
      archivo: 'components/chat-dock/new-chat-dialog.tsx',
      clases: ['h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground motion-glow-primary'],
    },
    {
      etiqueta: 'Salir del proyecto',
      variante: 'default',
      archivo: 'components/projects/leave-project-modal.tsx',
      clases: ['h-10 gap-1.5 rounded-md bg-orange-500 text-xs font-bold text-white hover:bg-orange-600 motion-glow-warning'],
    },
    {
      etiqueta: 'Cancelar (ancho completo en móvil)',
      variante: 'outline',
      archivo: 'components/leadership/leadership-change-dialog.tsx',
      clases: ['h-10 w-full rounded-md border-outline-variant text-sm font-semibold sm:w-auto'],
    },
    {
      etiqueta: 'Confirmar (ancho completo en móvil)',
      variante: 'default',
      archivo: 'components/leadership/leadership-change-dialog.tsx',
      clases: ['h-10 w-full gap-1.5 rounded-md text-sm font-bold sm:w-auto'],
    },
  ],
  compactos: [
    {
      etiqueta: 'Neutral',
      variante: 'outline',
      tamano: 'sm',
      archivo: 'components/closure/closure-documents-manager.tsx',
      clases: ['h-9 gap-1.5 rounded-md border-outline-variant text-xs font-semibold'],
    },
    {
      etiqueta: 'Primario en contorno',
      variante: 'outline',
      tamano: 'sm',
      archivo: 'components/projects/hitos-section.tsx',
      clases: ['rounded-md border-primary text-xs font-semibold text-primary hover:bg-primary/10'],
    },
    {
      etiqueta: 'Primario suave',
      variante: 'outline',
      tamano: 'sm',
      archivo: 'components/projects/read-only-project-banner.tsx',
      clases: ['h-9 rounded-md border-primary/40 text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary'],
    },
  ],
  enlaces: [
    {
      etiqueta: 'Ver todos (administrador)',
      archivo: 'app/dashboard/admin/page.tsx',
      clases: ['type-meta -my-tight inline-flex items-center gap-micro rounded-control py-tight font-semibold text-primary outline-none motion-link focus-visible:ring-2 focus-visible:ring-primary/40'],
    },
    {
      etiqueta: 'Ver (fila de bandeja)',
      archivo: 'app/dashboard/admin/apelaciones/appeals-inbox-client.tsx',
      clases: ['ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary motion-link'],
    },
    {
      etiqueta: 'Ver todos (estudiante)',
      archivo: 'app/dashboard/page.tsx',
      clases: ['type-body font-medium text-primary motion-link'],
    },
    {
      etiqueta: 'Regístrate',
      archivo: 'app/login/page.tsx',
      clases: ['font-bold text-primary motion-link'],
    },
    {
      etiqueta: 'Agregar requisito',
      archivo: 'app/dashboard/projects/mine/form/Step2.tsx',
      clases: ['flex items-center gap-1 text-xs text-primary font-bold motion-link'],
    },
  ],
  chips: [
    {
      etiqueta: 'Todos (activo)',
      archivo: 'app/dashboard/proyectos/page.tsx',
      clases: ['shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold motion-select', 'bg-primary text-on-primary'],
    },
    {
      etiqueta: 'Académico',
      archivo: 'app/dashboard/proyectos/page.tsx',
      clases: ['shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold motion-select', 'bg-surface-container text-text-secondary hover:bg-surface-container-high'],
    },
    {
      etiqueta: 'React (elegida)',
      archivo: 'components/profile/CompleteProfileDialog.tsx',
      clases: ['rounded-full px-3 py-1 text-xs font-medium motion-select', 'bg-primary text-on-primary'],
    },
    {
      etiqueta: 'Python',
      archivo: 'components/profile/CompleteProfileDialog.tsx',
      clases: ['rounded-full px-3 py-1 text-xs font-medium motion-select', 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'],
    },
  ],
  conmutadores: [
    {
      etiqueta: 'Destacados (activo)',
      archivo: 'app/dashboard/page.tsx',
      clases: ['type-meta flex items-center gap-tight rounded-pill px-inline py-micro font-semibold motion-select', 'bg-action text-on-action'],
    },
    {
      etiqueta: 'Disponibles',
      archivo: 'app/dashboard/page.tsx',
      clases: ['type-meta flex items-center gap-tight rounded-pill px-inline py-micro font-semibold motion-select', 'text-text-secondary hover:text-text-primary'],
    },
    {
      etiqueta: 'Vista en tarjetas (activa)',
      archivo: 'app/dashboard/personas/page.tsx',
      clases: ['flex size-8 items-center justify-center rounded-control motion-select', 'bg-action text-on-action'],
      soloIcono: true,
    },
    {
      etiqueta: 'Vista en lista',
      archivo: 'app/dashboard/personas/page.tsx',
      clases: ['flex size-8 items-center justify-center rounded-control motion-select', 'text-text-secondary hover:bg-muted hover:text-text-primary'],
      soloIcono: true,
    },
    {
      etiqueta: 'Semana (activa)',
      archivo: 'app/dashboard/calendario/page.tsx',
      clases: [
        'rounded-pill px-3 py-1 text-xs font-bold outline-none motion-select focus-visible:ring-2 focus-visible:ring-primary/60',
        'bg-surface-container-lowest text-on-surface shadow-card',
      ],
    },
    {
      etiqueta: 'Mes',
      archivo: 'app/dashboard/calendario/page.tsx',
      clases: ['rounded-pill px-3 py-1 text-xs font-bold outline-none motion-select focus-visible:ring-2 focus-visible:ring-primary/60', 'text-on-surface-variant'],
    },
  ],
  chat: [
    {
      etiqueta: 'Nuevo chat',
      archivo: 'components/chat-dock/chat-list-popover.tsx',
      clases: ['flex size-7 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/10 hover:text-text-primary'],
      soloIcono: true,
    },
    {
      etiqueta: 'Buscar en el chat',
      archivo: 'components/chat-dock/chat-window.tsx',
      clases: ['motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary'],
      soloIcono: true,
    },
    {
      etiqueta: 'Descargar adjunto (deshabilitado)',
      archivo: 'components/chat-dock/chat-adjunto.tsx',
      clases: ['motion-icon motion-focus rounded-md p-1.5 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary disabled:opacity-50'],
      soloIcono: true,
      disabled: true,
    },
  ],
  cerrar: [
    {
      etiqueta: 'Cerrar diálogo',
      archivo: 'components/projects/task-form-dialog.tsx',
      clases: [
        'inline-flex size-9 items-center justify-center rounded-md text-tertiary motion-icon hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      ],
      soloIcono: true,
    },
    {
      etiqueta: 'Descartar anuncio',
      archivo: 'components/anuncios/anuncio-banner.tsx',
      clases: ['motion-icon flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/10'],
      soloIcono: true,
    },
    {
      etiqueta: 'Quitar invitado',
      archivo: 'components/calendar/invitados-field.tsx',
      clases: ['inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary motion-icon motion-focus hover:bg-error/10 hover:text-error'],
      soloIcono: true,
    },
  ],
  formularios: [
    {
      etiqueta: 'Anterior',
      archivo: 'app/dashboard/projects/mine/form/page.tsx',
      clases: ['flex items-center gap-2 text-sm font-bold text-tertiary hover:text-on-surface motion-control motion-focus'],
    },
    {
      etiqueta: 'Siguiente',
      archivo: 'app/dashboard/projects/mine/form/page.tsx',
      clases: ['flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-md text-sm font-bold hover:bg-primary/90 motion-action motion-glow-primary motion-focus'],
    },
    {
      etiqueta: 'Agregar rol',
      archivo: 'app/dashboard/projects/mine/form/Step2.tsx',
      clases: [
        'w-full flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-outline-variant text-sm font-bold text-primary hover:border-primary hover:bg-primary/5 motion-control motion-focus',
      ],
    },
  ],
  flotante: [
    {
      etiqueta: 'Mensajes',
      archivo: 'components/chat-dock/chat-dock.tsx',
      clases: [
        'flex h-12 w-72 items-center gap-2 rounded-t-md border border-b-0 border-outline-variant bg-surface-container-lowest px-5 text-sm font-semibold text-on-surface shadow-raised motion-control hover:border-outline hover:bg-surface-container-high hover:shadow-lg',
      ],
    },
  ],
  paginacion: [
    {
      etiqueta: 'Anterior (bitácora, deshabilitado)',
      archivo: 'app/dashboard/proyectos/[id]/bitacora/page.tsx',
      clases: ['rounded-md border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface motion-control motion-focus hover:border-outline hover:bg-surface-container-low disabled:opacity-40'],
      disabled: true,
    },
    {
      etiqueta: 'Siguiente (bitácora)',
      archivo: 'app/dashboard/proyectos/[id]/bitacora/page.tsx',
      clases: ['rounded-md border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface motion-control motion-focus hover:border-outline hover:bg-surface-container-low disabled:opacity-40'],
    },
  ],
  pieTarjeta: [
    {
      etiqueta: 'Ver proyecto (cierre solicitado)',
      variante: 'default',
      archivo: 'components/projects/available-project-card.tsx',
      clases: ['motion-glow-primary bg-[#0A4232] text-white hover:bg-[#08352A] dark:bg-primary dark:text-on-primary dark:hover:bg-primary/90'],
    },
  ],
};
