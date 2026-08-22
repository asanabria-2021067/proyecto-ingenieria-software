/**
 * Dataset de showcase consolidado. Reemplaza a los antiguos scripts
 * `seed-sprint6-demo.ts`, `seed-states.ts` (= `seed-vernel-states.ts`) y
 * `seed-tutoring-workspace-demo.ts`, fusionados en un único archivo para
 * correr todo el recorrido de demo con un solo comando. Cada fase conserva
 * exactamente su alcance e idempotencia originales:
 *
 *  1. Sprint 6 Demo: namespace de datos completamente separado (usuarios
 *     `s6.*@uvg.edu.gt`, proyectos con títulos propios) para recorrer
 *     visualmente Sprints, cierre de Sprint, salida de proyecto en dos
 *     pasos, resumen de miembros, postulaciones y cierre de proyecto — sin
 *     tocar ningún dato preexistente de otros usuarios/proyectos.
 *  2. Social Demo (amigos / seguir al líder): dentro del mismo namespace
 *     `s6.*`, agrega amistades y seguimientos para que el feed social del
 *     dashboard ("Proyectos de tus amigos" / "De personas que sigues")
 *     tenga datos reales que mostrar.
 *  3. Estados de proyecto: completa, para el usuario real
 *     `vernel@uvg.edu.gt`, los proyectos que le faltan para cubrir cada
 *     valor de EstadoProyecto, junto con su historial de revisión.
 *  4. Tutoring Workspace Demo: escenario Kanban determinista para el
 *     proyecto real "Sistema de Tutorías Académicas UVG" (líder:
 *     vernel@uvg.edu.gt) — asume que ese proyecto ya existe (uso real de la
 *     app), igual que el script original.
 *
 * No cambia reglas de negocio, schema, migraciones ni frontend: solo puebla
 * datos. Nunca fija IDs explícitos; localiza todo por clave natural (correo,
 * título de proyecto/tarea/hito, nombre de rol, número de Sprint, nombre
 * normalizado de etiqueta) para que una segunda ejecución produzca
 * exactamente el mismo dataset lógico sin duplicar filas.
 *
 * Uso (base LOCAL/desechable únicamente):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/uvg_collab" \
 *   DIRECT_URL="postgresql://postgres:postgres@localhost:5433/uvg_collab" \
 *     npx tsx prisma/seed-demo.ts
 */
import { hashSync } from 'bcryptjs';
import {
  EstadoParticipacion,
  EstadoPostulacion,
  EstadoProyecto,
  EstadoSolicitudSalida,
  EstadoSprint,
  EstadoTarea,
  EstadoHito,
  Prioridad,
  Prisma,
  PrismaClient,
  TipoNotificacion,
} from '@prisma/client';

const prisma = new PrismaClient();

const NOW = new Date();
const ts = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
function dateOnly(days: number): Date {
  const d = ts(days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase();

const PASSWORD_HASH = hashSync('Test1234!', 10);

function abort(msg: string): never {
  console.error(`\n[ABORT] ${msg}\n`);
  throw new Error(msg);
}

// ════════════════════════════════════════════════════════════════════════
// FASE 1 — Sprint 6 Demo (namespace s6.*)
// ════════════════════════════════════════════════════════════════════════

const USERS = {
  lider: { correo: 's6.lider@uvg.edu.gt', nombre: 'Valeria', apellido: 'Ortiz' },
  beatriz: { correo: 's6.beatriz@uvg.edu.gt', nombre: 'Beatriz', apellido: 'Solano' },
  carlos: { correo: 's6.carlos@uvg.edu.gt', nombre: 'Carlos', apellido: 'Pineda' },
  diego: { correo: 's6.diego@uvg.edu.gt', nombre: 'Diego', apellido: 'Fuentes' },
  estefania: { correo: 's6.estefania@uvg.edu.gt', nombre: 'Estefanía', apellido: 'Marroquín' },
  fernando: { correo: 's6.fernando@uvg.edu.gt', nombre: 'Fernando', apellido: 'Girón' },
  gabriela: { correo: 's6.gabriela@uvg.edu.gt', nombre: 'Gabriela', apellido: 'Recinos' },
  hugo: { correo: 's6.hugo@uvg.edu.gt', nombre: 'Hugo', apellido: 'Paredes' },
  ingrid: { correo: 's6.ingrid@uvg.edu.gt', nombre: 'Ingrid', apellido: 'Cabrera' },
  karla: { correo: 's6.karla@uvg.edu.gt', nombre: 'Karla', apellido: 'Ixchel' },
  laura: { correo: 's6.laura@uvg.edu.gt', nombre: 'Laura', apellido: 'Xitumul' },
} as const;

type UserKey = keyof typeof USERS;

async function ensureUsuarioS6(key: UserKey) {
  const u = USERS[key];
  return prisma.usuario.upsert({
    where: { correo: u.correo },
    update: { nombre: u.nombre, apellido: u.apellido, estado: 'ACTIVO' },
    create: { correo: u.correo, contrasena: PASSWORD_HASH, nombre: u.nombre, apellido: u.apellido, estado: 'ACTIVO' },
  });
}

async function ensureProyectoS6(
  titulo: string,
  creadoPor: number,
  data: Omit<Prisma.ProyectoUncheckedCreateInput, 'tituloProyecto' | 'creadoPor'>,
) {
  const existente = await prisma.proyecto.findFirst({ where: { tituloProyecto: titulo, creadoPor } });
  if (existente) {
    return prisma.proyecto.update({ where: { idProyecto: existente.idProyecto }, data });
  }
  return prisma.proyecto.create({ data: { tituloProyecto: titulo, creadoPor, ...data } });
}

async function ensureRolS6(idProyecto: number, nombreRol: string, cupos: number, descripcionRolProyecto?: string) {
  const existente = await prisma.rolProyecto.findFirst({ where: { idProyecto, nombreRol } });
  const data = { cupos, descripcionRolProyecto };
  if (existente) return prisma.rolProyecto.update({ where: { idRolProyecto: existente.idRolProyecto }, data });
  return prisma.rolProyecto.create({ data: { idProyecto, nombreRol, ...data } });
}

async function ensureSprintS6(idProyecto: number, numero: number, estado: EstadoSprint, fechas: Partial<Prisma.SprintUncheckedCreateInput>) {
  const existente = await prisma.sprint.findFirst({ where: { idProyecto, numero } });
  const data = { estado, ...fechas };
  if (existente) return prisma.sprint.update({ where: { idSprint: existente.idSprint }, data });
  return prisma.sprint.create({ data: { idProyecto, numero, estado, ...fechas } });
}

async function ensureHitoS6(idProyecto: number, tituloHito: string, orden: number, fechaLimite: Date) {
  const existente = await prisma.hito.findFirst({ where: { idProyecto, tituloHito } });
  const data = { orden, fechaLimite };
  if (existente) return prisma.hito.update({ where: { idHito: existente.idHito }, data });
  return prisma.hito.create({ data: { idProyecto, tituloHito, ...data, estadoHito: 'PENDIENTE' } });
}

async function setHitoEstadoS6(idHito: number, estadoHito: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO') {
  await prisma.hito.update({ where: { idHito }, data: { estadoHito } });
}

/**
 * Idéntico patrón que ensureParticipacionTutoring (FND-08.B): para el
 * objetivo ACTIVO nunca reactiva una fila histórica (RETIRADO/COMPLETADO) —
 * reutiliza una fila YA ACTIVO si existe, o crea una nueva. Para cualquier
 * otro objetivo, el patrón find/update-or-create original es seguro porque
 * esos estados no están protegidos por el índice parcial.
 */
async function ensureParticipacionS6(
  idUsuario: number,
  idRolProyecto: number,
  estado: EstadoParticipacion,
  fechaIngreso: Date,
  fechaSalida: Date | null,
  idPostulacion?: number,
) {
  if (estado === EstadoParticipacion.ACTIVO) {
    const activa = await prisma.participacionProyecto.findFirst({
      where: { idUsuario, idRolProyecto, estadoParticipacion: EstadoParticipacion.ACTIVO },
    });
    if (activa) {
      return prisma.participacionProyecto.update({
        where: { idParticipacion: activa.idParticipacion },
        data: { fechaIngreso, fechaSalida, idPostulacion },
      });
    }
    return prisma.participacionProyecto.create({
      data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
    });
  }

  const existente = await prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto } });
  if (existente) {
    return prisma.participacionProyecto.update({
      where: { idParticipacion: existente.idParticipacion },
      data: { estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
    });
  }
  return prisma.participacionProyecto.create({
    data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
  });
}

