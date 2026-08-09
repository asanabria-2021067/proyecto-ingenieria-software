/**
 * Escenario demostrativo determinista e idempotente del workspace Kanban para
 * el proyecto real "Sistema de Tutorías Académicas UVG" (líder: vernel@uvg.edu.gt).
 *
 * No cambia reglas de negocio, schema, migraciones ni frontend: solo puebla
 * datos. Nunca fija IDs; localiza todo por clave natural (correo, título de
 * proyecto/tarea/hito, nombre normalizado de etiqueta) — mismo criterio que
 * seed-vernel-states.ts. Todos los registros del escenario se identifican por
 * títulos/contenidos deterministas propios, de modo que una segunda ejecución
 * produce exactamente las mismas cantidades.
 *
 * Uso (base LOCAL/desechable únicamente):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/uvg_collab" \
 *     npx tsx prisma/seed-tutoring-workspace-demo.ts
 */
import {
  EstadoHito,
  EstadoParticipacion,
  EstadoTarea,
  Prioridad,
  Prisma,
  PrismaClient,
  TipoNotificacion,
} from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_TITLE = 'Sistema de Tutorías Académicas UVG';
const LEADER_EMAIL = 'vernel@uvg.edu.gt';

const NOW = new Date();
/** Timestamp relativo (días). */
const ts = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
/** Fecha (día calendario, medianoche UTC) para columnas @db.Date. */
function dateOnly(days: number): Date {
  const d = ts(days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase();

function abort(msg: string): never {
  console.error(`\n[ABORT] ${msg}\n`);
  throw new Error(msg);
}

// ─── Catálogo de etiquetas del escenario (colores #RRGGBB válidos) ───────────
const ETIQUETAS = [
  { nombre: 'Tutorías', color: '#2B7A3B' },
  { nombre: 'Urgente', color: '#C0392B' },
  { nombre: 'Seguimiento', color: '#2B63B8' },
  { nombre: 'Plataforma', color: '#8A6300' },
  { nombre: 'Documentación', color: '#59616C' },
];

// ─── Hitos del escenario ─────────────────────────────────────────────────────
const HITOS = [
  { titulo: 'Diagnóstico y preparación', orden: 1, estado: EstadoHito.COMPLETADO, dueDays: -30 },
  { titulo: 'Diseño del programa de tutorías', orden: 2, estado: EstadoHito.EN_PROGRESO, dueDays: -5 },
  { titulo: 'Piloto y operación inicial', orden: 3, estado: EstadoHito.EN_PROGRESO, dueDays: 20 },
  { titulo: 'Evaluación y cierre', orden: 4, estado: EstadoHito.PENDIENTE, dueDays: 45 },
];

type RolKey = 'A' | 'B' | 'C';
type StudentKey = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

interface TaskSpec {
  n: number;
  titulo: string;
  descripcion: string;
  estado: EstadoTarea;
  prioridad: Prioridad;
  rol: RolKey | null;
  hito: 1 | 2 | 3 | 4 | null;
  asignado: StudentKey | null; // asignación ACTIVA
  historicoE6: boolean; // E6 tuvo una asignación cerrada al retirarse
  etiquetas: string[];
  dueDays: number | null;
  tiempoEstimadoHoras: number | null;
}

// 18 tareas exactas: 4 POR_HACER, 5 EN_PROGRESO, 4 EN_REVISION, 5 HECHO.
const TASKS: TaskSpec[] = [
  // ── POR_HACER (4) ──
  { n: 1, titulo: 'Publicar calendario de tutorías del próximo ciclo', descripcion: 'Preparar y publicar el calendario de sesiones del siguiente ciclo académico.', estado: EstadoTarea.POR_HACER, prioridad: Prioridad.ALTA, rol: 'B', hito: 3, asignado: null, historicoE6: false, etiquetas: ['Tutorías', 'Urgente'], dueDays: 5, tiempoEstimadoHoras: 3 },
  { n: 2, titulo: 'Preparar encuesta de satisfacción de estudiantes', descripcion: 'Diseñar el instrumento de satisfacción para aplicar al cierre del piloto.', estado: EstadoTarea.POR_HACER, prioridad: Prioridad.MEDIA, rol: 'C', hito: 4, asignado: 'E5', historicoE6: false, etiquetas: ['Seguimiento'], dueDays: 10, tiempoEstimadoHoras: 4 },
  { n: 3, titulo: 'Actualizar banco de recursos de Cálculo I', descripcion: 'Revisar y actualizar los materiales de apoyo del curso de Cálculo I.', estado: EstadoTarea.POR_HACER, prioridad: Prioridad.BAJA, rol: 'A', hito: null, asignado: 'E1', historicoE6: false, etiquetas: ['Tutorías', 'Documentación'], dueDays: 12, tiempoEstimadoHoras: 2 },
  { n: 4, titulo: 'Validar disponibilidad de aulas para sesiones presenciales', descripcion: 'Confirmar con el área académica las aulas disponibles para tutorías presenciales.', estado: EstadoTarea.POR_HACER, prioridad: Prioridad.MEDIA, rol: null, hito: 3, asignado: null, historicoE6: false, etiquetas: ['Urgente'], dueDays: -3, tiempoEstimadoHoras: 2 },
  // ── EN_PROGRESO (5) ──
  { n: 5, titulo: 'Configurar agenda semanal de tutorías', descripcion: 'Configurar la agenda de sesiones semanales en la plataforma.', estado: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, rol: 'B', hito: 2, asignado: 'E3', historicoE6: false, etiquetas: ['Tutorías', 'Plataforma'], dueDays: 8, tiempoEstimadoHoras: 6 },
  { n: 6, titulo: 'Elaborar guía de atención y derivación', descripcion: 'Redactar la guía de atención y criterios de derivación de casos.', estado: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.MEDIA, rol: 'B', hito: 2, asignado: 'E4', historicoE6: false, etiquetas: ['Documentación'], dueDays: 9, tiempoEstimadoHoras: 4 },
  { n: 7, titulo: 'Revisar solicitudes de tutoría pendientes', descripcion: 'Depurar y priorizar las solicitudes de tutoría recibidas.', estado: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, rol: null, hito: 3, asignado: 'E2', historicoE6: false, etiquetas: ['Seguimiento'], dueDays: 6, tiempoEstimadoHoras: 3 },
  { n: 8, titulo: 'Migrar material de apoyo de Física I', descripcion: 'Migrar el material de Física I al nuevo repositorio del proyecto.', estado: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.BAJA, rol: 'A', hito: null, asignado: 'E1', historicoE6: false, etiquetas: ['Tutorías', 'Plataforma'], dueDays: 14, tiempoEstimadoHoras: 2 },
  { n: 9, titulo: 'Consolidar métricas del primer mes', descripcion: 'Consolidar las métricas de uso y asistencia del primer mes del piloto.', estado: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, rol: 'B', hito: 3, asignado: null, historicoE6: true, etiquetas: ['Seguimiento'], dueDays: 7, tiempoEstimadoHoras: 6 },
  // ── EN_REVISION (4) ──
  { n: 10, titulo: 'Probar flujo de reserva de tutorías', descripcion: 'Ejecutar pruebas del flujo de reserva de sesiones de principio a fin.', estado: EstadoTarea.EN_REVISION, prioridad: Prioridad.ALTA, rol: 'B', hito: 3, asignado: 'E3', historicoE6: false, etiquetas: ['Plataforma', 'Urgente'], dueDays: 2, tiempoEstimadoHoras: 4 },
  { n: 11, titulo: 'Revisar protocolo de seguimiento académico', descripcion: 'Revisar el protocolo de seguimiento y sus indicadores.', estado: EstadoTarea.EN_REVISION, prioridad: Prioridad.MEDIA, rol: 'C', hito: 2, asignado: 'E5', historicoE6: false, etiquetas: ['Seguimiento', 'Documentación'], dueDays: 11, tiempoEstimadoHoras: 3 },
  { n: 12, titulo: 'Validar criterios de selección de tutores', descripcion: 'Validar los criterios y el proceso de selección de tutores.', estado: EstadoTarea.EN_REVISION, prioridad: Prioridad.BAJA, rol: 'A', hito: 1, asignado: 'E2', historicoE6: true, etiquetas: ['Tutorías'], dueDays: 9, tiempoEstimadoHoras: 3 },
  { n: 13, titulo: 'Verificar accesibilidad del formulario de solicitudes', descripcion: 'Verificar el cumplimiento de accesibilidad del formulario público.', estado: EstadoTarea.EN_REVISION, prioridad: Prioridad.MEDIA, rol: null, hito: 2, asignado: 'E4', historicoE6: false, etiquetas: ['Plataforma'], dueDays: 13, tiempoEstimadoHoras: 4 },
  // ── HECHO (5) ──
  { n: 14, titulo: 'Levantar necesidades de cursos prioritarios', descripcion: 'Levantar la demanda de tutorías por curso para priorizar la oferta.', estado: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, rol: 'A', hito: 1, asignado: 'E1', historicoE6: false, etiquetas: ['Tutorías'], dueDays: -30, tiempoEstimadoHoras: 3 },
  { n: 15, titulo: 'Definir perfiles y responsabilidades de tutores', descripcion: 'Definir perfiles, responsabilidades y compromisos de los tutores.', estado: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, rol: 'A', hito: 1, asignado: 'E2', historicoE6: false, etiquetas: ['Tutorías', 'Documentación'], dueDays: -28, tiempoEstimadoHoras: 4 },
  { n: 16, titulo: 'Crear formulario inicial de solicitud de tutoría', descripcion: 'Construir el primer formulario de solicitud de tutoría.', estado: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, rol: 'B', hito: 1, asignado: 'E4', historicoE6: false, etiquetas: ['Plataforma'], dueDays: -25, tiempoEstimadoHoras: 6 },
  { n: 17, titulo: 'Configurar canales de comunicación del proyecto', descripcion: 'Configurar los canales de comunicación del equipo y con estudiantes.', estado: EstadoTarea.HECHO, prioridad: Prioridad.BAJA, rol: null, hito: null, asignado: 'E5', historicoE6: false, etiquetas: ['Seguimiento'], dueDays: -35, tiempoEstimadoHoras: 2 },
  { n: 18, titulo: 'Documentar incidencias del piloto inicial', descripcion: 'Documentar las incidencias detectadas durante el piloto y su solución.', estado: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, rol: 'B', hito: 2, asignado: null, historicoE6: true, etiquetas: ['Documentación'], dueDays: -20, tiempoEstimadoHoras: 8 },
];

interface CommentSpec {
  taskN: number;
  autor: 'V' | StudentKey;
  contenido: string;
  dias: number;
}

const COMMENTS: CommentSpec[] = [
  // Vernel (coordinación)
  { taskN: 1, autor: 'V', contenido: 'Coordinemos la publicación del calendario antes del inicio del ciclo.', dias: -3 },
  { taskN: 5, autor: 'V', contenido: 'Recuerden dejar documentada la configuración de la agenda semanal.', dias: -2 },
  { taskN: 10, autor: 'V', contenido: 'Al terminar las pruebas, dejemos evidencia del flujo revisado.', dias: -1 },
  // Integrantes activos (uno por cada uno, mínimo)
  { taskN: 3, autor: 'E1', contenido: 'Actualicé el banco de recursos con los ejercicios más recientes.', dias: -4 },
  { taskN: 8, autor: 'E1', contenido: 'Adjunto el resumen del avance realizado esta semana.', dias: -2 },
  { taskN: 7, autor: 'E2', contenido: 'Ya validé la disponibilidad con el área académica.', dias: -3 },
  { taskN: 5, autor: 'E3', contenido: 'Queda configurado el flujo principal; falta revisar los permisos.', dias: -2 },
  { taskN: 6, autor: 'E4', contenido: 'El formulario está listo para una segunda revisión.', dias: -3 },
  { taskN: 11, autor: 'E5', contenido: 'Confirmé los cursos con mayor demanda de tutorías.', dias: -2 },
  { taskN: 12, autor: 'E2', contenido: 'Encontré un caso que debemos cubrir antes de cerrar la tarea.', dias: -1 },
  { taskN: 2, autor: 'E5', contenido: 'La información pendiente está documentada en este comentario.', dias: -1 },
  { taskN: 13, autor: 'E4', contenido: 'Revisé la accesibilidad; queda pendiente el contraste de un botón.', dias: -1 },
  // Antiguo integrante (histórico, antes del retiro)
  { taskN: 9, autor: 'E6', contenido: 'Dejo consolidados los datos recopilados hasta esta fecha. Falta revisar los duplicados y preparar la visualización final.', dias: -12 },
  { taskN: 18, autor: 'E6', contenido: 'El documento incluye las incidencias detectadas, su prioridad y la solución aplicada durante el piloto.', dias: -14 },
  { taskN: 9, autor: 'E6', contenido: 'Adjunto también las observaciones iniciales sobre la tendencia de asistencia.', dias: -11 },
];

async function main() {
  console.log('== Escenario demostrativo: Sistema de Tutorías Académicas UVG ==\n');

  // ── 1. Líder ──────────────────────────────────────────────────────────────
  const vernel = await prisma.usuario.findUnique({ where: { correo: LEADER_EMAIL } });
  if (!vernel) abort(`El usuario ${LEADER_EMAIL} no existe. No se crea ninguna cuenta.`);

  // ── 2. Proyecto (único) ────────────────────────────────────────────────────
  const proyectos = await prisma.proyecto.findMany({ where: { tituloProyecto: PROJECT_TITLE } });
  if (proyectos.length === 0) abort(`No existe el proyecto "${PROJECT_TITLE}".`);
  if (proyectos.length > 1)
    abort(`Hay ${proyectos.length} proyectos con ese título (IDs: ${proyectos.map((p) => p.idProyecto).join(', ')}). Aborta.`);
  const proyecto = proyectos[0];
  if (proyecto.creadoPor !== vernel.idUsuario)
    abort(`El proyecto ${proyecto.idProyecto} no es liderado por ${LEADER_EMAIL} (creadoPor=${proyecto.creadoPor}).`);
  const idProyecto = proyecto.idProyecto;
  console.log(`Proyecto #${idProyecto} "${proyecto.tituloProyecto}" (estado=${proyecto.estadoProyecto}), líder=${vernel.correo} (#${vernel.idUsuario})`);

  // ── 3. Estudiantes (6, deterministas por correo asc) ───────────────────────
  const estudiantes = await prisma.usuario.findMany({
    where: {
      estado: 'ACTIVO',
      correo: { not: LEADER_EMAIL },
      rolesAcceso: { some: { rolAcceso: { nombrePerfil: 'estudiante' } } },
    },
    orderBy: { correo: 'asc' },
    take: 6,
  });
  if (estudiantes.length < 6) abort(`Solo hay ${estudiantes.length} estudiantes activos válidos (se requieren 6).`);
  const [E1, E2, E3, E4, E5, E6] = estudiantes;
  const student: Record<StudentKey, (typeof estudiantes)[number]> = { E1, E2, E3, E4, E5, E6 };

  // ── 4. Roles (≥3, reutilizados; nombres reales, sin renombrar) ─────────────
  let roles = await prisma.rolProyecto.findMany({ where: { idProyecto }, orderBy: { idRolProyecto: 'asc' } });
  if (roles.length < 3) {
    // Crea únicamente los mínimos faltantes con nombres coherentes del proyecto.
    const faltantes = [
      { nombreRol: 'Coordinación de tutorías', cupos: 5 },
      { nombreRol: 'Contenidos académicos', cupos: 5 },
      { nombreRol: 'Plataforma y soporte', cupos: 5 },
    ].slice(roles.length);
    for (const r of faltantes) {
      const yaExiste = await prisma.rolProyecto.findFirst({ where: { idProyecto, nombreRol: r.nombreRol } });
      if (!yaExiste) await prisma.rolProyecto.create({ data: { idProyecto, ...r } });
    }
    roles = await prisma.rolProyecto.findMany({ where: { idProyecto }, orderBy: { idRolProyecto: 'asc' } });
  }
  const [ROL_A, ROL_B, ROL_C] = roles;
  const rolById: Record<RolKey, (typeof roles)[number]> = { A: ROL_A, B: ROL_B, C: ROL_C };
  console.log(`Roles → A=#${ROL_A.idRolProyecto} "${ROL_A.nombreRol}", B=#${ROL_B.idRolProyecto} "${ROL_B.nombreRol}", C=#${ROL_C.idRolProyecto} "${ROL_C.nombreRol}"`);

  const retiroTs = ts(-7); // retiro del Estudiante 6, hace 7 días
  const ingresoDate = dateOnly(-40);

  // ── 5. Participaciones (idempotentes; respetan el índice único parcial) ────
  async function ensureParticipacion(idUsuario: number, idRolProyecto: number, estado: EstadoParticipacion, fechaSalida: Date | null) {
    const existente = await prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto } });
    if (existente) {
      await prisma.participacionProyecto.update({
        where: { idParticipacion: existente.idParticipacion },
        data: { estadoParticipacion: estado, fechaIngreso: ingresoDate, fechaSalida },
      });
      return;
    }
    await prisma.participacionProyecto.create({
      data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso: ingresoDate, fechaSalida },
    });
  }
  // Activas
  await ensureParticipacion(E1.idUsuario, ROL_A.idRolProyecto, 'ACTIVO', null);
  await ensureParticipacion(E1.idUsuario, ROL_C.idRolProyecto, 'ACTIVO', null); // E1 con dos roles
  await ensureParticipacion(E2.idUsuario, ROL_A.idRolProyecto, 'ACTIVO', null);
  await ensureParticipacion(E3.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', null);
  await ensureParticipacion(E4.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', null);
  await ensureParticipacion(E5.idUsuario, ROL_C.idRolProyecto, 'ACTIVO', null);
  await ensureParticipacion(vernel.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', null); // líder + participante
  // Retirado (E6 en ROL_B)
  await ensureParticipacion(E6.idUsuario, ROL_B.idRolProyecto, 'RETIRADO', dateOnly(-7));

  // ── 6. Etiquetas (idempotentes por nombre normalizado) ─────────────────────
  const etiquetaId: Record<string, number> = {};
  for (const et of ETIQUETAS) {
    const nombreNormalizado = normalize(et.nombre);
    const existente = await prisma.etiqueta.findFirst({ where: { idProyecto, nombreNormalizado } });
    if (existente) {
      await prisma.etiqueta.update({ where: { idEtiqueta: existente.idEtiqueta }, data: { nombreEtiqueta: et.nombre, color: et.color } });
      etiquetaId[et.nombre] = existente.idEtiqueta;
    } else {
      const creada = await prisma.etiqueta.create({ data: { idProyecto, nombreEtiqueta: et.nombre, nombreNormalizado, color: et.color } });
      etiquetaId[et.nombre] = creada.idEtiqueta;
    }
  }

  // ── 7. Hitos (idempotentes por título) ─────────────────────────────────────
  const hitoId: Record<number, number> = {};
  for (const h of HITOS) {
    const existente = await prisma.hito.findFirst({ where: { idProyecto, tituloHito: h.titulo } });
    const data = { fechaLimite: dateOnly(h.dueDays), estadoHito: h.estado, orden: h.orden };
    if (existente) {
      await prisma.hito.update({ where: { idHito: existente.idHito }, data });
      hitoId[h.orden] = existente.idHito;
    } else {
      const creado = await prisma.hito.create({ data: { idProyecto, tituloHito: h.titulo, ...data } });
      hitoId[h.orden] = creado.idHito;
    }
  }

  // ── 8. Tareas (idempotentes por título) + reconstrucción de hijos ──────────
  const taskId: Record<number, number> = {};
  for (const t of TASKS) {
    const data = {
      idHito: t.hito ? hitoId[t.hito] : null,
      idRolProyecto: t.rol ? rolById[t.rol].idRolProyecto : null,
      descripcionTarea: t.descripcion,
      estadoTarea: t.estado,
      prioridad: t.prioridad,
      tiempoEstimadoHoras: t.tiempoEstimadoHoras,
      fechaLimite: t.dueDays === null ? null : dateOnly(t.dueDays),
      eliminadoEn: null,
    };
    const existente = await prisma.tarea.findFirst({ where: { idProyecto, tituloTarea: t.titulo } });
    if (existente) {
      await prisma.tarea.update({ where: { idTarea: existente.idTarea }, data });
      taskId[t.n] = existente.idTarea;
    } else {
      const creada = await prisma.tarea.create({ data: { idProyecto, tituloTarea: t.titulo, creadaPor: vernel.idUsuario, ...data } });
      taskId[t.n] = creada.idTarea;
    }
  }
  const scenarioTaskIds = Object.values(taskId);

  // Reconstrucción atómica de hijos de las tareas del escenario (todas son
  // propiedad del escenario: se identifican por su título determinista). Borrar
  // y recrear garantiza idempotencia sin tocar datos ajenos.
  await prisma.$transaction(
    async (tx) => {
      await tx.tareaEtiqueta.deleteMany({ where: { idTarea: { in: scenarioTaskIds } } });
      await tx.comentario.deleteMany({ where: { idTarea: { in: scenarioTaskIds } } });
      await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: scenarioTaskIds } } });

      // Etiquetas ↔ tareas
      const links: Prisma.TareaEtiquetaCreateManyInput[] = [];
      for (const t of TASKS) {
        for (const nombre of t.etiquetas) links.push({ idTarea: taskId[t.n], idEtiqueta: etiquetaId[nombre] });
      }
      if (links.length) await tx.tareaEtiqueta.createMany({ data: links });

      // Asignaciones (activas + históricas cerradas del E6)
      const asignaciones: Prisma.AsignacionTareaCreateManyInput[] = [];
      for (const t of TASKS) {
        if (t.asignado) {
          // Tarea 12: la reasignación al E2 se creó DESPUÉS del retiro.
          const fechaAsignacion = t.n === 12 ? ts(-5) : ts(t.estado === EstadoTarea.HECHO ? -30 : -20);
          asignaciones.push({ idTarea: taskId[t.n], idUsuario: student[t.asignado].idUsuario, asignadoPor: vernel.idUsuario, fechaAsignacion, desasignadaEn: null });
        }
        if (t.historicoE6) {
          asignaciones.push({ idTarea: taskId[t.n], idUsuario: E6.idUsuario, asignadoPor: vernel.idUsuario, fechaAsignacion: ts(-30), desasignadaEn: retiroTs });
        }
      }
      if (asignaciones.length) await tx.asignacionTarea.createMany({ data: asignaciones });

      // Comentarios (autor + fecha reales del escenario)
      const comentarios: Prisma.ComentarioCreateManyInput[] = COMMENTS.map((c) => ({
        idTarea: taskId[c.taskN],
        idAutor: c.autor === 'V' ? vernel.idUsuario : student[c.autor].idUsuario,
        contenido: c.contenido,
        creadoEn: ts(c.dias),
      }));
      if (comentarios.length) await tx.comentario.createMany({ data: comentarios });
    },
    { timeout: 60_000 },
  );

  // ── 9. Notificaciones persistidas (idempotentes por usuario+tipo+mensaje) ──
  async function ensureNotificacion(idUsuario: number, tipo: TipoNotificacion, titulo: string, mensaje: string, datosJson: Prisma.InputJsonValue, leidaEn: Date | null) {
    const existente = await prisma.notificacion.findFirst({ where: { idUsuario, tipoNotificacion: tipo, mensajeNotificacion: mensaje } });
    if (existente) {
      await prisma.notificacion.update({ where: { idNotificacion: existente.idNotificacion }, data: { tituloNotificacion: titulo, datosJson, leidaEn } });
      return;
    }
    await prisma.notificacion.create({ data: { idUsuario, tipoNotificacion: tipo, tituloNotificacion: titulo, mensajeNotificacion: mensaje, datosJson, leidaEn, creadaEn: ts(-2) } });
  }

  // 5 notificaciones de comentario para Vernel (una por integrante activo).
  const comentariosParaVernel: { autor: StudentKey; taskN: number }[] = [
    { autor: 'E1', taskN: 3 },
    { autor: 'E2', taskN: 7 },
    { autor: 'E3', taskN: 5 },
    { autor: 'E4', taskN: 6 },
    { autor: 'E5', taskN: 11 },
  ];
  for (let i = 0; i < comentariosParaVernel.length; i++) {
    const c = comentariosParaVernel[i];
    const t = TASKS.find((x) => x.n === c.taskN)!;
    const nombre = `${student[c.autor].nombre} ${student[c.autor].apellido}`;
    await ensureNotificacion(
      vernel.idUsuario,
      TipoNotificacion.COMENTARIO_TAREA,
      'Nuevo comentario',
      `${nombre} comentó en la tarea "${t.titulo}".`,
      { idProyecto, idTarea: taskId[c.taskN] },
      i % 2 === 0 ? null : ts(-1), // mezcla leídas / no leídas
    );
  }

  // ROL_ABANDONADO para el líder (E6 dejó ROL_B; 2 tareas de ese rol sin asignar: 9 y 18).
  const nombreE6 = `${E6.nombre} ${E6.apellido}`;
  await ensureNotificacion(
    vernel.idUsuario,
    TipoNotificacion.ROL_ABANDONADO,
    'Un integrante dejó un rol',
    `${nombreE6} dejó el rol "${ROL_B.nombreRol}" en "${proyecto.tituloProyecto}". 2 tareas quedaron sin asignar.`,
    { projectId: idProyecto, roleId: ROL_B.idRolProyecto, roleName: ROL_B.nombreRol, projectTitle: proyecto.tituloProyecto, taskCount: 2 },
    null,
  );

  // Notificaciones de asignación para los estudiantes que recibieron tareas.
  const asignacionAviso: { alumno: StudentKey; taskN: number }[] = [
    { alumno: 'E1', taskN: 3 },
    { alumno: 'E2', taskN: 7 },
    { alumno: 'E3', taskN: 5 },
    { alumno: 'E4', taskN: 6 },
    { alumno: 'E5', taskN: 2 },
  ];
  for (let i = 0; i < asignacionAviso.length; i++) {
    const a = asignacionAviso[i];
    const t = TASKS.find((x) => x.n === a.taskN)!;
    await ensureNotificacion(
      student[a.alumno].idUsuario,
      TipoNotificacion.TAREA_ASIGNADA,
      'Nueva tarea asignada',
      `${vernel.nombre} ${vernel.apellido} te asignó la tarea "${t.titulo}" en el proyecto "${proyecto.tituloProyecto}".`,
      { projectId: idProyecto, taskId: taskId[a.taskN] },
      i % 3 === 0 ? ts(-1) : null,
    );
  }

  // ── 10. Validaciones de consistencia ───────────────────────────────────────
  await validar(idProyecto, scenarioTaskIds, E6.idUsuario, ROL_B.idRolProyecto);

  console.log('\n== Escenario poblado correctamente ==');
}

