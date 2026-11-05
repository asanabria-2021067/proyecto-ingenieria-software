/**
 * MEJ-109: el tramo acredita solo las horas de su titular. Los registros de otros responsables viven en
 * el mismo tramo (para el total de la tarea) pero no entran en la cache, el cierre ni la atribucion.
 */
export function registrosDelTitular<R extends { idUsuario: number }>(tramo: {
  idUsuario: number;
  registrosTiempo: R[];
}): R[] {
  return tramo.registrosTiempo.filter((registro) => registro.idUsuario === tramo.idUsuario);
}