async function ensurePostulacionS6(
  idUsuarioPostulante: number,
  idRolProyecto: number,
  data: {
    justificacion: string;
    estadoPostulacion: EstadoPostulacion;
    fechaPostulacion: Date;
    resueltaPor?: number;
    fechaResolucion?: Date;
    comentarioResolucion?: string;
  },
) {
  const existente = await prisma.postulacion.findFirst({ where: { idUsuarioPostulante, idRolProyecto } });
  if (existente) return prisma.postulacion.update({ where: { idPostulacion: existente.idPostulacion }, data });
  return prisma.postulacion.create({ data: { idUsuarioPostulante, idRolProyecto, ...data } });
}

async function ensureTareaS6(
  idProyecto: number,
  tituloTarea: string,
  data: Omit<Prisma.TareaUncheckedCreateInput, 'idProyecto' | 'tituloTarea' | 'creadaPor'>,
  creadaPor: number,
) {
  const existente = await prisma.tarea.findFirst({ where: { idProyecto, tituloTarea } });
  if (existente) return prisma.tarea.update({ where: { idTarea: existente.idTarea }, data });
  return prisma.tarea.create({ data: { idProyecto, tituloTarea, creadaPor, ...data } });
}

// ─── Textos de RegistroAvanceAsignacion (>=200 caracteres, contenido creíble) ──
const REGISTROS = {
  diagnostico:
    'Durante este tramo se levantó un diagnóstico completo de las necesidades de tutoría por facultad, entrevistando a coordinadores académicos y revisando los índices de reprobación de los últimos dos semestres. El resultado se documentó en una matriz priorizada por curso.',
  planTrabajo:
    'Se elaboró el plan de trabajo inicial del programa de tutorías, definiendo responsables, cronograma y los cursos piloto con mayor demanda. El documento fue revisado con el equipo coordinador y quedó como base para la convocatoria de tutores del primer ciclo.',
  guiaBuenasPracticas:
    'Se publicó la guía de buenas prácticas para tutores, incluyendo recomendaciones de manejo de sesiones grupales, criterios de derivación de casos complejos y una plantilla estándar para el reporte de avance de cada sesión de tutoría.',
  retroalimentacion:
    'Se revisaron y consolidaron las encuestas de retroalimentación recolectadas durante el ciclo anterior, identificando los cursos con mejor recepción y las áreas donde los estudiantes solicitaron más acompañamiento. El resumen se compartió con la coordinación.',
  pruebaReserva:
    'Se ejecutaron pruebas completas del flujo de reserva de sesiones de tutoría, cubriendo la selección de curso, horario disponible y confirmación por correo. Se documentaron dos inconsistencias menores de horario que ya fueron reportadas para corrección.',
  protocoloSeguimiento:
    'Se documentó el protocolo de seguimiento académico que utilizará el equipo coordinador para dar continuidad a los estudiantes referidos a tutoría, incluyendo los criterios de reincorporación y el formato de bitácora compartida entre tutores.',
};

