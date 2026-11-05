import type { PreguntaAyuda } from './tipos';

export const AYUDA_COORDINADOR: PreguntaAyuda[] = [
  {
    id: 'coordinador-que-ve',
    pregunta: '¿Qué puedo ver como coordinador académico?',
    respuesta:
      'Puedes explorar los proyectos y ver su detalle, su equipo y su avance, además de tu perfil y tus notificaciones. Tu actividad queda registrada en tu ficha: los proyectos que revisaste y los estudiantes cuyas horas aprobaste.',
    ruta: '/dashboard/proyectos',
  },
  {
    id: 'coordinador-explorar',
    pregunta: '¿Cómo encuentro un proyecto específico?',
    respuesta:
      'En «Explorar Proyectos» usa los filtros y el buscador. También puedes usar el buscador global del encabezado para ir directo a un proyecto o a una persona.',
    ruta: '/dashboard/proyectos',
  },
  {
    id: 'coordinador-horas',
    pregunta: '¿Cómo se acreditan las horas de los estudiantes?',
    respuesta:
      'Las horas de cada participante se acreditan al cerrarse cada sprint del proyecto. Los estudiantes las ven reportadas mientras el sprint está activo y acreditadas después del cierre. Puedes consultar el avance por integrante en la analítica del proyecto.',
  },
  {
    id: 'coordinador-avance',
    pregunta: '¿Cómo reviso el avance de un proyecto?',
    respuesta:
      'Dentro del proyecto abre la analítica de sprints: muestra el burndown, las tareas completadas y la comparación entre sprints. La bitácora registra los cambios importantes con fecha y autor.',
    ruta: '/dashboard/proyectos',
  },
  {
    id: 'coordinador-mensajes',
    pregunta: '¿Cómo me comunico con un equipo?',
    respuesta:
      'Usa «Mensajes» para escribir a las personas con las que tienes amistad en la plataforma. Si necesitas comentar algo de una tarea o un hito, deja un comentario y menciona a la persona con @ para que le llegue la notificación.',
    ruta: '/dashboard/mensajes',
  },
  {
    id: 'coordinador-calendario',
    pregunta: '¿Dónde veo las reuniones y las fechas importantes?',
    respuesta:
      'En «Calendario» aparecen las reuniones y los eventos que te comparten. También puedes exportar el calendario en formato .ics para verlo en tu aplicación de calendario.',
    ruta: '/dashboard/calendario',
  },
  {
    id: 'coordinador-notificaciones',
    pregunta: '¿Cómo controlo qué notificaciones recibo?',
    respuesta:
      'En «Configuración» eliges qué avisos quieres recibir. Los avisos activos aparecen en «Notificaciones» y puedes marcarlos como leídos.',
    ruta: '/dashboard/configuracion',
  },
];
