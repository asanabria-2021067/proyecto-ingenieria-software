import { PrismaClient, Prisma, type TipoNotificacion, type ModalidadEvento } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

/** Igual que en seed.ts: fecha relativa a "ahora" para que el contenido de
 * demo (tareas, eventos) no termine mostrando fechas pasadas sin importar
 * cuándo se corra este script. */
function enDias(n: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + n);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

function enDiasHora(n: number, hora: number, minuto = 0): Date {
  const fecha = enDias(n);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha;
}

/** Mismo criterio que resolveSeedSprint en seed.ts: nunca crea un segundo
 * Sprint operable para el mismo proyecto (violaría sprint_operable_unique).
 */
async function resolveSprint(idProyecto: number, numero: number) {
  const existente = await prisma.sprint.findFirst({
    where: { idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
  });
  if (existente) return existente;
  return prisma.sprint.create({ data: { idProyecto, numero, estado: 'ACTIVO' } });
}

async function ensureTarea(data: {
  idProyecto: number;
  idSprint: number;
  tituloTarea: string;
  estadoTarea: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA';
  creadaPor: number;
  idRolProyecto?: number;
  fechaLimite?: Date;
}) {
  const existente = await prisma.tarea.findFirst({
    where: { idProyecto: data.idProyecto, tituloTarea: data.tituloTarea },
  });
  if (existente) return existente;
  return prisma.tarea.create({ data });
}

async function ensureAsignacion(idTarea: number, idUsuario: number, asignadoPor: number) {
  const existente = await prisma.asignacionTarea.findFirst({
    where: { idTarea, idUsuario, desasignadaEn: null },
  });
  if (existente) return existente;
  return prisma.asignacionTarea.create({ data: { idTarea, idUsuario, asignadoPor } });
}

async function ensureEvento(data: {
  idProyecto: number;
  idCreador: number;
  tituloEvento: string;
  descripcionEvento?: string;
  fechaInicio: Date;
  fechaFin: Date;
  modalidad: ModalidadEvento;
  ubicacionLat?: number;
  ubicacionLng?: number;
  ubicacionNombre?: string;
  linkSesion?: string;
  rolesDestino?: number[];
}) {
  const existente = await prisma.eventoProyecto.findFirst({
    where: { idProyecto: data.idProyecto, tituloEvento: data.tituloEvento },
  });
  if (existente) return existente;
  return prisma.eventoProyecto.create({ data });
}

async function ensureNotificacion(data: {
  idUsuario: number;
  tipoNotificacion: TipoNotificacion;
  tituloNotificacion: string;
  mensajeNotificacion: string;
  datosJson?: Prisma.InputJsonValue;
  leidaEn?: Date;
}) {
  const existente = await prisma.notificacion.findFirst({
    where: { idUsuario: data.idUsuario, tituloNotificacion: data.tituloNotificacion, mensajeNotificacion: data.mensajeNotificacion },
  });
  if (existente) return existente;
  return prisma.notificacion.create({ data });
}

async function ensurePostulacion(data: {
  idUsuarioPostulante: number;
  idRolProyecto: number;
  justificacion: string;
  estadoPostulacion?: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
}) {
  const existente = await prisma.postulacion.findFirst({
    where: { idUsuarioPostulante: data.idUsuarioPostulante, idRolProyecto: data.idRolProyecto },
  });
  if (existente) return existente;
  return prisma.postulacion.create({ data });
}

async function ensureConversacion(idProyecto: number, creadaPor: number, participantes: number[]) {
  const candidatas = await prisma.conversacion.findMany({
    where: { idProyecto, tipo: 'INDIVIDUAL', creadaPor },
    include: { participantes: true },
  });
  const set = new Set(participantes);
  const existente = candidatas.find(
    (c) => c.participantes.length === set.size && c.participantes.every((p) => set.has(p.idUsuario)),
  );
  if (existente) return existente;
  const conv = await prisma.conversacion.create({ data: { idProyecto, tipo: 'INDIVIDUAL', creadaPor } });
  await Promise.all(
    participantes.map((idUsuario) =>
      prisma.conversacionParticipante.create({ data: { idConversacion: conv.idConversacion, idUsuario } }),
    ),
  );
  return conv;
}

async function ensureMensaje(idConversacion: number, idRemitente: number, contenido: string) {
  const existente = await prisma.mensajeChat.findFirst({ where: { idConversacion, idRemitente, contenido } });
  if (existente) return existente;
  return prisma.mensajeChat.create({ data: { idConversacion, idRemitente, contenido } });
}

async function ensureProyecto(data: {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: 'ACADEMICO_EXPERIENCIA' | 'ACADEMICO_HORAS_BECA' | 'EXTRACURRICULAR_EXTENSION';
  estadoProyecto: 'PUBLICADO' | 'EN_PROGRESO';
  creadoPor: number;
  fechaInicio: Date;
  fechaFinEstimada: Date;
}) {
  const existente = await prisma.proyecto.findFirst({ where: { tituloProyecto: data.tituloProyecto } });
  if (existente) return existente;
  return prisma.proyecto.create({ data });
}

async function ensureRolProyecto(data: { idProyecto: number; nombreRol: string; descripcionRolProyecto?: string; cupos: number }) {
  const existente = await prisma.rolProyecto.findFirst({ where: { idProyecto: data.idProyecto, nombreRol: data.nombreRol } });
  if (existente) return existente;
  return prisma.rolProyecto.create({ data });
}

/** Postulacion ACEPTADA + ParticipacionProyecto — sin esto la persona hace
 * tareas en el proyecto (AsignacionTarea) pero nunca aparece en la página de
 * Equipo/Miembros, que lee ParticipacionProyecto, no AsignacionTarea. */
async function ensureParticipacion(idUsuario: number, idRolProyecto: number, resueltaPor: number, justificacion: string) {
  let postulacion = await prisma.postulacion.findFirst({ where: { idUsuarioPostulante: idUsuario, idRolProyecto } });
  if (!postulacion) {
    postulacion = await prisma.postulacion.create({
      data: { idUsuarioPostulante: idUsuario, idRolProyecto, justificacion, estadoPostulacion: 'ACEPTADA', resueltaPor, fechaResolucion: new Date() },
    });
  } else if (postulacion.estadoPostulacion !== 'ACEPTADA') {
    postulacion = await prisma.postulacion.update({
      where: { idPostulacion: postulacion.idPostulacion },
      data: { estadoPostulacion: 'ACEPTADA', resueltaPor, fechaResolucion: new Date() },
    });
  }

  const existente = await prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto } });
  if (existente) return existente;
  return prisma.participacionProyecto.create({
    data: { idUsuario, idRolProyecto, idPostulacion: postulacion.idPostulacion, estadoParticipacion: 'ACTIVO' },
  });
}

