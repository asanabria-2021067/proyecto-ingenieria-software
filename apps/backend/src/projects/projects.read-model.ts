import { EstadoHito, EstadoProyecto } from '@prisma/client';
import { calcularProgresoHito } from '../common/hito-progreso';

/**
 * Constantes de estados, selects de Prisma y cálculos de avance de Proyecto.
 * Extraído de ProjectsService sin cambios de comportamiento.
 */

/**
 * T-252: único lugar donde viven los pesos del orden ponderado de
 * "Proyectos Disponibles". `amigoParticipante` es por amigo (así que 2
 * amigos ya superan `mismaCarrera`); `mismaCarrera` es fijo, aplica una
 * sola vez por proyecto sin importar cuántos roles pidan esa carrera.
 */
export const PESOS_ORDEN_DISPONIBLES = {
  amigoParticipante: 2,
  mismaCarrera: 1,
} as const;

/** Estados que aparecen en el catálogo público y en destacados. */
export const ESTADOS_VISIBLES: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

/**
 * Estados cuyo DETALLE sigue siendo consultable. Es una lista distinta de
 * `ESTADOS_VISIBLES` a propósito: un proyecto en solicitud de cierre ya no se
 * ofrece en el catálogo —no admite postulaciones— pero su espacio de trabajo
 * debe seguir abriéndose, empezando por el del propio líder, que necesita ver
 * el estado de su solicitud.
 *
 * Antes compartían lista y el detalle respondía 404 en cuanto se solicitaba el
 * cierre: el proyecto «desaparecía» para todo el mundo.
 *
 * `CERRADO` NO entra: se lee como histórico completo por su propia ruta.
 */
export const ESTADOS_CON_DETALLE: EstadoProyecto[] = [
  ...ESTADOS_VISIBLES,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
];

export const ESTADOS_EDITABLES: EstadoProyecto[] = [
  EstadoProyecto.BORRADOR,
  EstadoProyecto.OBSERVADO,
];

// Un proyecto ya publicado / en progreso admite edición PARCIAL: solo un
// subconjunto seguro de campos, mediante una lista explícita (nunca el DTO
// completo de creación). No cambia estado, revisión, postulaciones, roles,
// organizaciones, participantes, tareas, hitos, comentarios ni notificaciones.
export const ESTADOS_EDITABLE_PARCIAL: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

function calcularAvanceTareas(tareas: { estadoTarea: string }[]) {
  const total = tareas.length;
  const hecho = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  const porHacer = tareas.filter((t) => t.estadoTarea === 'POR_HACER').length;
  const enProgreso = total - hecho - porHacer;

  return {
    porcentaje: total === 0 ? 0 : Math.round((hecho / total) * 100),
    total,
    porHacer,
    enProgreso,
    hecho,
  };
}

/**
 * El estado de un hito, históricamente, NUNCA se leía de `Hito.estadoHito`:
 * esa columna se fijaba en PENDIENTE al crear el hito (createHito) y ningún
 * flujo la volvía a escribir, así que quedaba congelada aunque se
 * completaran todas sus tareas (bug de cálculo de la barra de progreso de
 * hitos). A12 corrige la persistencia (ver `TasksService` — sincroniza
 * `Hito.estadoHito` en los write-paths reales de `estadoTarea`), pero este
 * agregado de PROYECTO sigue derivando en memoria a partir de las tareas
 * (`tarea.idHito`), nunca de la columna persistida: es un GET puro, no debe
 * depender de que la sincronización ya haya corrido. La fórmula por-Hito
 * (% = hechas/total; COMPLETADO al 100% con al menos una tarea, EN_PROGRESO
 * si %>0, PENDIENTE en otro caso, incluye hitos sin tareas) es la misma
 * semántica canónica de `calcularProgresoHito` (src/common/hito-progreso.ts,
 * A12) — única fuente de verdad, reutilizada aquí en vez de duplicada.
 */
function calcularAvanceHitos(
  hitos: { idHito: number }[],
  tareas: { idHito: number | null; estadoTarea: string }[],
) {
  const total = hitos.length;
  let completado = 0;
  let pendiente = 0;
  let enProgreso = 0;

  for (const hito of hitos) {
    const tareasHito = tareas.filter((t) => t.idHito === hito.idHito);
    const { estadoHito } = calcularProgresoHito(tareasHito);

    if (estadoHito === EstadoHito.COMPLETADO) {
      completado += 1;
    } else if (estadoHito === EstadoHito.EN_PROGRESO) {
      enProgreso += 1;
    } else {
      pendiente += 1;
    }
  }

  return {
    porcentaje: total === 0 ? 0 : Math.round((completado / total) * 100),
    total,
    pendiente,
    enProgreso,
    completado,
  };
}