async function validar(idProyecto: number, scenarioTaskIds: number[], idE6: number, idRolB: number) {
  const problemas: string[] = [];

  // Sin dos asignaciones activas por tarea (entre las del escenario).
  const activasPorTarea = await prisma.asignacionTarea.groupBy({
    by: ['idTarea'],
    where: { idTarea: { in: scenarioTaskIds }, desasignadaEn: null },
    _count: { idAsignacion: true },
  });
  for (const g of activasPorTarea) if (g._count.idAsignacion > 1) problemas.push(`Tarea ${g.idTarea} con ${g._count.idAsignacion} asignaciones activas`);

  // E6 sin participación activa en ROL_B ni asignaciones activas.
  const e6Activa = await prisma.participacionProyecto.count({ where: { idUsuario: idE6, idRolProyecto: idRolB, estadoParticipacion: 'ACTIVO' } });
  if (e6Activa > 0) problemas.push('E6 tiene participación ACTIVO en ROL_B');
  const e6AsignActiva = await prisma.asignacionTarea.count({ where: { idUsuario: idE6, desasignadaEn: null, idTarea: { in: scenarioTaskIds } } });
  if (e6AsignActiva > 0) problemas.push('E6 tiene asignaciones activas');

  // Conteo Kanban del escenario.
  const porEstado = await prisma.tarea.groupBy({ by: ['estadoTarea'], where: { idTarea: { in: scenarioTaskIds } }, _count: { idTarea: true } });
  const conteo = Object.fromEntries(porEstado.map((g) => [g.estadoTarea, g._count.idTarea]));
  const esperado = { POR_HACER: 4, EN_PROGRESO: 5, EN_REVISION: 4, HECHO: 5 };
  for (const [estado, n] of Object.entries(esperado)) if ((conteo[estado] ?? 0) !== n) problemas.push(`Kanban ${estado}: ${conteo[estado] ?? 0} (esperado ${n})`);

  if (problemas.length) abort(`Validación fallida:\n  - ${problemas.join('\n  - ')}`);
  console.log(`\nValidación OK · Kanban escenario: POR_HACER=${conteo.POR_HACER} EN_PROGRESO=${conteo.EN_PROGRESO} EN_REVISION=${conteo.EN_REVISION} HECHO=${conteo.HECHO} (total ${scenarioTaskIds.length})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
