import type { PreguntaAyuda } from './tipos';

export const AYUDA_ESTUDIANTE: PreguntaAyuda[] = [
  {
    id: 'estudiante-horas-semestre',
    pregunta: '¿Cómo declaro mis horas de beca y de extensión del semestre?',
    respuesta:
      'En «Mis Horas» registras la meta del semestre y las horas que ya hiciste fuera de la plataforma, tanto de beca como de extensión. El semestre se calcula solo: el primero va de enero a junio y el segundo de julio a diciembre. Las horas que acreditan tus proyectos se suman aparte, así que ahí ves tu avance real frente a la meta.',
    ruta: '/dashboard/mis-horas',
  },
  {
    id: 'estudiante-horas-acreditadas',
    pregunta: '¿Cuándo se acreditan las horas que trabajo en un proyecto?',
    respuesta:
      'Las horas se acreditan cuando el líder cierra el sprint en el que trabajaste. Mientras el sprint siga activo, tus horas aparecen como reportadas, pero todavía no cuentan como acreditadas. Si crees que falta alguna, avísale a tu líder antes de que cierre el sprint.',
    ruta: '/dashboard/mis-horas',
  },
  {
    id: 'estudiante-postular-proyecto',
    pregunta: '¿Cómo me postulo a un proyecto?',
    respuesta:
      'Entra a «Explorar Proyectos», abre el proyecto que te interese y elige el rol al que quieres aplicar. Escribe una justificación breve de por qué eres buena opción y envía la postulación. El líder la revisa y recibes una notificación con su respuesta.',
    ruta: '/dashboard/proyectos',
  },
  {
    id: 'estudiante-estado-postulacion',
    pregunta: '¿Dónde veo cómo van mis postulaciones?',
    respuesta:
      'En «Mis Postulaciones» aparecen todas las que has enviado con su estado: pendiente, aceptada o rechazada. Si el líder te aceptó, el proyecto pasa a tu lista de «Mis Proyectos» y ya puedes ver su tablero y su chat.',
    ruta: '/dashboard/mis-postulaciones',
  },
  {
    id: 'estudiante-tablero-tareas',
    pregunta: '¿Cómo uso el tablero y mis tareas?',
    respuesta:
      'Dentro del proyecto, el tablero muestra las tareas del sprint activo en columnas: por hacer, en progreso, en revisión y hecho. Mueve tus tareas conforme avances y registra el tiempo que les dedicas. En «Mis Tareas» ves juntas las tareas que tienes asignadas en todos tus proyectos.',
    ruta: '/dashboard/mis-tareas',
  },
  {
    id: 'estudiante-mensajes',
    pregunta: '¿Cómo les escribo a mi equipo o a otra persona?',
    respuesta:
      'En «Mensajes» están los chats de tus proyectos y de tus amistades. Para hablar con alguien nuevo, búscalo en «Personas» y envíale una solicitud de amistad. En el chat del proyecto puedes responder mensajes, reaccionar, mencionar con @ y fijar mensajes importantes.',
    ruta: '/dashboard/mensajes',
  },
  {
    id: 'estudiante-unirse-organizacion',
    pregunta: '¿Cómo me uno a una organización?',
    respuesta:
      'Busca la organización desde «Mis Organizaciones» y envía una solicitud para unirte, o acepta la invitación si ya te la mandaron. Cuando te acepten aparece en tu lista y puedes ver sus proyectos, anuncios y calendario.',
    ruta: '/dashboard/organizaciones',
  },
  {
    id: 'estudiante-salir-proyecto',
    pregunta: '¿Cómo salgo de un proyecto?',
    respuesta:
      'Desde el proyecto envía una solicitud de salida explicando el motivo. El líder la revisa y, cuando la resuelve, tu participación termina. Las horas que ya fueron acreditadas se conservan.',
    ruta: '/dashboard/projects/mine',
  },
  {
    id: 'estudiante-constancia-horas',
    pregunta: '¿Puedo descargar una constancia de mis horas?',
    respuesta:
      'Sí. En «Mis Horas» puedes descargar un PDF con las horas acreditadas de un semestre. Solo incluye las horas acreditadas, no las que apenas están reportadas.',
    ruta: '/dashboard/mis-horas',
  },
];