async function seedSprint6Demo() {
  console.log('== Sprint 6 Demo dataset ==\n');

  // ── 1. Usuarios ───────────────────────────────────────────────────────
  const u: Record<UserKey, Prisma.PromiseReturnType<typeof ensureUsuarioS6>> = {} as never;
  for (const key of Object.keys(USERS) as UserKey[]) {
    u[key] = await ensureUsuarioS6(key);
  }
  const lider = u.lider;
  console.log(`Líder demo: ${lider.correo} (#${lider.idUsuario})`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 1 — PRINCIPAL, Sprint ACTIVO + histórico CERRADO x2
  // ══════════════════════════════════════════════════════════════════════
  const P1_TITLE = 'Sistema de Tutorías Académicas UVG — Sprint 6 Demo';
  const p1 = await ensureProyectoS6(P1_TITLE, lider.idUsuario, {
    descripcionProyecto:
      'Programa institucional de tutorías académicas entre pares: conecta estudiantes con tutores de su misma carrera para reforzar cursos con alta demanda de apoyo.',
    objetivosProyecto: 'Reducir la tasa de reprobación en cursos priorizados mediante acompañamiento entre pares.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'MIXTA',
    fechaInicio: dateOnly(-70),
    fechaFinEstimada: dateOnly(120),
    fechaPublicacion: dateOnly(-70),
  });
  console.log(`Proyecto 1 (principal) → #${p1.idProyecto} "${p1.tituloProyecto}"`);

  const rCoord = await ensureRolS6(p1.idProyecto, 'Coordinación de tutorías', 5, 'Coordina la operación semanal del programa de tutorías.');
  const rCont = await ensureRolS6(p1.idProyecto, 'Contenidos académicos', 5, 'Prepara y actualiza el material de apoyo por curso.');
  const rPlat = await ensureRolS6(p1.idProyecto, 'Plataforma y soporte', 5, 'Da soporte técnico a la plataforma de reservas de tutoría.');

  // Postulaciones
  const postBeatriz = await ensurePostulacionS6(u.beatriz.idUsuario, rCoord.idRolProyecto, {
    justificacion: 'Ya fui tutora de Cálculo I el semestre pasado y quiero seguir apoyando al programa desde la coordinación.',
    estadoPostulacion: EstadoPostulacion.ACEPTADA,
    fechaPostulacion: ts(-78),
    resueltaPor: lider.idUsuario,
    fechaResolucion: ts(-75),
  });
  await ensurePostulacionS6(u.hugo.idUsuario, rCont.idRolProyecto, {
    justificacion: 'Tengo experiencia preparando material de estudio para mis compañeros de carrera y quiero aportar al banco de recursos.',
    estadoPostulacion: EstadoPostulacion.PENDIENTE,
    fechaPostulacion: ts(-3),
  });
  await ensurePostulacionS6(u.ingrid.idUsuario, rPlat.idRolProyecto, {
    justificacion: 'Curso Ingeniería en Ciencias de la Computación y me interesa dar soporte técnico a la plataforma de reservas.',
    estadoPostulacion: EstadoPostulacion.PENDIENTE,
    fechaPostulacion: ts(-2),
  });
  await ensurePostulacionS6(u.ingrid.idUsuario, rCoord.idRolProyecto, {
    justificacion: 'Quiero unirme a la coordinación del programa para apoyar la logística de las sesiones semanales.',
    estadoPostulacion: EstadoPostulacion.RECHAZADA,
    fechaPostulacion: ts(-20),
    resueltaPor: lider.idUsuario,
    fechaResolucion: ts(-18),
    comentarioResolucion: 'Ya cubrimos los cupos de coordinación disponibles este ciclo; te animamos a postular a plataforma y soporte.',
  });

  // Participaciones
  // Líder también necesita participación ACTIVO para poder autoasignarse
  // tareas (requerido por k6/scenarios/kanban-operations.js — el líder crea,
  // asigna y cierra su propio tramo con la misma identidad).
  await ensureParticipacionS6(lider.idUsuario, rCoord.idRolProyecto, 'ACTIVO', dateOnly(-70), null);
  const partBeatriz = await ensureParticipacionS6(u.beatriz.idUsuario, rCoord.idRolProyecto, 'ACTIVO', dateOnly(-75), null, postBeatriz.idPostulacion);
  const partCarlosCoord = await ensureParticipacionS6(u.carlos.idUsuario, rCoord.idRolProyecto, 'ACTIVO', dateOnly(-70), null);
  const partCarlosPlat = await ensureParticipacionS6(u.carlos.idUsuario, rPlat.idRolProyecto, 'ACTIVO', dateOnly(-15), null);
  const partDiego = await ensureParticipacionS6(u.diego.idUsuario, rCont.idRolProyecto, 'ACTIVO', dateOnly(-60), null);
  const partEstefania = await ensureParticipacionS6(u.estefania.idUsuario, rPlat.idRolProyecto, 'ACTIVO', dateOnly(-55), null);
  const partFernando = await ensureParticipacionS6(u.fernando.idUsuario, rCont.idRolProyecto, 'RETIRADO', dateOnly(-68), dateOnly(-10));
  const partKarla = await ensureParticipacionS6(u.karla.idUsuario, rCoord.idRolProyecto, 'RETIRADO', dateOnly(-65), dateOnly(-30));
  const partGabriela = await ensureParticipacionS6(u.gabriela.idUsuario, rCont.idRolProyecto, 'RETIRADO', dateOnly(-50), dateOnly(-6));

  // Hitos
  const h1 = await ensureHitoS6(p1.idProyecto, 'Diagnóstico y planeación del programa', 1, dateOnly(-50));
  const h2 = await ensureHitoS6(p1.idProyecto, 'Consolidación de recursos y capacitación', 2, dateOnly(-10));
  const h3 = await ensureHitoS6(p1.idProyecto, 'Piloto y operación del semestre', 3, dateOnly(20));
  const h4 = await ensureHitoS6(p1.idProyecto, 'Evaluación y cierre del ciclo', 4, dateOnly(60));

  // Sprints
  const s1 = await ensureSprintS6(p1.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-70),
    fechaCierre: ts(-50),
    cerradoPor: lider.idUsuario,
  });
  const s2 = await ensureSprintS6(p1.idProyecto, 2, EstadoSprint.CERRADO, {
    fechaInicio: ts(-49),
    fechaCierre: ts(-25),
    cerradoPor: lider.idUsuario,
  });
  const s3 = await ensureSprintS6(p1.idProyecto, 3, EstadoSprint.ACTIVO, {
    fechaInicio: ts(-24),
  });

  // ── Tareas Sprint 1 (histórico CERRADO, 3 tareas, todas HECHO) ─────────
  const t1_1 = await ensureTareaS6(p1.idProyecto, 'Diagnosticar necesidades de tutoría por facultad', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Levantar un diagnóstico de necesidades de tutoría por facultad para priorizar cursos.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);
  const t1_2 = await ensureTareaS6(p1.idProyecto, 'Elaborar plan de trabajo del programa de tutorías', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Definir responsables, cronograma y cursos piloto del primer ciclo.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const t1_3 = await ensureTareaS6(p1.idProyecto, 'Configurar catálogo inicial de cursos con tutoría', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Cargar en la plataforma el catálogo de cursos habilitados para tutoría.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 7,
  }, lider.idUsuario);
  await setHitoEstadoS6(h1.idHito, 'COMPLETADO');

  // ── Tareas Sprint 2 (histórico CERRADO, 3 tareas, todas HECHO) ─────────
  const t2_1 = await ensureTareaS6(p1.idProyecto, 'Publicar guía de buenas prácticas para tutores', {
    idSprint: s2.idSprint, idHito: h2.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Redactar y publicar la guía de buenas prácticas para las sesiones de tutoría.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4,
  }, lider.idUsuario);
  const t2_2 = await ensureTareaS6(p1.idProyecto, 'Revisar y consolidar retroalimentación de tutores', {
    idSprint: s2.idSprint, idHito: h2.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Consolidar la retroalimentación del ciclo anterior para ajustar el programa.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const t2_3 = await ensureTareaS6(p1.idProyecto, 'Actualizar recursos de apoyo para primer parcial', {
    idSprint: s2.idSprint, idHito: null, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Actualizar los recursos de apoyo publicados antes del primer parcial.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);

  // ── Tareas Sprint 3 (ACTIVO, 10 tareas distribuidas en el Kanban) ──────
  const t3_1 = await ensureTareaS6(p1.idProyecto, 'Publicar calendario de tutorías del próximo semestre', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: null,
    descripcionTarea: 'Publicar el calendario de sesiones del siguiente semestre académico.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(10),
  }, lider.idUsuario);
  const t3_2 = await ensureTareaS6(p1.idProyecto, 'Preparar taller de técnicas de estudio para tutores nuevos', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Diseñar el taller de inducción para los tutores que se incorporan este semestre.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(12),
  }, lider.idUsuario);
  const t3_3 = await ensureTareaS6(p1.idProyecto, 'Actualizar banco de recursos de Cálculo I', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Revisar y actualizar los materiales de apoyo del curso de Cálculo I.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(15),
  }, lider.idUsuario);
  const t3_4 = await ensureTareaS6(p1.idProyecto, 'Configurar agenda semanal de sesiones de tutoría', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Configurar en la plataforma la agenda semanal de sesiones disponibles.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6, fechaLimite: dateOnly(8),
  }, lider.idUsuario);
  const t3_5 = await ensureTareaS6(p1.idProyecto, 'Elaborar guía de atención y derivación de casos', {
    idSprint: s3.idSprint, idHito: h2.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Redactar la guía de atención y los criterios de derivación de casos complejos.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(9),
  }, lider.idUsuario);
  const t3_6 = await ensureTareaS6(p1.idProyecto, 'Revisar solicitudes de tutoría pendientes del semestre', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: null,
    descripcionTarea: 'Depurar y priorizar las solicitudes de tutoría recibidas este semestre.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(6),
  }, lider.idUsuario);
  const t3_7 = await ensureTareaS6(p1.idProyecto, 'Probar flujo de reserva de sesiones de tutoría', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Ejecutar pruebas del flujo de reserva de sesiones de principio a fin.',
    estadoTarea: EstadoTarea.EN_REVISION, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(2),
  }, lider.idUsuario);
  const t3_8 = await ensureTareaS6(p1.idProyecto, 'Validar criterios de selección de nuevos tutores', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Validar los criterios y el proceso de selección de tutores nuevos.',
    estadoTarea: EstadoTarea.EN_REVISION, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(9),
  }, lider.idUsuario);
  const t3_9 = await ensureTareaS6(p1.idProyecto, 'Levantar necesidades de cursos prioritarios para el ciclo', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Levantar la demanda de tutorías por curso para priorizar la oferta del ciclo.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(-2),
  }, lider.idUsuario);
  const t3_10 = await ensureTareaS6(p1.idProyecto, 'Documentar protocolo de seguimiento académico', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Documentar el protocolo de seguimiento y sus indicadores.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(-5),
  }, lider.idUsuario);
  await setHitoEstadoS6(h2.idHito, 'EN_PROGRESO'); // 2/3 HECHO (t2_1,t2_2 HECHO + t3_5 EN_PROGRESO)
  await setHitoEstadoS6(h3.idHito, 'EN_PROGRESO'); // 1/3 HECHO (t3_4 EN_PROGRESO, t3_7 EN_REVISION, t3_9 HECHO)
  await setHitoEstadoS6(h4.idHito, 'PENDIENTE'); // sin tareas

  // Solicitudes de salida
  const solDiego = { idProyecto: p1.idProyecto, idUsuario: u.diego.idUsuario };
  const solEstefania = { idProyecto: p1.idProyecto, idUsuario: u.estefania.idUsuario };
  const solFernando = { idProyecto: p1.idProyecto, idUsuario: u.fernando.idUsuario };
  const solGabriela = { idProyecto: p1.idProyecto, idUsuario: u.gabriela.idUsuario };

  // ── Reconstrucción idempotente de las filas sin llave natural propia ───
  const p1TaskIds = [t1_1, t1_2, t1_3, t2_1, t2_2, t2_3, t3_1, t3_2, t3_3, t3_4, t3_5, t3_6, t3_7, t3_8, t3_9, t3_10].map((t) => t.idTarea);
  const p1ParticipationIds = [partBeatriz, partCarlosCoord, partCarlosPlat, partDiego, partEstefania, partFernando, partKarla, partGabriela].map((p) => p.idParticipacion);
  const p1DemoUserIds = [u.diego.idUsuario, u.estefania.idUsuario, u.fernando.idUsuario, u.gabriela.idUsuario];

  await prisma.$transaction(
    async (tx) => {
      await tx.registroAvanceAsignacion.deleteMany({ where: { asignacion: { idTarea: { in: p1TaskIds } } } });
      await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: p1TaskIds } } });
      await tx.horasParticipacion.deleteMany({ where: { idParticipacion: { in: p1ParticipationIds } } });
      await tx.solicitudSalidaProyecto.deleteMany({ where: { idProyecto: p1.idProyecto, idUsuario: { in: p1DemoUserIds } } });

      // Asignaciones Sprint 1 (cerradas, con horas reales, reconocidas)
      const a1_1 = await tx.asignacionTarea.create({ data: { idTarea: t1_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-70), desasignadaEn: ts(-50), horasReales: 6, reconocidoEn: ts(-50) } });
      const a1_2 = await tx.asignacionTarea.create({ data: { idTarea: t1_2.idTarea, idUsuario: u.fernando.idUsuario, idParticipacion: partFernando.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-69), desasignadaEn: ts(-50), horasReales: 5, reconocidoEn: ts(-50) } });
      await tx.asignacionTarea.create({ data: { idTarea: t1_3.idTarea, idUsuario: u.karla.idUsuario, idParticipacion: partKarla.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-68), desasignadaEn: ts(-50), horasReales: 7, reconocidoEn: ts(-50) } });

      // Asignaciones Sprint 2 (cerradas, con horas reales, reconocidas)
      const a2_1 = await tx.asignacionTarea.create({ data: { idTarea: t2_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-45), desasignadaEn: ts(-25), horasReales: 4, reconocidoEn: ts(-25) } });
      const a2_2 = await tx.asignacionTarea.create({ data: { idTarea: t2_2.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-44), desasignadaEn: ts(-25), horasReales: 5, reconocidoEn: ts(-25) } });
      await tx.asignacionTarea.create({ data: { idTarea: t2_3.idTarea, idUsuario: u.estefania.idUsuario, idParticipacion: partEstefania.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-43), desasignadaEn: ts(-25), horasReales: 6, reconocidoEn: ts(-25) } });

      // Asignaciones Sprint 3 (activo)
      await tx.asignacionTarea.create({ data: { idTarea: t3_2.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-6), desasignadaEn: null } });
      // Diego (PREPARACION): 3 asignaciones activas = blockers del workspace F9. Una COMPLETA (horas+avance), dos PENDIENTES.
      await tx.asignacionTarea.create({ data: { idTarea: t3_3.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-20), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_5.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-18), desasignadaEn: null } });
      const a3_7_diego = await tx.asignacionTarea.create({ data: { idTarea: t3_7.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-15), desasignadaEn: null, horasReales: 3 } });

      await tx.asignacionTarea.create({ data: { idTarea: t3_4.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosPlat.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-14), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_6.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-13), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_8.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-12), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_9.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-11), desasignadaEn: null, horasReales: 4 } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_10.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-9), desasignadaEn: ts(-1), horasReales: 3 } });

      // Registros de avance (>=200 caracteres, contenido creíble y distinto)
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a1_1.idAsignacion, idAutor: u.carlos.idUsuario, contenido: REGISTROS.diagnostico, creadoEn: ts(-51) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a1_2.idAsignacion, idAutor: u.fernando.idUsuario, contenido: REGISTROS.planTrabajo, creadoEn: ts(-51) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a2_1.idAsignacion, idAutor: u.carlos.idUsuario, contenido: REGISTROS.guiaBuenasPracticas, creadoEn: ts(-26) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a2_2.idAsignacion, idAutor: u.diego.idUsuario, contenido: REGISTROS.retroalimentacion, creadoEn: ts(-26) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a3_7_diego.idAsignacion, idAutor: u.diego.idUsuario, contenido: REGISTROS.pruebaReserva, creadoEn: ts(-14) } });

      // HorasParticipacion Sprint 1 y 2 (histórico ya reconocido/aprobado; horas distintas por Sprint)
      await tx.horasParticipacion.create({ data: { idParticipacion: partCarlosCoord.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 6, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partFernando.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 5, horasCalculadas: 5, horasAprobadas: 5, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partKarla.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 7, horasCalculadas: 7, horasAprobadas: 7, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });

      await tx.horasParticipacion.create({ data: { idParticipacion: partCarlosCoord.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 4, horasCalculadas: 4, horasAprobadas: 4, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partDiego.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 5, horasCalculadas: 5, horasAprobadas: 5, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partEstefania.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 6, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });

      // Solicitudes de salida
      // Diego -> PREPARACION (tiene 3 asignaciones activas = blockers de F9/F10)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solDiego, motivo: 'Necesito reducir mi carga de proyectos este semestre por motivos académicos.', estadoSolicitud: EstadoSolicitudSalida.PREPARACION, solicitadaEn: ts(-2) },
      });
      // Estefanía -> PENDIENTE_LIDER (ya sin asignaciones activas, esperando revisión del líder)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solEstefania, motivo: 'Terminé el período de colaboración que había planeado y quiero cerrar mi participación formalmente.', estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER, solicitadaEn: ts(-5) },
      });
      // Fernando -> histórico APROBADA (retirado CON contribución: sus tramos de Sprint 1 tienen horasReales)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solFernando, motivo: 'Voy a enfocarme en mi tesis y no podré continuar aportando activamente al programa.', estadoSolicitud: EstadoSolicitudSalida.APROBADA, solicitadaEn: ts(-12), resueltaEn: ts(-10), resueltaPor: lider.idUsuario },
      });
      // Gabriela -> histórico APROBADA (retirada SIN contribución: nunca tuvo un tramo con horasReales)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solGabriela, motivo: 'Cambié de horario de clases y ya no puedo cumplir con las horas comprometidas.', estadoSolicitud: EstadoSolicitudSalida.APROBADA, solicitadaEn: ts(-8), resueltaEn: ts(-6), resueltaPor: lider.idUsuario },
      });
    },
    { timeout: 60_000 },
  );

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 2 — SIN Sprint activo (F2: empty state + "Iniciar Sprint")
  // ══════════════════════════════════════════════════════════════════════
  const P2_TITLE = 'Plataforma de Seguimiento de Laboratorios — Sprint 6 Demo';
  const p2 = await ensureProyectoS6(P2_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Sistema para que los encargados de laboratorio registren uso de equipo, mantenimiento e incidencias.',
    objetivosProyecto: 'Centralizar el registro de uso y mantenimiento de los laboratorios de la facultad.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'PRESENCIAL',
    fechaInicio: dateOnly(-5),
    fechaFinEstimada: dateOnly(150),
    fechaPublicacion: dateOnly(-5),
  });
  const rSoporte = await ensureRolS6(p2.idProyecto, 'Soporte de laboratorio', 3, 'Da soporte técnico a los laboratorios de la facultad.');
  await ensureParticipacionS6(u.beatriz.idUsuario, rSoporte.idRolProyecto, 'ACTIVO', dateOnly(-4), null);
  console.log(`Proyecto 2 (sin Sprint) → #${p2.idProyecto} "${p2.tituloProyecto}"`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 3 — Sprint EN_FINALIZACION (F5/F6/F16 bloqueado)
  // ══════════════════════════════════════════════════════════════════════
  const P3_TITLE = 'Portal de Voluntariado Universitario — Sprint 6 Demo';
  const p3 = await ensureProyectoS6(P3_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Plataforma para coordinar jornadas de voluntariado y llevar seguimiento de horas de servicio comunitario.',
    objetivosProyecto: 'Facilitar la organización de jornadas de voluntariado y el reconocimiento de horas de servicio.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'PRESENCIAL',
    fechaInicio: dateOnly(-20),
    fechaFinEstimada: dateOnly(100),
    fechaPublicacion: dateOnly(-20),
  });
  const rCoordV = await ensureRolS6(p3.idProyecto, 'Coordinación de voluntariado', 3, 'Coordina la logística general de las jornadas de voluntariado.');
  const rLog = await ensureRolS6(p3.idProyecto, 'Logística de eventos', 3, 'Organiza la logística de cada jornada de voluntariado.');
  const rCom = await ensureRolS6(p3.idProyecto, 'Comunicación y difusión', 3, 'Prepara materiales de difusión para las campañas de voluntariado.');

  const partBeatrizP3 = await ensureParticipacionS6(u.beatriz.idUsuario, rCoordV.idRolProyecto, 'ACTIVO', dateOnly(-19), null);
  const partCarlosP3 = await ensureParticipacionS6(u.carlos.idUsuario, rLog.idRolProyecto, 'ACTIVO', dateOnly(-19), null);
  const partLauraP3 = await ensureParticipacionS6(u.laura.idUsuario, rCom.idRolProyecto, 'ACTIVO', dateOnly(-19), null);

  const s1p3 = await ensureSprintS6(p3.idProyecto, 1, EstadoSprint.EN_FINALIZACION, {
    fechaInicio: ts(-20),
    fechaFinalizacionIniciada: ts(-1),
  });

  const tp3_1 = await ensureTareaS6(p3.idProyecto, 'Organizar jornada de bienvenida a voluntarios', {
    idSprint: s1p3.idSprint, idRolProyecto: rCoordV.idRolProyecto,
    descripcionTarea: 'Organizar la jornada de bienvenida para los voluntarios nuevos del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 10,
  }, lider.idUsuario);
  const tp3_2 = await ensureTareaS6(p3.idProyecto, 'Coordinar logística de eventos del semestre', {
    idSprint: s1p3.idSprint, idRolProyecto: rLog.idRolProyecto,
    descripcionTarea: 'Coordinar la logística de las jornadas de voluntariado programadas este semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 12,
  }, lider.idUsuario);
  const tp3_3 = await ensureTareaS6(p3.idProyecto, 'Diseñar materiales de difusión para campañas', {
    idSprint: s1p3.idSprint, idRolProyecto: rCom.idRolProyecto,
    descripcionTarea: 'Diseñar los materiales de difusión de las campañas de voluntariado del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const tp3_4 = await ensureTareaS6(p3.idProyecto, 'Consolidar reporte de voluntariado del semestre', {
    idSprint: s1p3.idSprint, idRolProyecto: rCom.idRolProyecto,
    descripcionTarea: 'Consolidar el reporte final de horas y participación del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 3,
  }, lider.idUsuario);

  const p3TaskIds = [tp3_1, tp3_2, tp3_3, tp3_4].map((t) => t.idTarea);
  const p3ParticipationIds = [partBeatrizP3, partCarlosP3, partLauraP3].map((p) => p.idParticipacion);

  await prisma.$transaction(async (tx) => {
    await tx.registroAvanceAsignacion.deleteMany({ where: { asignacion: { idTarea: { in: p3TaskIds } } } });
    await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: p3TaskIds } } });
    await tx.horasParticipacion.deleteMany({ where: { idParticipacion: { in: p3ParticipationIds } } });

    await tx.asignacionTarea.create({ data: { idTarea: tp3_1.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 10, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_2.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 12, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_3.idTarea, idUsuario: u.laura.idUsuario, idParticipacion: partLauraP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 5, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_4.idTarea, idUsuario: u.laura.idUsuario, idParticipacion: partLauraP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 1, reconocidoEn: ts(-1) } });

    // Beatriz: sin ajuste. Carlos: ajuste a la baja (con justificación). Laura: ajuste al alza (con justificación).
    await tx.horasParticipacion.create({ data: { idParticipacion: partBeatrizP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 10, horasCalculadas: 10, horasAprobadas: 10, estadoHoras: 'PENDIENTE' } });
    await tx.horasParticipacion.create({
      data: {
        idParticipacion: partCarlosP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 12, horasCalculadas: 12, horasAprobadas: 9, estadoHoras: 'PENDIENTE',
        justificacionAjuste: 'Se ajustaron las horas reportadas porque parte del tiempo registrado correspondía a coordinación de otro proyecto paralelo y no debía reconocerse aquí.',
      },
    });
    await tx.horasParticipacion.create({
      data: {
        idParticipacion: partLauraP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 8, estadoHoras: 'PENDIENTE',
        justificacionAjuste: 'Se reconocieron horas adicionales de apoyo en la jornada de cierre que no habían quedado registradas en los tramos cerrados.',
      },
    });
  }, { timeout: 60_000 });
  console.log(`Proyecto 3 (EN_FINALIZACION) → #${p3.idProyecto} "${p3.tituloProyecto}" · Sprint #${s1p3.idSprint}`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 4 — sin Sprint operable, cierre de proyecto PERMITIDO (F16)
  // ══════════════════════════════════════════════════════════════════════
  const P4_TITLE = 'Gestión de Mentorías Estudiantiles — Sprint 6 Demo';
  const p4 = await ensureProyectoS6(P4_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Programa de mentorías entre estudiantes avanzados y estudiantes de primer ingreso.',
    objetivosProyecto: 'Acompañar a estudiantes de primer ingreso durante su primer año mediante mentores voluntarios.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'VIRTUAL',
    fechaInicio: dateOnly(-45),
    fechaFinEstimada: dateOnly(-15),
  });
  const rMentoria = await ensureRolS6(p4.idProyecto, 'Coordinación de mentorías', 2, 'Coordina la asignación de mentores a estudiantes de primer ingreso.');
  const partBeatrizP4 = await ensureParticipacionS6(u.beatriz.idUsuario, rMentoria.idRolProyecto, 'ACTIVO', dateOnly(-44), null);
  const s1p4 = await ensureSprintS6(p4.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-44),
    fechaCierre: ts(-16),
    cerradoPor: lider.idUsuario,
  });
  const tp4_1 = await ensureTareaS6(p4.idProyecto, 'Emparejar mentores con estudiantes de primer ingreso', {
    idSprint: s1p4.idSprint, idRolProyecto: rMentoria.idRolProyecto,
    descripcionTarea: 'Emparejar a cada estudiante de primer ingreso con un mentor de su misma carrera.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);
  const tp4_2 = await ensureTareaS6(p4.idProyecto, 'Cerrar reporte final del ciclo de mentorías', {
    idSprint: s1p4.idSprint, idRolProyecto: rMentoria.idRolProyecto,
    descripcionTarea: 'Consolidar el reporte final de participación del ciclo de mentorías.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4,
  }, lider.idUsuario);
  await prisma.$transaction(async (tx) => {
    const ids = [tp4_1.idTarea, tp4_2.idTarea];
    await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: ids } } });
    await tx.asignacionTarea.create({ data: { idTarea: tp4_1.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP4.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-44), desasignadaEn: ts(-16), horasReales: 3 } });
    await tx.asignacionTarea.create({ data: { idTarea: tp4_2.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP4.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-30), desasignadaEn: ts(-16), horasReales: 4 } });
  });
  console.log(`Proyecto 4 (cierre permitido) → #${p4.idProyecto} "${p4.tituloProyecto}"`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 5 — EN_SOLICITUD_CIERRE (opcional, F16 bloque de aprobar/rechazar)
  // ══════════════════════════════════════════════════════════════════════
  const P5_TITLE = 'Laboratorio de Datos Abiertos UVG — Sprint 6 Demo';
  const p5 = await ensureProyectoS6(P5_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Consolidación de datasets universitarios abiertos para investigación aplicada.',
    objetivosProyecto: 'Publicar un catálogo de datasets universitarios reutilizables para investigación.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
    modalidadProyecto: 'VIRTUAL',
    fechaInicio: dateOnly(-90),
    fechaFinEstimada: dateOnly(-20),
    fechaActualizacion: ts(-3),
  });
  const rCuraduria = await ensureRolS6(p5.idProyecto, 'Curaduría de datos', 2, 'Cura y documenta los datasets publicados en el catálogo.');
  const partCarlosP5 = await ensureParticipacionS6(u.carlos.idUsuario, rCuraduria.idRolProyecto, 'ACTIVO', dateOnly(-89), null);
  const s1p5 = await ensureSprintS6(p5.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-89),
    fechaCierre: ts(-25),
    cerradoPor: lider.idUsuario,
  });
  const tp5_1 = await ensureTareaS6(p5.idProyecto, 'Publicar catálogo inicial de datasets abiertos', {
    idSprint: s1p5.idSprint, idRolProyecto: rCuraduria.idRolProyecto,
    descripcionTarea: 'Publicar el catálogo inicial de datasets abiertos disponibles para investigación.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 8,
  }, lider.idUsuario);
  await prisma.$transaction(async (tx) => {
    await tx.asignacionTarea.deleteMany({ where: { idTarea: tp5_1.idTarea } });
    await tx.asignacionTarea.create({ data: { idTarea: tp5_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosP5.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-89), desasignadaEn: ts(-25), horasReales: 8 } });
  });
  console.log(`Proyecto 5 (EN_SOLICITUD_CIERRE) → #${p5.idProyecto} "${p5.tituloProyecto}"`);

  // ── Validaciones de consistencia post-seed ──────────────────────────────
  await validarSprint6(p1.idProyecto, u, lider.idUsuario);

  console.log('\n== Sprint 6 Demo dataset ready ==');
  console.log(`Users: ${Object.keys(USERS).length}`);
  console.log('Projects: 5');
  console.log(`Demo projects:`);
  console.log(`  #${p1.idProyecto} ${p1.tituloProyecto} (EN_PROGRESO, Sprint ACTIVO)`);
  console.log(`  #${p2.idProyecto} ${p2.tituloProyecto} (EN_PROGRESO, sin Sprint)`);
  console.log(`  #${p3.idProyecto} ${p3.tituloProyecto} (EN_PROGRESO, Sprint EN_FINALIZACION)`);
  console.log(`  #${p4.idProyecto} ${p4.tituloProyecto} (EN_PROGRESO, cierre permitido)`);
  console.log(`  #${p5.idProyecto} ${p5.tituloProyecto} (EN_SOLICITUD_CIERRE)`);

  return { u, lider };
}