/** Mismo formato que BitacoraEventosService.registrarEvento (bitacora-eventos.service.ts),
 * pero escrito directo por prisma (no hay transacción de dominio que envolver
 * aquí). `tipoEvento`/`tipoEntidad` son los literales de TipoEventoBitacora —
 * duplicados a mano en vez de importar src/ desde prisma/ para no acoplar el
 * runner de seeds (tsx) a la compilación de Nest. */
async function ensureBitacoraEvento(params: {
  idProyecto: number;
  idSprint?: number | null;
  idActor: number;
  tipoEvento: string;
  tipoEntidad: string;
  idEntidad: number;
  valorNuevo?: Record<string, unknown> | null;
}) {
  const existente = await prisma.bitacoraAuditoria.findFirst({
    where: { accion: params.tipoEvento, tipoObjeto: params.tipoEntidad, idObjeto: String(params.idEntidad) },
  });
  if (existente) return existente;
  return prisma.bitacoraAuditoria.create({
    data: {
      idUsuario: params.idActor,
      accion: params.tipoEvento,
      tipoObjeto: params.tipoEntidad,
      idObjeto: String(params.idEntidad),
      detalleJson: {
        idProyecto: params.idProyecto,
        idSprint: params.idSprint ?? null,
        valorAnterior: null,
        valorNuevo: params.valorNuevo ?? null,
      } as Prisma.InputJsonValue,
    },
  });
}

/** Amistad.@@unique es direccional (solicitante, receptor); una amistad ya
 * aceptada en cualquier sentido cuenta como existente. */
async function ensureAmistad(idA: number, idB: number) {
  const existente = await prisma.amistad.findFirst({
    where: {
      OR: [
        { idUsuarioSolicitante: idA, idUsuarioReceptor: idB },
        { idUsuarioSolicitante: idB, idUsuarioReceptor: idA },
      ],
    },
  });
  if (existente) {
    if (existente.estado !== 'ACEPTADA') {
      return prisma.amistad.update({ where: { idAmistad: existente.idAmistad }, data: { estado: 'ACEPTADA', fechaResolucion: new Date() } });
    }
    return existente;
  }
  return prisma.amistad.create({
    data: { idUsuarioSolicitante: idA, idUsuarioReceptor: idB, estado: 'ACEPTADA', fechaResolucion: new Date() },
  });
}

/** Crea un Sprint YA CERRADO con su propio set de tareas terminadas/arrastradas
 * y una serie diaria de instantaneas (fuente real del burndown, T-238) que
 * baja desde el total planificado hasta lo que de verdad quedo sin terminar.
 * Replica a mano las mismas formulas de calcularCongeladoDeCierreTx
 * (sprints.service.ts) para que los datos congelados sean consistentes con
 * lo que el propio cierre real habria calculado. */
async function ensureClosedSprintWithBurndown(params: {
  idProyecto: number;
  numero: number;
  diasInicio: number;
  diasFin: number;
  tareas: { titulo: string; puntos: number; hecha: boolean; creadaPor: number; asignadoA?: number }[];
}) {
  const existente = await prisma.sprint.findFirst({
    where: { idProyecto: params.idProyecto, numero: params.numero, estado: 'CERRADO' },
  });
  if (existente) return existente;

  const fechaInicio = enDias(params.diasInicio);
  const fechaCierre = enDias(params.diasFin);
  const planificadas = params.tareas.length;
  const completadas = params.tareas.filter((t) => t.hecha).length;
  const arrastradas = planificadas - completadas;
  const porcentaje = planificadas === 0 ? 0 : Math.round((completadas / planificadas) * 100);
  const puntosPlanificados = params.tareas.reduce((acc, t) => acc + t.puntos, 0);
  const puntosCompletados = params.tareas.filter((t) => t.hecha).reduce((acc, t) => acc + t.puntos, 0);

  const idActor = params.tareas[0]?.creadaPor;
  const sprint = await prisma.sprint.create({
    data: {
      idProyecto: params.idProyecto,
      numero: params.numero,
      estado: 'CERRADO',
      fechaInicio,
      fechaFinPlaneada: fechaCierre,
      fechaCierre,
      cerradoPor: idActor,
      tareasPlanificadasCierre: planificadas,
      tareasCompletadasCierre: completadas,
      tareasArrastradasCierre: arrastradas,
      hitosTotalesCierre: 0,
      hitosCompletadosCierre: 0,
      porcentajeCumplimientoCierre: porcentaje,
      puntosHistoriaPlanificadosCierre: puntosPlanificados,
      puntosHistoriaCompletadosCierre: puntosCompletados,
    },
  });

  // Bitácora (T-163/HU-140): sin esto la página de bitácora del proyecto
  // queda vacía aunque el sprint sí tenga historial real.
  if (idActor) {
    await ensureBitacoraEvento({
      idProyecto: params.idProyecto,
      idSprint: sprint.idSprint,
      idActor,
      tipoEvento: 'SPRINT_CLOSED',
      tipoEntidad: 'SPRINT',
      idEntidad: sprint.idSprint,
      valorNuevo: { estado: 'CERRADO', tareasArrastradas: arrastradas },
    });
  }

  for (const t of params.tareas) {
    const tarea = await prisma.tarea.create({
      data: {
        idProyecto: params.idProyecto,
        idSprint: sprint.idSprint,
        tituloTarea: t.titulo,
        estadoTarea: t.hecha ? 'HECHO' : 'POR_HACER',
        prioridad: 'MEDIA',
        puntosHistoria: t.puntos,
        creadaPor: t.creadaPor,
        fechaLimite: fechaCierre,
      },
    });
    if (t.asignadoA) {
      await prisma.asignacionTarea.create({ data: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, asignadoPor: t.creadaPor } });
    }
  }

  // Serie diaria de instantaneas: escalera decreciente realista (T-238),
  // terminando exactamente en lo que quedo pendiente al cierre (arrastradas).
  const duracionDias = Math.max(1, params.diasFin - params.diasInicio);
  const pasos = Math.min(duracionDias, 9);
  for (let i = 0; i <= pasos; i++) {
    const progreso = i / pasos;
    const tareasCompletadasAlDia = Math.min(completadas, Math.round(progreso * completadas));
    const puntosRestantesAlDia =
      i === pasos
        ? puntosPlanificados - puntosCompletados
        : Math.max(
            puntosPlanificados - puntosCompletados,
            Math.round(puntosPlanificados * (1 - progreso) * 0.97 ** i),
          );
    const dia = new Date(fechaInicio);
    dia.setDate(dia.getDate() + Math.round((i / pasos) * duracionDias));
    await prisma.instantaneaSprint.upsert({
      where: { idSprint_fecha: { idSprint: sprint.idSprint, fecha: dia } },
      update: {},
      create: {
        idSprint: sprint.idSprint,
        fecha: dia,
        tareasPendientes: planificadas - tareasCompletadasAlDia,
        tareasCompletadas: tareasCompletadasAlDia,
        puntosHistoriaRestantes: puntosRestantesAlDia,
      },
    });
  }

  return sprint;
}

