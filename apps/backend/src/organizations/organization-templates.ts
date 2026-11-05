/**
 * MEJ-156: plantillas al crear una organización; solo sugieren la descripción. El frontend las lee de
 * `GET /organizaciones/plantillas`.
 */
export const PLANTILLAS_ORGANIZACION = {
  CLUB: {
    etiqueta: 'Club',
    descripcion: 'Club estudiantil para reunirnos alrededor de un interés común, organizar actividades y proyectos entre sus integrantes.',
  },
  VOLUNTARIADO: {
    etiqueta: 'Voluntariado',
    descripcion: 'Grupo de voluntariado que coordina jornadas de servicio y proyectos con impacto en la comunidad.',
  },
  INVESTIGACION: {
    etiqueta: 'Investigación',
    descripcion: 'Grupo de investigación que comparte avances, bibliografía y resultados de sus proyectos.',
  },
  OTRO: {
    etiqueta: 'Otro',
    descripcion: '',
  },
} as const;

type PlantillaOrganizacion = keyof typeof PLANTILLAS_ORGANIZACION;

const CLAVES_PLANTILLA = Object.keys(PLANTILLAS_ORGANIZACION) as PlantillaOrganizacion[];

export const listarPlantillas = () =>
  CLAVES_PLANTILLA.map((clave) => ({
    clave,
    etiqueta: PLANTILLAS_ORGANIZACION[clave].etiqueta,
    descripcion: PLANTILLAS_ORGANIZACION[clave].descripcion,
  }));
