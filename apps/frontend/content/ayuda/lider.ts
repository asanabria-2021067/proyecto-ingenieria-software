import type { PreguntaAyuda } from './tipos';

export const AYUDA_LIDER: PreguntaAyuda[] = [
  {
    id: 'lider-crear-proyecto',
    pregunta: '¿Cómo creo un proyecto y lo publico?',
    respuesta:
      'Crea el proyecto con su descripción y sus roles, y envíalo a revisión. Administración lo revisa y, si lo aprueba, queda publicado para que otros estudiantes se postulen. Si piden cambios, los verás en el mensaje de la revisión.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-postulaciones',
    pregunta: '¿Cómo acepto o rechazo postulaciones?',
    respuesta:
      'En tu proyecto abre las postulaciones, lee la justificación de cada persona y acepta o rechaza. Quien sea aceptado queda como participante del rol que pidió y recibe una notificación. También puedes invitar directamente a una persona a un rol.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-iniciar-sprint',
    pregunta: '¿Cómo inicio un sprint?',
    respuesta:
      'En la sección de sprints del proyecto elige la fecha de fin planeada e inicia el sprint. Solo puede haber un sprint activo a la vez. Las tareas que dejaste con destino «siguiente sprint» entran solas al nuevo.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-tareas-tablero',
    pregunta: '¿Cómo creo y asigno tareas en el tablero?',
    respuesta:
      'Crea la tarea con su título, prioridad, estimación y fecha límite, y asígnala a un participante. Puedes agruparlas en hitos, agregar un checklist, indicar que una tarea bloquea a otra y guardar plantillas para repetir tareas parecidas. Cada tarea tiene comentarios donde puedes mencionar a alguien con @.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-cerrar-sprint',
    pregunta: '¿Cómo finalizo y cierro un sprint?',
    respuesta:
      'Primero finalizas el sprint y luego lo cierras. Antes de cerrar revisa el resumen de horas por integrante. Al cerrar se acreditan las horas de cada participante y decides qué pasa con las tareas pendientes: pasan al siguiente sprint o vuelven al backlog.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-reportes',
    pregunta: '¿Dónde veo el avance y los reportes del proyecto?',
    respuesta:
      'La analítica de sprints muestra el burndown, las tareas completadas y la comparación entre sprints. Desde los reportes del proyecto puedes exportar el avance en CSV o PDF para compartirlo.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-solicitudes-salida',
    pregunta: '¿Qué hago cuando alguien pide salir del equipo?',
    respuesta:
      'Las solicitudes de salida aparecen en tu proyecto. Revisa el motivo y resuélvela: al aceptarla, la persona deja de participar y sus horas ya acreditadas se conservan. Si tenía tareas asignadas, reasígnalas.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-cerrar-proyecto',
    pregunta: '¿Cómo cierro el proyecto?',
    respuesta:
      'Cuando el trabajo terminó, prepara el cierre desde el proyecto y envíalo a administración. Antes revisa que no queden sprints abiertos ni horas por resolver. Administración revisa la solicitud y, si todo está en orden, el proyecto pasa a cerrado.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'lider-ejemplo-primer-proyecto',
    pregunta: '¿Qué es el sprint de ejemplo de mi primer proyecto?',
    respuesta:
      'Cuando tu primer proyecto ya está publicado o en progreso, al abrir su tablero te ofrecemos empezar con un sprint y unas tareas de ejemplo para conocer el tablero. Todo el contenido de ejemplo está marcado y lo puedes borrar de una vez cuando ya no lo necesites.',
    ruta: '/dashboard/projects/mine',
  },
];