async function validarSprint6(idProyecto: number, u: Record<UserKey, { idUsuario: number }>, liderId: number) {
  const problemas: string[] = [];

  const solPreparacion = await prisma.solicitudSalidaProyecto.findFirst({
    where: { idProyecto, idUsuario: u.diego.idUsuario, estadoSolicitud: 'PREPARACION' },
  });
  if (!solPreparacion) problemas.push('Diego no tiene una solicitud PREPARACION');

  const solPendienteLider = await prisma.solicitudSalidaProyecto.findFirst({
    where: { idProyecto, idUsuario: u.estefania.idUsuario, estadoSolicitud: 'PENDIENTE_LIDER' },
  });
  if (!solPendienteLider) problemas.push('Estefanía no tiene una solicitud PENDIENTE_LIDER');

  const fernandoContribucion = await prisma.asignacionTarea.count({
    where: { idUsuario: u.fernando.idUsuario, horasReales: { not: null }, tarea: { idProyecto } },
  });
  if (fernandoContribucion === 0) problemas.push('Fernando no tiene contribución (AsignacionTarea.horasReales)');

  const gabrielaContribucion = await prisma.asignacionTarea.count({
    where: { idUsuario: u.gabriela.idUsuario, horasReales: { not: null }, tarea: { idProyecto } },
  });
  if (gabrielaContribucion > 0) problemas.push('Gabriela tiene contribución y debería caer en RETIRADOS_SIN_CONTRIBUCION');

  const activasPorTarea = await prisma.asignacionTarea.groupBy({
    by: ['idTarea'],
    where: { tarea: { idProyecto }, desasignadaEn: null },
    _count: { idAsignacion: true },
  });
  for (const g of activasPorTarea) if (g._count.idAsignacion > 1) problemas.push(`Tarea ${g.idTarea} con ${g._count.idAsignacion} asignaciones activas`);

  const porEstado = await prisma.tarea.groupBy({
    by: ['estadoTarea'],
    where: { idProyecto, idSprint: (await prisma.sprint.findFirstOrThrow({ where: { idProyecto, estado: 'ACTIVO' } })).idSprint },
    _count: { idTarea: true },
  });
  const conteo = Object.fromEntries(porEstado.map((g) => [g.estadoTarea, g._count.idTarea]));
  const esperado = { POR_HACER: 3, EN_PROGRESO: 3, EN_REVISION: 2, HECHO: 2 };
  for (const [estado, n] of Object.entries(esperado)) if ((conteo[estado] ?? 0) !== n) problemas.push(`Kanban Sprint activo ${estado}: ${conteo[estado] ?? 0} (esperado ${n})`);

  if (problemas.length) abort(`Validación fallida (Sprint 6 Demo):\n  - ${problemas.join('\n  - ')}`);
  console.log(`\nValidación OK · Kanban Sprint activo: POR_HACER=${conteo.POR_HACER} EN_PROGRESO=${conteo.EN_PROGRESO} EN_REVISION=${conteo.EN_REVISION} HECHO=${conteo.HECHO}`);
  void liderId;
}