/**
 * Sin esto, el Sprint ACTIVO que crea `resolveSprint` (fechaInicio = hoy,
 * cero instantaneas) siempre muestra "Aún no hay suficientes datos para el
 * burndown" en la demo, sin importar cuántas tareas tenga: el AC exige
 * fechaInicio en el pasado Y al menos 2 instantáneas (ver
 * BurndownChart/computeSprintBurndown). Atrasa fechaInicio/fechaFinPlaneada
 * si hace falta y genera la serie histórica hasta hoy con las tareas
 * REALES del sprint (mismo cálculo que SprintSnapshotsService, para que la
 * última fila coincida con lo que ya se ve en el tablero).
 */
async function ensureActiveSprintBurndown(idProyecto: number, diasInicio: number) {
  const sprint = await prisma.sprint.findFirst({
    where: { idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
  });
  if (!sprint) return;

  const fechaInicio = enDias(diasInicio);
  const fechaFinPlaneada = sprint.fechaFinPlaneada ?? enDias(diasInicio + 14);
  if (sprint.fechaInicio > fechaInicio || !sprint.fechaFinPlaneada) {
    await prisma.sprint.update({
      where: { idSprint: sprint.idSprint },
      data: { fechaInicio, fechaFinPlaneada },
    });
  }

  const tareas = await prisma.tarea.findMany({
    where: { idProyecto, idSprint: sprint.idSprint, eliminadoEn: null },
    select: { estadoTarea: true, puntosHistoria: true },
  });
  const totalTareas = tareas.length;
  const completadasHoy = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  const puntosTotal = tareas.reduce((acc, t) => acc + (t.puntosHistoria ?? 0), 0);
  const puntosRestantesHoy = tareas
    .filter((t) => t.estadoTarea !== 'HECHO')
    .reduce((acc, t) => acc + (t.puntosHistoria ?? 0), 0);

  const duracionDias = Math.max(2, Math.round((enDias(0).getTime() - fechaInicio.getTime()) / 86_400_000));
  for (let i = 0; i <= duracionDias; i++) {
    const esHoy = i === duracionDias;
    const progreso = i / duracionDias;
    const completadasAlDia = esHoy ? completadasHoy : Math.min(completadasHoy, Math.round(progreso * completadasHoy));
    const puntosRestantesAlDia = esHoy
      ? puntosRestantesHoy
      : Math.max(puntosRestantesHoy, Math.round(puntosTotal * (1 - progreso)));
    const dia = new Date(fechaInicio);
    dia.setDate(dia.getDate() + i);
    await prisma.instantaneaSprint.upsert({
      where: { idSprint_fecha: { idSprint: sprint.idSprint, fecha: dia } },
      update: esHoy
        ? {
            tareasPendientes: totalTareas - completadasAlDia,
            tareasCompletadas: completadasAlDia,
            puntosHistoriaRestantes: puntosRestantesAlDia,
          }
        : {},
      create: {
        idSprint: sprint.idSprint,
        fecha: dia,
        tareasPendientes: totalTareas - completadasAlDia,
        tareasCompletadas: completadasAlDia,
        puntosHistoriaRestantes: puntosRestantesAlDia,
      },
    });
  }
}

async function main() {
  const usuario = (correo: string) => prisma.usuario.findUniqueOrThrow({ where: { correo } });

  const [angel, carlos, maria, jose, ana, luis, sofia, fernando, camila, vernel] = await Promise.all([
    usuario('san24725@uvg.edu.gt'),
    usuario('carlos.mendoza@uvg.edu.gt'),
    usuario('maria.lopez@uvg.edu.gt'),
    usuario('jose.ramirez@uvg.edu.gt'),
    usuario('ana.garcia@uvg.edu.gt'),
    usuario('luis.hernandez@uvg.edu.gt'),
    usuario('sofia.martinez@uvg.edu.gt'),
    usuario('fernando.castaneda@uvg.edu.gt'),
    usuario('camila.rodriguez@uvg.edu.gt'),
    usuario('vernel@uvg.edu.gt'),
  ]);

  // ─── Reafirma la contraseña de las cuentas de demo ───────────────────────
  // seed.ts crea estas dos cuentas con upsert({ update: {} }): la primera vez
  // que corre fija la contraseña, pero en corridas posteriores (o si alguien
  // la cambio a mano probando "olvide mi contraseña") update:{} nunca la
  // vuelve a tocar. Sin este bloque, un reset de contraseña real deja a
  // san24725/vernel sin poder entrar con la clave de demo documentada.
  const TEST_HASH = hashSync('12345678', 10);
  await prisma.usuario.update({ where: { idUsuario: angel.idUsuario }, data: { contrasena: TEST_HASH, estado: 'ACTIVO' } });
  await prisma.usuario.update({ where: { idUsuario: vernel.idUsuario }, data: { contrasena: TEST_HASH, estado: 'ACTIVO' } });

  // Proyectos de Angel (10-13, ver seed.ts) y otros dos usados para chats/guardados.
  const [pGestionAcademica, pSaludMental, pELearning, pDashboardDeportivo] = await Promise.all([
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 10 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 11 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 12 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 13 } }),
  ]);
  const pTutorias = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 1 } });
  const pAmbiental = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 2 } });
  const pNeural = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 3 } });
  const pHackathon = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 18 } });

  // ─── Sprints + tareas + asignaciones para los 4 proyectos de Angel ───────
  const [sprintGestion, sprintSalud, sprintELearning, sprintDeportivo] = await Promise.all([
    resolveSprint(pGestionAcademica.idProyecto, 1),
    resolveSprint(pSaludMental.idProyecto, 1),
    resolveSprint(pELearning.idProyecto, 1),
    resolveSprint(pDashboardDeportivo.idProyecto, 1),
  ]);

  const tareaGestion1 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Diseñar modelo de datos de cursos', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: angel.idUsuario,
  });
  const tareaGestion2 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Implementar registro de calificaciones', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: angel.idUsuario, fechaLimite: enDias(4),
  });
  const tareaGestion3 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Maquetar panel de cursos activos', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario, fechaLimite: enDias(9),
  });
  await ensureAsignacion(tareaGestion1.idTarea, angel.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaGestion2.idTarea, angel.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaGestion3.idTarea, maria.idUsuario, angel.idUsuario);

  const tareaSalud1 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Prototipo de check-in emocional diario', estadoTarea: 'EN_REVISION', prioridad: 'ALTA', creadaPor: angel.idUsuario,
  });
  const tareaSalud2 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Integrar notificaciones push de recordatorio', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario, fechaLimite: enDias(12),
  });
  const tareaSalud3 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Investigar librerías de gráficas de ánimo', estadoTarea: 'HECHO', prioridad: 'BAJA', creadaPor: jose.idUsuario,
  });
  await ensureAsignacion(tareaSalud1.idTarea, ana.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaSalud2.idTarea, jose.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaSalud3.idTarea, jose.idUsuario, angel.idUsuario);

  const tareaELearning1 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Motor de evaluaciones automáticas', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: luis.idUsuario, fechaLimite: enDias(6),
  });
  const tareaELearning2 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Configurar pipeline de despliegue', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario,
  });
  const tareaELearning3 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Grabar video de bienvenida al curso demo', estadoTarea: 'HECHO', prioridad: 'BAJA', creadaPor: angel.idUsuario,
  });
  await ensureAsignacion(tareaELearning1.idTarea, luis.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaELearning2.idTarea, luis.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaELearning3.idTarea, angel.idUsuario, angel.idUsuario);

  const tareaDeportivo1 = await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Limpiar dataset histórico de partidos', estadoTarea: 'HECHO', prioridad: 'MEDIA', creadaPor: angel.idUsuario,
  });
  const tareaDeportivo2 = await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Gráfica de rendimiento por equipo', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: angel.idUsuario, fechaLimite: enDias(2),
  });
  await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Exportar reporte mensual a PDF', estadoTarea: 'POR_HACER', prioridad: 'BAJA', creadaPor: angel.idUsuario, fechaLimite: enDias(15),
  });
  await ensureAsignacion(tareaDeportivo1.idTarea, sofia.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaDeportivo2.idTarea, sofia.idUsuario, angel.idUsuario);

  // ─── Eventos de calendario: variedad de modalidades (T-263 + modalidad nueva) ─
  await ensureEvento({
    idProyecto: pGestionAcademica.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Kickoff con el equipo de Gestión Académica', descripcionEvento: 'Alineación de alcance y roles del sprint 1.',
    fechaInicio: enDiasHora(1, 9, 0), fechaFin: enDiasHora(1, 10, 0), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Edificio T',
  });
  await ensureEvento({
    idProyecto: pGestionAcademica.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Demo de registro de calificaciones', descripcionEvento: 'Presentación del avance a stakeholders.',
    fechaInicio: enDiasHora(5, 14, 0), fechaFin: enDiasHora(5, 15, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/gestion-academica-demo',
  });
  await ensureEvento({
    idProyecto: pSaludMental.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Revisión de diseño UX con mentoría', descripcionEvento: 'Sesión híbrida: parte del equipo asiste presencial.',
    fechaInicio: enDiasHora(3, 11, 0), fechaFin: enDiasHora(3, 12, 30), modalidad: 'MIXTA',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Biblioteca',
    linkSesion: 'https://meet.google.com/salud-mental-ux',
  });
  await ensureEvento({
    idProyecto: pELearning.idProyecto, idCreador: luis.idUsuario,
    tituloEvento: 'Planificación de evaluaciones automáticas', descripcionEvento: 'Solo para el equipo de desarrollo.',
    fechaInicio: enDiasHora(4, 16, 0), fechaFin: enDiasHora(4, 17, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/elearning-planning', rolesDestino: [12],
  });
  await ensureEvento({
    idProyecto: pDashboardDeportivo.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Entrega de dashboard a comité deportivo', descripcionEvento: 'Presentación final del proyecto.',
    fechaInicio: enDiasHora(10, 10, 0), fechaFin: enDiasHora(10, 11, 0), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Auditorio',
  });

  // ─── Postulaciones pendientes a roles vacantes de Angel (DevOps y Frontend) ─
  await ensurePostulacion({
    idUsuarioPostulante: fernando.idUsuario, idRolProyecto: 13,
    justificacion: 'He trabajado con Docker y pipelines de CI/CD en proyectos de curso.',
  });
  await ensurePostulacion({
    idUsuarioPostulante: camila.idUsuario, idRolProyecto: 15,
    justificacion: 'Tengo experiencia armando visualizaciones de datos con React.',
  });

  // ─── Notificaciones adicionales (bandeja más rica para la demo) ──────────
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${fernando.nombre} ${fernando.apellido} se postuló para el rol "DevOps Engineer" en tu proyecto "${pELearning.tituloProyecto}".`,
    datosJson: { projectId: pELearning.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${camila.nombre} ${camila.apellido} se postuló para el rol "Frontend Developer" en tu proyecto "${pDashboardDeportivo.tituloProyecto}".`,
    datosJson: { projectId: pDashboardDeportivo.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: maria.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Maquetar panel de cursos activos".',
    datosJson: { projectId: pGestionAcademica.idProyecto }, leidaEn: new Date(),
  });
  await ensureNotificacion({
    idUsuario: jose.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Integrar notificaciones push de recordatorio".',
    datosJson: { projectId: pSaludMental.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: luis.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Motor de evaluaciones automáticas".',
    datosJson: { projectId: pELearning.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: sofia.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Gráfica de rendimiento por equipo".',
    datosJson: { projectId: pDashboardDeportivo.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'PROYECTO_ACTUALIZADO',
    tituloNotificacion: 'Recordatorio de evento',
    mensajeNotificacion: `Tienes "Kickoff con el equipo de Gestión Académica" mañana a las 9:00 am.`,
    datosJson: { projectId: pGestionAcademica.idProyecto }, leidaEn: new Date(),
  });

  // ─── Chats: una conversación activa más y una archivada más ──────────────
  const convGestion = await ensureConversacion(pGestionAcademica.idProyecto, angel.idUsuario, [angel.idUsuario, maria.idUsuario]);
  await ensureMensaje(convGestion.idConversacion, angel.idUsuario, '¿Cómo va el registro de calificaciones? Lo necesitamos para el demo del viernes.');
  await ensureMensaje(convGestion.idConversacion, maria.idUsuario, 'Voy bien, ya tengo el CRUD base. Le falta la validación de notas fuera de rango.');
  await ensureMensaje(convGestion.idConversacion, angel.idUsuario, 'Perfecto, avísame cuando esté listo para probarlo.');

  // pHackathon (idProyecto 18) ya está CERRADO en seed.ts: conversación entre
  // José (creador) y Angel, archivada explícitamente para el demo de T-234.
  const convHackathon = await ensureConversacion(pHackathon.idProyecto, jose.idUsuario, [jose.idUsuario, angel.idUsuario]);
  await ensureMensaje(convHackathon.idConversacion, jose.idUsuario, '¡Gracias por participar en el hackathon! Quedó un proyecto muy sólido.');
  await ensureMensaje(convHackathon.idConversacion, angel.idUsuario, 'Coincido, fue una gran experiencia. Esperemos que se pueda repetir el próximo semestre.');
  if (!convHackathon.archivadaEn) {
    await prisma.conversacion.update({ where: { idConversacion: convHackathon.idConversacion }, data: { archivadaEn: new Date() } });
  }

  // ─── Proyectos guardados (bookmarks) para Angel ──────────────────────────
  for (const idProyecto of [pTutorias.idProyecto, pAmbiental.idProyecto, pNeural.idProyecto]) {
    await prisma.proyectoGuardado.upsert({
      where: { idUsuario_idProyecto: { idUsuario: angel.idUsuario, idProyecto } },
      update: {},
      create: { idUsuario: angel.idUsuario, idProyecto },
    });
  }
  // Carlos también guarda uno de los proyectos de Angel.
  await prisma.proyectoGuardado.upsert({
    where: { idUsuario_idProyecto: { idUsuario: carlos.idUsuario, idProyecto: pELearning.idProyecto } },
    update: {},
    create: { idUsuario: carlos.idUsuario, idProyecto: pELearning.idProyecto },
  });

  // ─── Semilla enriquecida para Vernel (segunda cuenta de demo) ────────────
  const pReservas = await ensureProyecto({
    tituloProyecto: 'Sistema de Reservas de Laboratorios',
    descripcionProyecto: 'Plataforma para reservar cubículos y laboratorios del CIT por horario, evitando choques y listas de espera en papel.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    creadoPor: vernel.idUsuario,
    fechaInicio: enDias(-20),
    fechaFinEstimada: enDias(120),
  });
  const pApoyoPares = await ensureProyecto({
    tituloProyecto: 'Red de Apoyo entre Pares - Bienestar',
    descripcionProyecto: 'Conecta estudiantes voluntarios capacitados con compañeros que buscan apoyo académico o emocional durante el semestre.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'EN_PROGRESO',
    creadoPor: vernel.idUsuario,
    fechaInicio: enDias(-45),
    fechaFinEstimada: enDias(90),
  });

  const rolReservasBackend = await ensureRolProyecto({ idProyecto: pReservas.idProyecto, nombreRol: 'Backend Developer', descripcionRolProyecto: 'API de disponibilidad y reservas', cupos: 2 });
  await ensureRolProyecto({ idProyecto: pReservas.idProyecto, nombreRol: 'Frontend Developer', descripcionRolProyecto: 'Calendario de reservas', cupos: 2 });
  const rolApoyoCoordinador = await ensureRolProyecto({ idProyecto: pApoyoPares.idProyecto, nombreRol: 'Coordinador de Voluntarios', descripcionRolProyecto: 'Capacitación y asignación de pares', cupos: 1 });
  const rolApoyoWeb = await ensureRolProyecto({ idProyecto: pApoyoPares.idProyecto, nombreRol: 'Desarrollador Web', descripcionRolProyecto: 'Formulario de solicitud y match', cupos: 1 });

  const [sprintReservas, sprintApoyo] = await Promise.all([
    resolveSprint(pReservas.idProyecto, 1),
    resolveSprint(pApoyoPares.idProyecto, 1),
  ]);

  const tareaReservas1 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Modelar disponibilidad de cubículos por horario', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: vernel.idUsuario,
  });
  const tareaReservas2 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Endpoint de creación y cancelación de reservas', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: vernel.idUsuario, fechaLimite: enDias(3),
  });
  const tareaReservas3 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Calendario semanal de disponibilidad', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: vernel.idUsuario, fechaLimite: enDias(8),
    idRolProyecto: rolReservasBackend.idRolProyecto,
  });
  await ensureAsignacion(tareaReservas1.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaReservas2.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaReservas3.idTarea, carlos.idUsuario, vernel.idUsuario);

  const tareaApoyo1 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Diseñar guía de capacitación para pares voluntarios', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: vernel.idUsuario,
  });
  const tareaApoyo2 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Formulario de solicitud de apoyo', estadoTarea: 'EN_REVISION', prioridad: 'MEDIA', creadaPor: vernel.idUsuario,
  });
  const tareaApoyo3 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Algoritmo simple de match por carrera e intereses', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: vernel.idUsuario, fechaLimite: enDias(10),
    idRolProyecto: rolApoyoCoordinador.idRolProyecto,
  });
  await ensureAsignacion(tareaApoyo1.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaApoyo2.idTarea, sofia.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaApoyo3.idTarea, ana.idUsuario, vernel.idUsuario);

  await ensureEvento({
    idProyecto: pReservas.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Revisión semanal del sprint de reservas', descripcionEvento: 'Repaso de avance y bloqueos del equipo.',
    fechaInicio: enDiasHora(2, 15, 0), fechaFin: enDiasHora(2, 16, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/reservas-labs-standup',
  });
  await ensureEvento({
    idProyecto: pReservas.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Prueba piloto en laboratorio CIT 302', descripcionEvento: 'Validación con usuarios reales del flujo de reserva.',
    fechaInicio: enDiasHora(7, 10, 0), fechaFin: enDiasHora(7, 11, 30), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Laboratorio CIT 302',
  });
  await ensureEvento({
    idProyecto: pApoyoPares.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Capacitación de nuevos voluntarios', descripcionEvento: 'Sesión híbrida: algunos voluntarios se conectan de otras sedes.',
    fechaInicio: enDiasHora(4, 17, 0), fechaFin: enDiasHora(4, 18, 30), modalidad: 'MIXTA',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Sala de Bienestar Estudiantil',
    linkSesion: 'https://meet.google.com/apoyo-pares-capacitacion',
  });

  await ensurePostulacion({
    idUsuarioPostulante: fernando.idUsuario, idRolProyecto: rolReservasBackend.idRolProyecto,
    justificacion: 'Tengo experiencia con NestJS y modelado de disponibilidad por horario.',
  });
  await ensurePostulacion({
    idUsuarioPostulante: jose.idUsuario, idRolProyecto: rolApoyoCoordinador.idRolProyecto,
    justificacion: 'He sido monitor de curso y me interesa coordinar el programa de pares.',
    estadoPostulacion: 'ACEPTADA',
  });

  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${fernando.nombre} ${fernando.apellido} se postuló para el rol "Backend Developer" en tu proyecto "${pReservas.tituloProyecto}".`,
    datosJson: { projectId: pReservas.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'POSTULACION_RESUELTA',
    tituloNotificacion: 'Postulación aceptada',
    mensajeNotificacion: `Aceptaste a ${jose.nombre} ${jose.apellido} como Coordinador de Voluntarios en "${pApoyoPares.tituloProyecto}".`,
    datosJson: { projectId: pApoyoPares.idProyecto }, leidaEn: new Date(),
  });
  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'TAREA_ACTUALIZADA',
    tituloNotificacion: 'Tarea en revisión',
    mensajeNotificacion: 'La tarea "Formulario de solicitud de apoyo" pasó a revisión.',
    datosJson: { projectId: pApoyoPares.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: carlos.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Calendario semanal de disponibilidad".',
    datosJson: { projectId: pReservas.idProyecto },
  });

  const convReservas = await ensureConversacion(pReservas.idProyecto, vernel.idUsuario, [vernel.idUsuario, carlos.idUsuario]);
  await ensureMensaje(convReservas.idConversacion, vernel.idUsuario, 'Carlos, ¿cómo va el calendario de disponibilidad? Lo necesitamos para la prueba piloto del jueves.');
  await ensureMensaje(convReservas.idConversacion, carlos.idUsuario, 'Voy avanzando, ya tengo la vista semanal armada, me falta conectar los horarios reales.');

  for (const idProyecto of [pGestionAcademica.idProyecto, pELearning.idProyecto]) {
    await prisma.proyectoGuardado.upsert({
      where: { idUsuario_idProyecto: { idUsuario: vernel.idUsuario, idProyecto } },
      update: {},
      create: { idUsuario: vernel.idUsuario, idProyecto },
    });
  }

  // ─── Amistades: san24725 y vernel no tenian ningun amigo ────────────────
  await ensureAmistad(carlos.idUsuario, maria.idUsuario);
  await ensureAmistad(carlos.idUsuario, jose.idUsuario);
  await ensureAmistad(angel.idUsuario, maria.idUsuario);
  await ensureAmistad(angel.idUsuario, jose.idUsuario);
  await ensureAmistad(angel.idUsuario, carlos.idUsuario);
  await ensureAmistad(vernel.idUsuario, maria.idUsuario);
  await ensureAmistad(vernel.idUsuario, ana.idUsuario);
  await ensureAmistad(vernel.idUsuario, sofia.idUsuario);
  await ensureAmistad(maria.idUsuario, ana.idUsuario);

  // ─── Chats activos adicionales para Angel y Vernel ───────────────────────
  const convELearning = await ensureConversacion(pELearning.idProyecto, angel.idUsuario, [angel.idUsuario, luis.idUsuario]);
  await ensureMensaje(convELearning.idConversacion, angel.idUsuario, 'Luis, ¿cómo va el motor de evaluaciones? Quiero mostrarlo en la demo.');
  await ensureMensaje(convELearning.idConversacion, luis.idUsuario, 'Ya corrige automáticamente. Me falta pulir el reporte de resultados.');
  await ensureMensaje(convELearning.idConversacion, angel.idUsuario, 'Perfecto, con eso alcanza para la demo.');

  const convApoyo = await ensureConversacion(pApoyoPares.idProyecto, vernel.idUsuario, [vernel.idUsuario, sofia.idUsuario]);
  await ensureMensaje(convApoyo.idConversacion, vernel.idUsuario, 'Sofía, ¿el formulario de solicitud ya está listo para revisión?');
  await ensureMensaje(convApoyo.idConversacion, sofia.idUsuario, 'Sí, lo subí ayer. Quedo atenta a tus comentarios.');

  // ─── Dos proyectos más (uno de Angel, uno de Vernel) — la demo necesitaba
  // más variedad para san24725 y vernel, no solo los 4+2 ya existentes ────
  const pBiblioteca = await ensureProyecto({
    tituloProyecto: 'Biblioteca Digital de Recursos Académicos',
    descripcionProyecto: 'Repositorio central donde estudiantes suben y buscan apuntes, guías y exámenes pasados por curso y carrera.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: 'EN_PROGRESO',
    creadoPor: angel.idUsuario,
    fechaInicio: enDias(-35),
    fechaFinEstimada: enDias(100),
  });
  const pBolsaEmpleo = await ensureProyecto({
    tituloProyecto: 'Bolsa de Empleo y Prácticas Estudiantiles',
    descripcionProyecto: 'Conecta vacantes de empresas aliadas con estudiantes por carrera y semestre, con seguimiento de postulaciones.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    creadoPor: vernel.idUsuario,
    fechaInicio: enDias(-25),
    fechaFinEstimada: enDias(110),
  });

  const [sprintBiblioteca, sprintBolsa] = await Promise.all([
    resolveSprint(pBiblioteca.idProyecto, 1),
    resolveSprint(pBolsaEmpleo.idProyecto, 1),
  ]);

  const tareaBiblioteca1 = await ensureTarea({
    idProyecto: pBiblioteca.idProyecto, idSprint: sprintBiblioteca.idSprint,
    tituloTarea: 'Catálogo de recursos por curso', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: angel.idUsuario,
  });
  const tareaBiblioteca2 = await ensureTarea({
    idProyecto: pBiblioteca.idProyecto, idSprint: sprintBiblioteca.idSprint,
    tituloTarea: 'Buscador con filtros por carrera y semestre', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: angel.idUsuario, fechaLimite: enDias(5),
  });
  const tareaBiblioteca3 = await ensureTarea({
    idProyecto: pBiblioteca.idProyecto, idSprint: sprintBiblioteca.idSprint,
    tituloTarea: 'Subida de apuntes por estudiantes', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario, fechaLimite: enDias(11),
  });
  await ensureAsignacion(tareaBiblioteca1.idTarea, angel.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaBiblioteca2.idTarea, maria.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaBiblioteca3.idTarea, jose.idUsuario, angel.idUsuario);

  const tareaBolsa1 = await ensureTarea({
    idProyecto: pBolsaEmpleo.idProyecto, idSprint: sprintBolsa.idSprint,
    tituloTarea: 'Listado de vacantes por carrera', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: vernel.idUsuario,
  });
  const tareaBolsa2 = await ensureTarea({
    idProyecto: pBolsaEmpleo.idProyecto, idSprint: sprintBolsa.idSprint,
    tituloTarea: 'Perfil de estudiante con CV', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: vernel.idUsuario, fechaLimite: enDias(4),
  });
  const tareaBolsa3 = await ensureTarea({
    idProyecto: pBolsaEmpleo.idProyecto, idSprint: sprintBolsa.idSprint,
    tituloTarea: 'Sistema de postulación a vacantes', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: vernel.idUsuario, fechaLimite: enDias(9),
  });
  await ensureAsignacion(tareaBolsa1.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaBolsa2.idTarea, sofia.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaBolsa3.idTarea, carlos.idUsuario, vernel.idUsuario);

  await ensureEvento({
    idProyecto: pBiblioteca.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Revisión de contenido subido esta semana', descripcionEvento: 'Repaso de calidad y duplicados antes de publicar.',
    fechaInicio: enDiasHora(3, 15, 0), fechaFin: enDiasHora(3, 16, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/biblioteca-digital-revision',
  });
  await ensureEvento({
    idProyecto: pBolsaEmpleo.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Llamada con empresas aliadas piloto', descripcionEvento: 'Alinear el formato de vacantes antes de abrir postulaciones.',
    fechaInicio: enDiasHora(6, 9, 0), fechaFin: enDiasHora(6, 10, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/bolsa-empleo-empresas',
  });

  // ─── Miembros reales (ParticipacionProyecto), no solo tareas asignadas:
  // sin esto, quien ya trabaja en el proyecto (arriba, via ensureAsignacion)
  // nunca aparece en la página de Equipo/Miembros del proyecto. ───────────
  const rolBiblioteca = await ensureRolProyecto({ idProyecto: pBiblioteca.idProyecto, nombreRol: 'Colaborador de Contenido', descripcionRolProyecto: 'Curaduría y moderación de recursos subidos', cupos: 2 });
  const rolBolsaEmpleo = await ensureRolProyecto({ idProyecto: pBolsaEmpleo.idProyecto, nombreRol: 'Colaborador', descripcionRolProyecto: 'Gestión de vacantes y postulantes', cupos: 2 });
  await ensureParticipacion(maria.idUsuario, rolBiblioteca.idRolProyecto, angel.idUsuario, 'Tengo experiencia moderando contenido de estudiantes.');
  await ensureParticipacion(jose.idUsuario, rolBiblioteca.idRolProyecto, angel.idUsuario, 'Quiero ayudar a organizar el catálogo por carrera.');
  await ensureParticipacion(sofia.idUsuario, rolBolsaEmpleo.idRolProyecto, vernel.idUsuario, 'Me interesa dar seguimiento a las empresas aliadas.');
  await ensureParticipacion(carlos.idUsuario, rolBolsaEmpleo.idRolProyecto, vernel.idUsuario, 'Puedo ayudar con el sistema de postulaciones.');
  await ensureParticipacion(carlos.idUsuario, rolReservasBackend.idRolProyecto, vernel.idUsuario, 'Tengo tiempo disponible para apoyar con el backend de reservas.');
  await ensureParticipacion(jose.idUsuario, rolApoyoCoordinador.idRolProyecto, vernel.idUsuario, 'He sido monitor de curso y me interesa coordinar el programa de pares.');
  await ensureParticipacion(sofia.idUsuario, rolApoyoWeb.idRolProyecto, vernel.idUsuario, 'Puedo encargarme del formulario de solicitud.');

  // ─── Vernel también aplica a un proyecto ajeno (no solo recibe postulaciones) ─
  await ensurePostulacion({
    idUsuarioPostulante: vernel.idUsuario, idRolProyecto: 15,
    justificacion: 'Me interesa apoyar con las visualizaciones del dashboard deportivo.',
  });

  // ─── Sprints cerrados: cada proyecto de la demo llega a al menos 3 sprints
  // (2 cerrados con backlog + el activo de arriba), y cada uno alimenta el
  // burndown con su propia serie de instantáneas (T-238) — sin esto, casi
  // todos mostraban "Aún no hay suficientes datos para el burndown". ──────
  const sprintsCerrados: Parameters<typeof ensureClosedSprintWithBurndown>[0][] = [
    {
      idProyecto: pGestionAcademica.idProyecto, numero: -1, diasInicio: -42, diasFin: -29,
      tareas: [
        { titulo: 'Investigación de plataformas similares (benchmark)', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Entrevistas con coordinadores académicos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
        { titulo: 'Definición del alcance del MVP', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Selección de stack tecnológico', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Borrador de cronograma del proyecto', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
      ],
    },
    {
      idProyecto: pGestionAcademica.idProyecto, numero: 0, diasInicio: -28, diasFin: -14,
      tareas: [
        { titulo: 'Levantamiento de requisitos con Asuntos Estudiantiles', puntos: 8, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Diseño de wireframes del panel de cursos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
        { titulo: 'Definición del modelo de datos de cursos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Setup de repositorio y CI', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Prototipo de autenticación institucional', puntos: 3, hecha: false, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
      ],
    },
    {
      idProyecto: pSaludMental.idProyecto, numero: -1, diasInicio: -42, diasFin: -29,
      tareas: [
        { titulo: 'Investigación con psicólogos del CAE', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: ana.idUsuario },
        { titulo: 'Definir métricas de bienestar a trackear', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Wireframes de la app de check-in', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Setup del proyecto móvil', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Piloto de encuesta inicial de ánimo', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: ana.idUsuario },
      ],
    },
    {
      idProyecto: pSaludMental.idProyecto, numero: 0, diasInicio: -28, diasFin: -14,
      tareas: [
        { titulo: 'Validación de tono y lenguaje inclusivo', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: ana.idUsuario },
        { titulo: 'Sistema de recordatorios locales', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Pantalla de historial emocional', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: ana.idUsuario },
        { titulo: 'Ajustes de accesibilidad (contraste, texto)', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Cierre de hallazgos con Bienestar Estudiantil', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      ],
    },
    {
      idProyecto: pELearning.idProyecto, numero: -1, diasInicio: -42, diasFin: -29,
      tareas: [
        { titulo: 'Análisis de plataformas de e-learning existentes', puntos: 3, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Definir rúbrica de evaluación automática', puntos: 5, hecha: true, creadaPor: luis.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Diseño de arquitectura del motor de correcciones', puntos: 5, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Setup del entorno de pruebas', puntos: 2, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Piloto con banco de preguntas de prueba', puntos: 3, hecha: false, creadaPor: luis.idUsuario, asignadoA: angel.idUsuario },
      ],
    },
    {
      idProyecto: pELearning.idProyecto, numero: 0, diasInicio: -28, diasFin: -14,
      tareas: [
        { titulo: 'Integración con banco de preguntas real', puntos: 5, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Reporte de resultados por estudiante', puntos: 5, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Pruebas de carga del motor de evaluación', puntos: 3, hecha: true, creadaPor: luis.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Documentación técnica del motor', puntos: 2, hecha: true, creadaPor: luis.idUsuario, asignadoA: luis.idUsuario },
        { titulo: 'Feedback de dos profesores piloto', puntos: 2, hecha: false, creadaPor: luis.idUsuario, asignadoA: angel.idUsuario },
      ],
    },
    {
      idProyecto: pDashboardDeportivo.idProyecto, numero: -1, diasInicio: -42, diasFin: -29,
      tareas: [
        { titulo: 'Recolección de datos históricos de partidos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Definir métricas clave por equipo', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Wireframes del dashboard', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Setup del proyecto de visualización', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Piloto con datos de una sola temporada', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
      ],
    },
    {
      idProyecto: pDashboardDeportivo.idProyecto, numero: 0, diasInicio: -28, diasFin: -14,
      tareas: [
        { titulo: 'Normalización del dataset histórico', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Gráficas de tendencia por jugador', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Filtros por temporada y equipo', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Exportación de reportes en PDF (borrador)', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Revisión con comité deportivo', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      ],
    },
    {
      idProyecto: pReservas.idProyecto, numero: -1, diasInicio: -44, diasFin: -31,
      tareas: [
        { titulo: 'Levantamiento de requisitos con Biblioteca y CIT', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Definir reglas de choque de horarios', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
        { titulo: 'Wireframes del calendario de reservas', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Setup del proyecto backend', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Prototipo de reglas de reserva por rol', puntos: 3, hecha: false, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
      ],
    },
    {
      idProyecto: pReservas.idProyecto, numero: 0, diasInicio: -30, diasFin: -16,
      tareas: [
        { titulo: 'Entrevistas con encargados de laboratorios', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Modelado inicial de disponibilidad', puntos: 8, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Investigación de librerías de calendario', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
        { titulo: 'Mockups del flujo de reserva', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Validación legal de retención de datos de uso', puntos: 2, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      ],
    },
    {
      idProyecto: pApoyoPares.idProyecto, numero: -1, diasInicio: -42, diasFin: -29,
      tareas: [
        { titulo: 'Investigación de programas de apoyo entre pares', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Entrevistas con Bienestar Estudiantil', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Definir perfil de voluntario ideal', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Wireframes del formulario de match', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: ana.idUsuario },
        { titulo: 'Piloto con 5 voluntarios', puntos: 2, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      ],
    },
    {
      idProyecto: pApoyoPares.idProyecto, numero: 0, diasInicio: -28, diasFin: -14,
      tareas: [
        { titulo: 'Validación de guía de capacitación con psicólogos', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Sistema de seguimiento de casos', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Métricas de satisfacción del programa', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: ana.idUsuario },
        { titulo: 'Ajustes de privacidad de datos sensibles', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Cierre de piloto con primer grupo de pares', puntos: 2, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      ],
    },
    {
      idProyecto: pBiblioteca.idProyecto, numero: -1, diasInicio: -35, diasFin: -22,
      tareas: [
        { titulo: 'Encuesta de necesidades a estudiantes', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
        { titulo: 'Definir taxonomía de categorías por carrera', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Wireframes del catálogo de recursos', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Setup del proyecto', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Piloto con apuntes de un solo curso', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
      ],
    },
    {
      idProyecto: pBiblioteca.idProyecto, numero: 0, diasInicio: -21, diasFin: -8,
      tareas: [
        { titulo: 'Sistema de calificación de recursos subidos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Moderación de contenido subido', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
        { titulo: 'Integración con cuentas institucionales', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
        { titulo: 'Panel de recursos más vistos', puntos: 2, hecha: true, creadaPor: angel.idUsuario, asignadoA: jose.idUsuario },
        { titulo: 'Revisión legal de derechos de autor', puntos: 2, hecha: false, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      ],
    },
    {
      idProyecto: pBolsaEmpleo.idProyecto, numero: -1, diasInicio: -25, diasFin: -18,
      tareas: [
        { titulo: 'Entrevistas con Oficina de Egresados', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Definir campos del perfil de estudiante', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Wireframes del listado de vacantes', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
        { titulo: 'Setup del proyecto', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Piloto con 3 empresas aliadas', puntos: 3, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      ],
    },
    {
      idProyecto: pBolsaEmpleo.idProyecto, numero: 0, diasInicio: -17, diasFin: -6,
      tareas: [
        { titulo: 'Notificaciones de vacantes afines por carrera', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
        { titulo: 'Panel de seguimiento para empresas', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Exportar postulantes a CSV', puntos: 2, hecha: true, creadaPor: vernel.idUsuario, asignadoA: sofia.idUsuario },
        { titulo: 'Pruebas con estudiantes de último año', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
        { titulo: 'Revisión de términos y condiciones', puntos: 2, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      ],
    },
  ];
  for (const def of sprintsCerrados) {
    await ensureClosedSprintWithBurndown(def);
  }

  // ─── Instantáneas del Sprint ACTIVO de cada proyecto — sin esto el
  // burndown del sprint EN CURSO (el que de verdad se mira en la demo)
  // seguía mostrando "sin datos suficientes" aunque los cerrados sí tuvieran. ─
  for (const idProyecto of [
    pGestionAcademica.idProyecto,
    pSaludMental.idProyecto,
    pELearning.idProyecto,
    pDashboardDeportivo.idProyecto,
    pReservas.idProyecto,
    pApoyoPares.idProyecto,
    pBiblioteca.idProyecto,
    pBolsaEmpleo.idProyecto,
  ]) {
    await ensureActiveSprintBurndown(idProyecto, -5);
  }

  console.log('Demo extra seed completed successfully');
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
