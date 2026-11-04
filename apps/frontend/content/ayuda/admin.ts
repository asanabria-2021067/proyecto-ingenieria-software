import type { PreguntaAyuda } from './tipos';

export const AYUDA_ADMIN: PreguntaAyuda[] = [
  {
    id: 'admin-bandeja',
    pregunta: '¿Dónde veo todo lo que espera mi decisión?',
    respuesta:
      'En la bandeja de pendientes del panel de administración: reúne las cuentas por aprobar, los proyectos en revisión, las solicitudes de cierre, las recuperaciones de contraseña, las apelaciones y los reportes de problemas, cada uno con su contador. Al elegir uno vas directo a su pantalla.',
    ruta: '/dashboard/admin/bandeja',
  },
  {
    id: 'admin-cuentas',
    pregunta: '¿Cómo apruebo cuentas nuevas?',
    respuesta:
      'Entra a «Cuentas pendientes», revisa los datos y aprueba o rechaza cada cuenta. Puedes aprobar varias a la vez; las que ya no estén pendientes se omiten sin detener el resto.',
    ruta: '/dashboard/admin/cuentas-pendientes',
  },
  {
    id: 'admin-revision-proyectos',
    pregunta: '¿Cómo reviso un proyecto antes de publicarlo?',
    respuesta:
      'Los proyectos enviados a revisión aparecen en la bandeja. Ábrelo, revisa su descripción y sus roles, y apruébalo o devuélvelo con un mensaje claro de lo que debe corregir el líder.',
    ruta: '/dashboard/admin/proyectos',
  },
  {
    id: 'admin-cierre',
    pregunta: '¿Cómo atiendo una solicitud de cierre de proyecto?',
    respuesta:
      'Abre la solicitud desde la bandeja, revisa que los sprints estén cerrados y las horas resueltas, y aprueba el cierre o devuélvela al líder con observaciones.',
    ruta: '/dashboard/admin/proyectos',
  },
  {
    id: 'admin-recuperacion',
    pregunta: '¿Cómo atiendo una recuperación de contraseña?',
    respuesta:
      'En «Solicitudes de recuperación» verifica que el carné y el correo correspondan a la persona y atiende la solicitud. Al atenderla queda registrado quién la resolvió.',
    ruta: '/dashboard/admin/solicitudes-recuperacion',
  },
  {
    id: 'admin-reportes-problema',
    pregunta: '¿Cómo atiendo los reportes de problemas de los usuarios?',
    respuesta:
      'Cuando alguien usa «Reportar un problema» te llega una notificación y el reporte aparece en la bandeja de pendientes con la pantalla, el navegador, la descripción y la captura si la adjuntó. Cuando lo resuelvas, márcalo como atendido.',
    ruta: '/dashboard/admin/bandeja',
  },
  {
    id: 'admin-horas',
    pregunta: '¿Dónde veo las horas de los estudiantes?',
    respuesta:
      'En «Horas» aparecen las horas de beca y de extensión de los estudiantes activos, tanto las declaradas por ellos como las acreditadas por proyectos, frente a la meta del semestre.',
    ruta: '/dashboard/admin/horas',
  },
  {
    id: 'admin-usuarios-roles',
    pregunta: '¿Cómo gestiono usuarios y sus roles?',
    respuesta:
      'En «Usuarios» buscas a cualquier persona, ves su ficha y cambias su estado o sus roles. La junta de cada asociación se nombra desde «Asociaciones».',
    ruta: '/dashboard/admin/usuarios',
  },
  {
    id: 'admin-metricas',
    pregunta: '¿Dónde consulto las métricas de la plataforma?',
    respuesta:
      'En «Métricas» ves la actividad por periodo: usuarios, proyectos y avance. Las métricas de entidades resumen lo que ocurre en organizaciones y asociaciones.',
    ruta: '/dashboard/admin/metricas',
  },
];