// ════════════════════════════════════════════════════════════════════════
// FASE 2 — Social Demo (amigos / seguir al líder), dentro del namespace s6.*
// ════════════════════════════════════════════════════════════════════════

async function ensureAmistad(idUsuarioSolicitante: number, idUsuarioReceptor: number, estado: 'PENDIENTE' | 'ACEPTADA', fechaSolicitud: Date) {
  return prisma.amistad.upsert({
    where: { idUsuarioSolicitante_idUsuarioReceptor: { idUsuarioSolicitante, idUsuarioReceptor } },
    update: { estado, fechaResolucion: estado === 'ACEPTADA' ? ts(-1) : null },
    create: {
      idUsuarioSolicitante,
      idUsuarioReceptor,
      estado,
      fechaSolicitud,
      fechaResolucion: estado === 'ACEPTADA' ? ts(-1) : null,
    },
  });
}

async function ensureSeguimiento(idSeguidor: number, idSeguido: number) {
  return prisma.seguimiento.upsert({
    where: { idSeguidor_idSeguido: { idSeguidor, idSeguido } },
    update: {},
    create: { idSeguidor, idSeguido, fechaCreacion: ts(-6) },
  });
}

/**
 * Hugo no participa en ningún proyecto del namespace s6.* (solo tiene una
 * postulación PENDIENTE) — es el visor ideal para demostrar el feed social:
 * su dashboard depende exclusivamente de "amigos"/"seguir al líder", nunca
 * de sus propias participaciones.
 *
 * - Hugo ↔ Beatriz: amistad ACEPTADA → "Proyectos de tus amigos" muestra
 *   el Proyecto 1 (Beatriz participa activamente ahí).
 * - Hugo → Valeria (lider): seguimiento → "De personas que sigues" muestra
 *   los Proyectos 2, 3 y 4 (el 1 ya se excluye por aparecer en amigos).
 * - Ingrid → Hugo: solicitud de amistad PENDIENTE → demo de "solicitudes
 *   pendientes" al iniciar sesión como Hugo.
 */