/**
 * Hito.fechaLimite es @db.Date: se lee/escribe igual que Tarea.fechaLimite
 * en TasksService (mismo comportamiento verificado de Prisma con columnas
 * @db.Date), anclando siempre a medianoche UTC del día calendario y
 * extrayendo con toISOString() para no depender de la zona horaria del proceso.
 */
export function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** % de avance del proyecto, desglosado por hitos y por tareas. */
export function calcularAvanceProyecto(
  tareas: { estadoTarea: string; idHito: number | null }[],
  hitos: { idHito: number }[],
) {
  return {
    tareas: calcularAvanceTareas(tareas),
    hitos: calcularAvanceHitos(hitos, tareas),
  };
}

export const proyectoListSelect = {
  idProyecto: true,
  tituloProyecto: true,
  descripcionProyecto: true,
  tipoProyecto: true,
  estadoProyecto: true,
  modalidadProyecto: true,
  fechaPublicacion: true,
  creador: {
    select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
  },
  organizaciones: {
    select: {
      organizacion: { select: { nombreOrganizacion: true } },
    },
  },
  intereses: {
    select: { interes: { select: { nombreInteres: true } } },
  },
  // Solo `cupos` por rol: lo mínimo para que el listado calcule roles con
  // disponibilidad real (cupos > 0) sin exponer requisitos/postulaciones.
  roles: { select: { cupos: true } },
  _count: { select: { roles: true } },
} as const;

export const proyectoDetalleSelect = {
  idProyecto: true,
  tituloProyecto: true,
  descripcionProyecto: true,
  objetivosProyecto: true,
  tipoProyecto: true,
  estadoProyecto: true,
  modalidadProyecto: true,
  ubicacionProyecto: true,
  contextoAcademico: true,
  urlRecursoExterno: true,
  fechaPublicacion: true,
  fechaInicio: true,
  fechaFinEstimada: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  creadoPor: true,
  creador: {
    select: { idUsuario: true, nombre: true, apellido: true, correo: true },
  },
  organizaciones: {
    select: {
      idProyectoOrganizacion: true,
      rolOrganizacion: true,
      fechaVinculacion: true,
      organizacion: {
        select: {
          idOrganizacion: true,
          nombreOrganizacion: true,
          tipoOrganizacion: true,
          descripcionOrganizacion: true,
          correoContacto: true,
          telefonoContacto: true,
          sitioWeb: true,
          logoUrl: true,
          estadoOrganizacion: true,
        },
      },
    },
  },
  intereses: {
    select: {
      idProyectoInteres: true,
      interes: {
        select: { idInteres: true, nombreInteres: true, descripcionInteres: true },
      },
    },
  },
  roles: {
    select: {
      idRolProyecto: true,
      nombreRol: true,
      descripcionRolProyecto: true,
      cupos: true,
      horasSemanalesEstimadas: true,
      carreraRequerida: {
        select: { idCarrera: true, nombreCarrera: true, facultad: true },
      },
      requisitos: {
        select: {
          idRequisitoHabilidad: true,
          nivelMinimo: true,
          obligatorio: true,
          habilidad: {
            select: {
              idHabilidad: true,
              nombreHabilidad: true,
              categoriaHabilidad: true,
            },
          },
        },
      },
    },
  },
  hitos: {
    select: {
      idHito: true,
      tituloHito: true,
      descripcionHito: true,
      fechaLimite: true,
      estadoHito: true,
      orden: true,
    },
    orderBy: { orden: 'asc' as const },
  },
  tareas: {
    select: {
      idTarea: true,
      idHito: true,
      tituloTarea: true,
      descripcionTarea: true,
      estadoTarea: true,
      prioridad: true,
      fechaLimite: true,
      _count: {
        select: { comentarios: { where: { eliminadoEn: null } } },
      },
    },
    orderBy: { idTarea: 'asc' as const },
  },
} as const;

// T-292 (HU-176): GET /proyectos/:id es público y el frontend solo lo usa
// para los datos del proyecto, sus roles e hitos. Embebía todas las tareas
// (51 KB con 236 tareas, sin importar el Sprint); el tablero las pide aparte.
const { tareas: _tareasDetalle, ...proyectoDetallePublicoSelect } = proyectoDetalleSelect;

// Sin sesión no se exponen datos de contacto (correo del líder ni de la organización).
const { correo: _correoCreador, ...creadorAnonimoSelect } = proyectoDetallePublicoSelect.creador.select;
const {
  correoContacto: _correoContacto,
  telefonoContacto: _telefonoContacto,
  ...organizacionAnonimaSelect
} = proyectoDetallePublicoSelect.organizaciones.select.organizacion.select;
export const proyectoDetalleAnonimoSelect = {
  ...proyectoDetallePublicoSelect,
  creador: { select: creadorAnonimoSelect },
  organizaciones: {
    select: {
      ...proyectoDetallePublicoSelect.organizaciones.select,
      organizacion: { select: organizacionAnonimaSelect },
    },
  },
} as const;

export { proyectoDetallePublicoSelect };
