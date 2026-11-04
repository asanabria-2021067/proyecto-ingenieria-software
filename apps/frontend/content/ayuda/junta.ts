import type { PreguntaAyuda } from './tipos';

export const AYUDA_JUNTA: PreguntaAyuda[] = [
  {
    id: 'junta-acceso',
    pregunta: '¿Cómo entro al panel de mi asociación?',
    respuesta:
      'Si administración te nombró en la junta directiva, en el menú aparece «Mi asociación». Si perteneces a más de una, se despliega la lista para elegir cuál abrir.',
  },
  {
    id: 'junta-cargo-permiso',
    pregunta: '¿Qué puedo hacer según mi cargo y mi nivel de permiso?',
    respuesta:
      'Todos los miembros de la junta ven el panel de la asociación. Quienes tienen permiso de Presidente o de Editor además pueden publicar anuncios y crear proyectos a nombre de la asociación. Tu cargo y tu nivel de permiso los define administración.',
  },
  {
    id: 'junta-estudiantes',
    pregunta: '¿Cómo veo a los estudiantes de la asociación y sus horas?',
    respuesta:
      'En el panel de la asociación está la lista de estudiantes con su avance de horas. La puedes descargar en CSV o en PDF para tus reportes.',
  },
  {
    id: 'junta-proyectos',
    pregunta: '¿Cómo reviso los proyectos de la asociación?',
    respuesta:
      'El panel muestra los proyectos de la asociación con su estado, y el portafolio reúne los que ya terminaron. Puedes exportar el listado de proyectos en CSV o PDF.',
  },
  {
    id: 'junta-crear-proyecto',
    pregunta: '¿Cómo creo un proyecto a nombre de la asociación?',
    respuesta:
      'Al crear el proyecto elige la asociación como dueña. En el paso de participantes puedes buscar a los estudiantes de la asociación y sumarlos desde el inicio. Para hacerlo necesitas permiso de Presidente o de Editor.',
  },
  {
    id: 'junta-anuncios',
    pregunta: '¿Cómo publico un anuncio para la asociación?',
    respuesta:
      'En la sección de anuncios del panel escribe el título y el mensaje y publícalo. Lo ven las personas que siguen a la asociación. Si ya no aplica, puedes despublicarlo.',
  },
  {
    id: 'junta-seguidores',
    pregunta: '¿Cómo logro que más estudiantes sigan a la asociación?',
    respuesta:
      'Los estudiantes pueden seguir a una asociación desde su página y así reciben sus anuncios y los proyectos nuevos. Mantener anuncios y proyectos al día es la mejor forma de que más personas la sigan.',
  },
];