async function seedSocialDemo(u: Record<UserKey, { idUsuario: number }>, lider: { idUsuario: number }) {
  console.log('\n== Social Demo (amigos / seguir al líder) ==');

  await ensureAmistad(u.hugo.idUsuario, u.beatriz.idUsuario, 'ACEPTADA', ts(-10));
  await ensureAmistad(u.ingrid.idUsuario, u.hugo.idUsuario, 'PENDIENTE', ts(-2));
  await ensureSeguimiento(u.hugo.idUsuario, lider.idUsuario);

  console.log(`Hugo (#${u.hugo.idUsuario}) es amigo de Beatriz y sigue a Valeria (lider #${lider.idUsuario})`);
  console.log(`Ingrid (#${u.ingrid.idUsuario}) tiene una solicitud de amistad pendiente hacia Hugo`);
}

// ════════════════════════════════════════════════════════════════════════
// FASE 3 — Estados de proyecto (usuario real vernel@uvg.edu.gt)
// ════════════════════════════════════════════════════════════════════════

async function ensureProyectoEstados(data: Prisma.ProyectoUncheckedCreateInput) {
  const existente = await prisma.proyecto.findFirst({
    where: { creadoPor: data.creadoPor, tituloProyecto: data.tituloProyecto },
  });
  if (existente) return existente;
  return prisma.proyecto.create({ data });
}

async function ensureRolEstados(data: Prisma.RolProyectoUncheckedCreateInput) {
  const existente = await prisma.rolProyecto.findFirst({
    where: { idProyecto: data.idProyecto, nombreRol: data.nombreRol },
  });
  if (existente) return existente;
  return prisma.rolProyecto.create({ data });
}

async function ensureRevisionEstados(data: Prisma.RevisionProyectoUncheckedCreateInput) {
  const existente = await prisma.revisionProyecto.findFirst({
    where: { idProyecto: data.idProyecto, numeroEnvio: data.numeroEnvio },
  });
  if (existente) return existente;
  return prisma.revisionProyecto.create({ data });
}

async function ensureMensajeEstados(data: Prisma.MensajeRevisionProyectoUncheckedCreateInput) {
  const existente = await prisma.mensajeRevisionProyecto.findFirst({
    where: { idProyecto: data.idProyecto, idRemitente: data.idRemitente, contenido: data.contenido },
  });
  if (existente) return existente;
  return prisma.mensajeRevisionProyecto.create({ data });
}

async function seedEstadosVernel() {
  const vernel = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'vernel@uvg.edu.gt' } });
  const admin = await prisma.usuario.findFirstOrThrow({
    where: { rolesAcceso: { some: { rolAcceso: { nombrePerfil: 'administrador' } } } },
  });

  // ── BORRADOR: proyecto recién creado, aún no enviado a revisión ──────────
  // El canal de revisión (mensaje_revision_proyecto) está deshabilitado en
  // este estado, así que no se agregan mensajes ni revisiones.
  const pBorrador = await ensureProyectoEstados({
    tituloProyecto: 'Sistema de Reservas de Salas de Estudio',
    descripcionProyecto:
      'Plataforma para reservar salas de estudio y cubículos de la biblioteca desde el celular, evitando reservas duplicadas.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'BORRADOR',
    creadoPor: vernel.idUsuario,
  });
  await ensureRolEstados({ idProyecto: pBorrador.idProyecto, nombreRol: 'Desarrollador Backend', cupos: 2 });

  // ── EN_PROGRESO: aprobado en primer envío, equipo trabajando activamente ─
  const pEnProgreso = await ensureProyectoEstados({
    tituloProyecto: 'Aplicación de Bienestar Físico UVG',
    descripcionProyecto:
      'App para que estudiantes agenden clases deportivas del campus y lleven seguimiento de su actividad física semanal.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'EN_PROGRESO',
    creadoPor: vernel.idUsuario,
    fechaInicio: new Date('2026-05-01'),
    fechaFinEstimada: new Date('2026-11-01'),
    fechaPublicacion: new Date('2026-05-08'),
  });
  await ensureRolEstados({ idProyecto: pEnProgreso.idProyecto, nombreRol: 'Desarrollador Mobile', cupos: 2 });
  const revEnProgreso = await ensureRevisionEstados({
    idProyecto: pEnProgreso.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision:
      'Propuesta clara, con objetivos medibles y roles bien definidos. Aprobado sin observaciones en la primera revisión.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-04-28'),
    revisadaEn: new Date('2026-05-08'),
  });
  await ensureMensajeEstados({
    idProyecto: pEnProgreso.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revEnProgreso.idRevisionProyecto,
    contenido: 'Envié el proyecto a revisión, quedo atento por si necesitan algún ajuste.',
    enviadoEn: new Date('2026-04-28T09:00:00Z'),
  });
  await ensureMensajeEstados({
    idProyecto: pEnProgreso.idProyecto,
    idRemitente: admin.idUsuario,
    idRevision: revEnProgreso.idRevisionProyecto,
    contenido: 'Todo en orden, aprobado sin observaciones. Éxitos con la aplicación de bienestar físico.',
    enviadoEn: new Date('2026-05-08T13:00:00Z'),
    leidoEn: new Date('2026-05-08T15:00:00Z'),
  });

  // ── EN_SOLICITUD_CIERRE: aprobado y avanzado, ahora esperando cierre ────
  const pSolicitudCierre = await ensureProyectoEstados({
    tituloProyecto: 'Plataforma de Tutorías entre Pares',
    descripcionProyecto:
      'Conecta a estudiantes que necesitan apoyo académico con compañeros que ya aprobaron el curso.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'EN_SOLICITUD_CIERRE',
    creadoPor: vernel.idUsuario,
    fechaInicio: new Date('2026-02-01'),
    fechaFinEstimada: new Date('2026-07-01'),
    fechaPublicacion: new Date('2026-02-10'),
  });
  await ensureRolEstados({ idProyecto: pSolicitudCierre.idProyecto, nombreRol: 'Coordinador de Tutorías', cupos: 1 });
  const revSolicitudCierre = await ensureRevisionEstados({
    idProyecto: pSolicitudCierre.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision: 'Proyecto aprobado, cumple con los lineamientos de horas beca.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-01-25'),
    revisadaEn: new Date('2026-02-10'),
  });
  await ensureMensajeEstados({
    idProyecto: pSolicitudCierre.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revSolicitudCierre.idRevisionProyecto,
    contenido:
      'Ya completamos el semestre de tutorías y todos los tutores reportaron sus horas. Solicito el cierre del proyecto.',
    enviadoEn: new Date('2026-07-10T09:00:00Z'),
  });
  await ensureMensajeEstados({
    idProyecto: pSolicitudCierre.idProyecto,
    idRemitente: admin.idUsuario,
    contenido: 'Recibido, estamos revisando las horas reportadas antes de aprobar el cierre.',
    enviadoEn: new Date('2026-07-11T10:00:00Z'),
    leidoEn: new Date('2026-07-11T12:00:00Z'),
  });

  // ── CERRADO: ciclo completo, proyecto finalizado y cerrado ──────────────
  const pCerrado = await ensureProyectoEstados({
    tituloProyecto: 'Torneo Interno de Ajedrez UVG',
    descripcionProyecto: 'Organización del torneo semestral de ajedrez para estudiantes de todas las carreras.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'CERRADO',
    creadoPor: vernel.idUsuario,
    fechaInicio: new Date('2026-01-10'),
    fechaFinEstimada: new Date('2026-03-10'),
    fechaPublicacion: new Date('2026-01-15'),
  });
  await ensureRolEstados({ idProyecto: pCerrado.idProyecto, nombreRol: 'Organizador de Logística', cupos: 2 });
  const revCerrado = await ensureRevisionEstados({
    idProyecto: pCerrado.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision: 'Excelente propuesta, aprobado sin observaciones.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-01-05'),
    revisadaEn: new Date('2026-01-15'),
  });
  await ensureMensajeEstados({
    idProyecto: pCerrado.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revCerrado.idRevisionProyecto,
    contenido: 'El torneo se realizó con éxito y ya entregamos el informe final de resultados.',
    enviadoEn: new Date('2026-03-12T09:00:00Z'),
  });
  await ensureMensajeEstados({
    idProyecto: pCerrado.idProyecto,
    idRemitente: admin.idUsuario,
    contenido: 'Cierre aprobado. Ya se generaron los certificados de participación para el equipo organizador.',
    enviadoEn: new Date('2026-03-13T11:00:00Z'),
    leidoEn: new Date('2026-03-13T14:00:00Z'),
  });

  console.log(`\nProyectos verificados/creados para ${vernel.correo}:`);
  console.log(`  BORRADOR            -> #${pBorrador.idProyecto} ${pBorrador.tituloProyecto}`);
  console.log(`  EN_PROGRESO         -> #${pEnProgreso.idProyecto} ${pEnProgreso.tituloProyecto}`);
  console.log(`  EN_SOLICITUD_CIERRE -> #${pSolicitudCierre.idProyecto} ${pSolicitudCierre.tituloProyecto}`);
  console.log(`  CERRADO             -> #${pCerrado.idProyecto} ${pCerrado.tituloProyecto}`);
}

// ════════════════════════════════════════════════════════════════════════
// FASE 4 — Tutoring Workspace Demo (proyecto real de vernel@uvg.edu.gt)
// ════════════════════════════════════════════════════════════════════════

const PROJECT_TITLE = 'Sistema de Tutorías Académicas UVG';
const LEADER_EMAIL = 'vernel@uvg.edu.gt';

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

/**
 * Idéntico patrón que ensureParticipacionS6 (FND-08.B): para el objetivo
 * ACTIVO nunca reactiva una fila histórica (RETIRADO/COMPLETADO) — reutiliza
 * una fila YA ACTIVO si existe, o crea una nueva. Para cualquier otro
 * objetivo, el patrón find/update-or-create original es seguro porque esos
 * estados no están protegidos por el índice parcial.
 */
async function ensureParticipacionTutoring(idUsuario: number, idRolProyecto: number, estado: EstadoParticipacion, ingresoDate: Date, fechaSalida: Date | null) {
  if (estado === EstadoParticipacion.ACTIVO) {
    const activa = await prisma.participacionProyecto.findFirst({
      where: { idUsuario, idRolProyecto, estadoParticipacion: EstadoParticipacion.ACTIVO },
    });
    if (activa) {
      await prisma.participacionProyecto.update({
        where: { idParticipacion: activa.idParticipacion },
        data: { fechaIngreso: ingresoDate, fechaSalida },
      });
      return;
    }
    await prisma.participacionProyecto.create({
      data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso: ingresoDate, fechaSalida },
    });
    return;
  }

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

async function seedTutoringWorkspaceDemo() {
  console.log('\n== Escenario demostrativo: Sistema de Tutorías Académicas UVG ==\n');

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
  // FND-08.B: cuando el estado deseado es ACTIVO, el `findFirst` original
  // (sin filtrar por estado) podía devolver una fila RETIRADO histórica —
  // Postgres no garantiza qué fila entrega sin ORDER BY cuando ya existen
  // varias para el mismo (idUsuario, idRolProyecto) — y el `update`
  // posterior la reactivaba a ACTIVO, chocando con
  // `participacion_proyecto_activa_unique` si YA había otra fila ACTIVO
  // para ese mismo par (como ocurre en los datos reales de vernel/ROL_B:
  // #62 RETIRADO + #67 ACTIVO). La historia (RETIRADO/COMPLETADO) nunca
  // debe reactivarse solo para satisfacer el seed.
  // Activas
  await ensureParticipacionTutoring(E1.idUsuario, ROL_A.idRolProyecto, 'ACTIVO', ingresoDate, null);
  await ensureParticipacionTutoring(E1.idUsuario, ROL_C.idRolProyecto, 'ACTIVO', ingresoDate, null); // E1 con dos roles
  await ensureParticipacionTutoring(E2.idUsuario, ROL_A.idRolProyecto, 'ACTIVO', ingresoDate, null);
  await ensureParticipacionTutoring(E3.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', ingresoDate, null);
  await ensureParticipacionTutoring(E4.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', ingresoDate, null);
  await ensureParticipacionTutoring(E5.idUsuario, ROL_C.idRolProyecto, 'ACTIVO', ingresoDate, null);
  await ensureParticipacionTutoring(vernel.idUsuario, ROL_B.idRolProyecto, 'ACTIVO', ingresoDate, null); // líder + participante
  // Retirado (E6 en ROL_B)
  await ensureParticipacionTutoring(E6.idUsuario, ROL_B.idRolProyecto, 'RETIRADO', ingresoDate, dateOnly(-7));

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

  // ── 7b. Sprint (FND-08) ─────────────────────────────────────────────────
  // Tarea.idSprint es obligatoria desde FND-03: toda tarea del escenario
  // necesita un Sprint del mismo proyecto antes de crearse. Igual que en
  // seedSprint6Demo, NO se asume el estado del proyecto ni se hace upsert
  // por id determinista — se relee estadoProyecto real y se reutiliza un
  // Sprint existente compatible si ya hay uno (del backfill de FND-02 o de
  // una corrida previa de este mismo escenario), o se crea uno nuevo del
  // estado correcto si no hay ninguno. Nunca reactiva ni modifica un
  // Sprint existente.
  const proyectoTerminal = proyecto.estadoProyecto === 'CERRADO' || proyecto.estadoProyecto === 'CANCELADO';
  let sprintEscenario = await prisma.sprint.findFirst({
    where: proyectoTerminal
      ? { idProyecto, estado: 'CERRADO' }
      : { idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
  });
  if (!sprintEscenario) {
    sprintEscenario = await prisma.sprint.create({
      data: { idProyecto, numero: 1, estado: proyectoTerminal ? 'CERRADO' : 'ACTIVO' },
    });
  }
  console.log(`Sprint del escenario → #${sprintEscenario.idSprint} (estado=${sprintEscenario.estado})`);

  // ── 8. Tareas (idempotentes por título) + reconstrucción de hijos ──────────
  const taskId: Record<number, number> = {};
  for (const t of TASKS) {
    const data = {
      idHito: t.hito ? hitoId[t.hito] : null,
      idRolProyecto: t.rol ? rolById[t.rol].idRolProyecto : null,
      idSprint: sprintEscenario.idSprint,
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

  // ── 10. Amigos / seguir al líder (usuario real): E1 y vernel se hacen
  // amigos, y E6 (retirado del proyecto) sigue a vernel — su feed sigue
  // mostrando el proyecto aunque ya no participe activamente.
  await ensureAmistad(E1.idUsuario, vernel.idUsuario, 'ACEPTADA', ts(-15));
  await ensureSeguimiento(E6.idUsuario, vernel.idUsuario);

  // ── 11. Validaciones de consistencia ───────────────────────────────────────
  await validarTutoring(idProyecto, scenarioTaskIds, E6.idUsuario, ROL_B.idRolProyecto);

  console.log('\n== Escenario poblado correctamente ==');
}

async function validarTutoring(idProyecto: number, scenarioTaskIds: number[], idE6: number, idRolB: number) {
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

  if (problemas.length) abort(`Validación fallida (Tutoring Workspace Demo):\n  - ${problemas.join('\n  - ')}`);
  console.log(`\nValidación OK · Kanban escenario: POR_HACER=${conteo.POR_HACER} EN_PROGRESO=${conteo.EN_PROGRESO} EN_REVISION=${conteo.EN_REVISION} HECHO=${conteo.HECHO} (total ${scenarioTaskIds.length})`);
}

// ════════════════════════════════════════════════════════════════════════
// Orquestación
// ════════════════════════════════════════════════════════════════════════

async function main() {
  const { u, lider } = await seedSprint6Demo();
  await seedSocialDemo(u, lider);
  await seedEstadosVernel();
  await seedTutoringWorkspaceDemo();
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
