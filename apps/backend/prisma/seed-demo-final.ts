/**
 * Dataset de demo final (Fase 4): asociacion oficial con su junta, dos
 * organizaciones con chat #general, proyectos de los tres tipos de duenio
 * (personal, organizacion, asociacion) en distintos estados y horas del
 * semestre actual para 15 estudiantes de Computacion.
 *
 * Idempotente: todo se localiza por clave natural (correo, nombre, titulo) y
 * una segunda corrida no duplica nada. Solo crea o actualiza entidades de
 * demo; no usa updateMany ni deleteMany y nunca toca otras cuentas.
 *
 * Requiere DEMO_PASSWORD (contrasena de las cuentas demo NUEVAS; nunca se
 * imprime ni se guarda) y que carlos.mendoza@uvg.edu.gt ya exista.
 * DRY_RUN=1 corre todo dentro de una transaccion y la revierte al final.
 *
 * Uso: DEMO_PASSWORD="..." npm run prisma:seed-demo-final (en la imagen de
 * produccion no hay tsx; ver README, seccion Demo).
 */
import { Prisma, PrismaClient, type EstadoProyecto, type EstadoTarea, type RolOrganizacion, type TipoProyecto } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { addDaysToDay, todayInGuatemala } from '../src/common/utils/guatemala-date';
import { esEnRiesgo, semestreDe, type Semestre } from '../src/horas-semestre/semestre';

const cliente = new PrismaClient();
// En DRY_RUN pasa a ser el cliente de la transaccion que se revierte.
let prisma: Prisma.TransactionClient = cliente;

const NOMBRE_ASOCIACION = 'Asociación de Estudiantes de Ciencias de la Computación y TI';
const CORREO_PRESIDENTE = 'carlos.mendoza@uvg.edu.gt';
// Metas variadas por estudiante (indice % 3).
const METAS_BECA = [80, 60, 100];
const METAS_EXTENSION = [40, 30, 50];
// Carlos (presidente): cuenta real, solo se fija su registro del semestre.
const REGISTRO_PRESIDENTE = { metaBeca: 50, becaDeclarada: 20, metaExtension: 40, extensionDeclarada: 10 };
const RIESGO_MIN = 4;
const RIESGO_MAX = 8;

const stats: Record<string, { creado: number; actualizado: number }> = {};
const contar = (entidad: string, tipo: 'creado' | 'actualizado') => stats[entidad][tipo]++;

/** Busca por clave natural; crea si falta; actualiza solo si `actualizar` devuelve algo (hay diferencias). */
async function asegurar<T>(
  entidad: string,
  buscar: () => Promise<T | null>,
  crear: () => Promise<T>,
  actualizar?: (existente: T) => Promise<T> | undefined,
): Promise<T> {
  stats[entidad] ??= { creado: 0, actualizado: 0 };
  const existente = await buscar();
  if (!existente) {
    contar(entidad, 'creado');
    return crear();
  }
  const cambio = actualizar?.(existente);
  if (cambio) {
    contar(entidad, 'actualizado');
    return cambio;
  }
  return existente;
}

function enDias(n: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + n);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

const inicioDeDia = (dia: string) => new Date(`${dia}T06:00:00Z`);

// ─── Estudiantes demo ───────────────────────────────────────────────────────

const NOMBRES: [string, string][] = [
  ['Valeria', 'Castillo'], ['Diego', 'Morales'], ['Daniela', 'Pineda'], ['Andrés', 'Cifuentes'], ['Paula', 'Barrios'],
  ['Marco', 'Estrada'], ['Lucía', 'Monzón'], ['Rodrigo', 'Samayoa'], ['Gabriela', 'Orantes'], ['Javier', 'Calderón'],
  ['Mónica', 'Ruiz'], ['Esteban', 'Palencia'], ['Natalia', 'Solís'], ['Kevin', 'Arriaza'], ['Alejandra', 'Duarte'],
];

/** Desviacion (puntos porcentuales) del avance respecto al esperado a hoy; null = sin meta de ese tipo (3 estudiantes sin ninguna). Menor a -20 = en riesgo. */
const PLAN_HORAS: { beca: number | null; extension: number | null }[] = [
  { beca: 15, extension: null }, { beca: 5, extension: 10 }, { beca: -35, extension: null }, { beca: -10, extension: -5 },
  { beca: 30, extension: null }, { beca: -40, extension: -35 }, { beca: 0, extension: 20 }, { beca: -35, extension: null },
  { beca: 10, extension: null }, { beca: -38, extension: -10 }, { beca: null, extension: -33 }, { beca: null, extension: null },
  { beca: null, extension: null }, { beca: 40, extension: 5 }, { beca: null, extension: null },
];

const nn = (i: number) => String(i + 1).padStart(2, '0');
const correoDemo = (i: number) => `demo.cs${nn(i)}@uvg.edu.gt`;
const carneDemo = (i: number) => `DEMO-CS-${nn(i)}`;

/** Horas acreditadas en UVGenius (proyecto cerrado de la asociacion) por indice de estudiante; cuentan como avance de beca. */
const ACREDITADAS_BECA: Record<number, number> = { 4: 12, 8: 8 };

function avancePct(desviacion: number, esperado: number) {
  return Math.min(Math.max(esperado + desviacion, 0), 100);
}

function porcentajeEsperado(s: Semestre, hoy: string) {
  const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
  const total = dias(s.fin, s.inicio) + 1;
  return (Math.min(Math.max(dias(hoy, s.inicio) + 1, 0), total) / total) * 100;
}

interface FilaHoras { metaBeca: number | null; avanceBeca: number; metaExtension: number | null; avanceExtension: number }

/** Cuenta estudiantes en riesgo (beca o extension) con la funcion real esEnRiesgo y falla si quedan fuera de 4-8. */
function verificarRiesgo(filas: FilaHoras[], s: Semestre, hoy: string, origen: string) {
  const riesgo = (meta: number | null, avance: number) => meta !== null && meta > 0 && esEnRiesgo((avance / meta) * 100, s.inicio, s.fin, hoy);
  const enRiesgo = filas.filter((f) => riesgo(f.metaBeca, f.avanceBeca) || riesgo(f.metaExtension, f.avanceExtension)).length;
  if (enRiesgo < RIESGO_MIN || enRiesgo > RIESGO_MAX) {
    throw new Error(
      `Riesgo inesperado (${origen}): ${enRiesgo} estudiantes en riesgo al ${hoy} (se esperaban ${RIESGO_MIN}-${RIESGO_MAX}). ` +
        'Las desviaciones del plan solo producen riesgo cuando ha transcurrido mas del 20% del semestre.',
    );
  }
}

/** Plan de horas del semestre actual: devuelve metas y declaradas por estudiante, ya restadas las acreditadas. */
function planDeHoras(s: Semestre, hoy: string) {
  const esperado = porcentajeEsperado(s, hoy);
  const horas = (meta: number, desviacion: number) => Math.round((meta * avancePct(desviacion, esperado)) / 100);
  return PLAN_HORAS.map((p, i) => {
    const acreditada = ACREDITADAS_BECA[i] ?? 0;
    const metaB = METAS_BECA[i % 3];
    const metaE = METAS_EXTENSION[i % 3];
    const avanceBeca = p.beca === null ? 0 : horas(metaB, p.beca);
    const avanceExtension = p.extension === null ? 0 : horas(metaE, p.extension);
    return {
      metaBeca: p.beca === null ? null : metaB,
      becaDeclarada: Math.max(avanceBeca - acreditada, 0),
      metaExtension: p.extension === null ? null : metaE,
      extensionDeclarada: avanceExtension,
      // El avance real incluye las acreditadas aunque la declarada se haya recortado a 0.
      avanceBeca: Math.max(avanceBeca, acreditada),
      avanceExtension,
    };
  });
}

// ─── Proyectos ──────────────────────────────────────────────────────────────

interface TareaDef { titulo: string; estado: EstadoTarea; prioridad: 'BAJA' | 'MEDIA' | 'ALTA'; asignadoA: number; horas?: number; checklist?: [string, boolean][] }

interface ProyectoDef {
  titulo: string;
  descripcion: string;
  tipo: TipoProyecto;
  estado: EstadoProyecto;
  creadoPor: number;
  idAsociacion?: number;
  idOrganizacion?: number;
  participantes: number[];
  sprint: 'activo' | 'cerrado' | null;
  tareas: TareaDef[];
  acreditadas?: Record<number, number>;
}

async function armarProyecto(d: ProyectoDef) {
  const proyecto = await asegurar(
    'proyectos',
    () => prisma.proyecto.findFirst({ where: { tituloProyecto: d.titulo } }),
    () =>
      prisma.proyecto.create({
        data: {
          tituloProyecto: d.titulo,
          descripcionProyecto: d.descripcion,
          tipoProyecto: d.tipo,
          estadoProyecto: d.estado,
          creadoPor: d.creadoPor,
          idAsociacion: d.idAsociacion ?? null,
          fechaPublicacion: enDias(-45),
          fechaInicio: enDias(-40),
          fechaFinEstimada: enDias(d.estado === 'CERRADO' ? -5 : 60),
        },
      }),
    (p) =>
      p.estadoProyecto !== d.estado || p.idAsociacion !== (d.idAsociacion ?? null)
        ? prisma.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { estadoProyecto: d.estado, idAsociacion: d.idAsociacion ?? null } })
        : undefined,
  );

  if (d.idOrganizacion) {
    await asegurar(
      'proyecto_organizacion',
      () => prisma.proyectoOrganizacion.findUnique({ where: { idProyecto_idOrganizacion: { idProyecto: proyecto.idProyecto, idOrganizacion: d.idOrganizacion! } } }),
      () => prisma.proyectoOrganizacion.create({ data: { idProyecto: proyecto.idProyecto, idOrganizacion: d.idOrganizacion!, rolOrganizacion: 'PRINCIPAL' } }),
    );
  }

  const nombreRol = 'Desarrollador/a';
  const rol = await asegurar(
    'roles_proyecto',
    () => prisma.rolProyecto.findFirst({ where: { idProyecto: proyecto.idProyecto, nombreRol } }),
    () => prisma.rolProyecto.create({ data: { idProyecto: proyecto.idProyecto, nombreRol, descripcionRolProyecto: 'Desarrollo del proyecto.', cupos: d.participantes.length + 2 } }),
  );

  const participaciones = new Map<number, number>();
  for (const idUsuario of d.participantes) {
    const postulacion = await asegurar(
      'postulaciones',
      () => prisma.postulacion.findFirst({ where: { idUsuarioPostulante: idUsuario, idRolProyecto: rol.idRolProyecto } }),
      () =>
        prisma.postulacion.create({
          data: { idUsuarioPostulante: idUsuario, idRolProyecto: rol.idRolProyecto, justificacion: 'Participante de demo.', estadoPostulacion: 'ACEPTADA', resueltaPor: d.creadoPor, fechaResolucion: new Date() },
        }),
    );
    const estadoParticipacion = d.estado === 'CERRADO' ? 'COMPLETADO' : 'ACTIVO';
    const participacion = await asegurar(
      'participaciones',
      () => prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto: rol.idRolProyecto } }),
      () => prisma.participacionProyecto.create({ data: { idUsuario, idRolProyecto: rol.idRolProyecto, idPostulacion: postulacion.idPostulacion, estadoParticipacion } }),
      (p) => (p.estadoParticipacion !== estadoParticipacion ? prisma.participacionProyecto.update({ where: { idParticipacion: p.idParticipacion }, data: { estadoParticipacion } }) : undefined),
    );
    participaciones.set(idUsuario, participacion.idParticipacion);
  }

  if (d.sprint === null) return proyecto;

  // Nunca un segundo sprint operable (sprint_operable_unique).
  const sprint = await asegurar(
    'sprints',
    () =>
      prisma.sprint.findFirst({
        where: d.sprint === 'activo' ? { idProyecto: proyecto.idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } } : { idProyecto: proyecto.idProyecto, numero: 1, estado: 'CERRADO' },
      }),
    () =>
      d.sprint === 'activo'
        ? prisma.sprint.create({ data: { idProyecto: proyecto.idProyecto, numero: 1, estado: 'ACTIVO', fechaInicio: enDias(-7), fechaFinPlaneada: enDias(7) } })
        : prisma.sprint.create({
            data: {
              idProyecto: proyecto.idProyecto, numero: 1, estado: 'CERRADO', fechaInicio: enDias(-30), fechaFinPlaneada: enDias(-3), fechaCierre: enDias(-2), cerradoPor: d.creadoPor,
              tareasPlanificadasCierre: d.tareas.length, tareasCompletadasCierre: d.tareas.filter((t) => t.estado === 'HECHO').length,
              hitosTotalesCierre: 0, hitosCompletadosCierre: 0, porcentajeCumplimientoCierre: 100, tareasArrastradasCierre: 0,
            },
          }),
  );

  for (const [orden, t] of d.tareas.entries()) {
    const tarea = await asegurar(
      'tareas',
      () => prisma.tarea.findFirst({ where: { idProyecto: proyecto.idProyecto, tituloTarea: t.titulo } }),
      () =>
        prisma.tarea.create({
          data: { idProyecto: proyecto.idProyecto, idSprint: sprint.idSprint, idRolProyecto: rol.idRolProyecto, tituloTarea: t.titulo, estadoTarea: t.estado, prioridad: t.prioridad, orden, creadaPor: d.creadoPor, fechaLimite: enDias(5 + orden) },
        }),
    );
    const asignacion = await asegurar(
      'asignaciones',
      () => prisma.asignacionTarea.findFirst({ where: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, desasignadaEn: null } }),
      () => prisma.asignacionTarea.create({ data: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, idParticipacion: participaciones.get(t.asignadoA), asignadoPor: d.creadoPor, horasReales: t.horas } }),
      (a) => (t.horas !== undefined && Number(a.horasReales) !== t.horas ? prisma.asignacionTarea.update({ where: { idAsignacion: a.idAsignacion }, data: { horasReales: t.horas } }) : undefined),
    );
    for (const [orden, [texto, completado]] of (t.checklist ?? []).entries()) {
      await asegurar(
        'checklist_items',
        () => prisma.tareaChecklistItem.findFirst({ where: { idTarea: tarea.idTarea, texto } }),
        () => prisma.tareaChecklistItem.create({ data: { idTarea: tarea.idTarea, texto, completado, orden } }),
        (c) => (c.completado !== completado || c.orden !== orden ? prisma.tareaChecklistItem.update({ where: { idItem: c.idItem }, data: { completado, orden } }) : undefined),
      );
    }
    if (t.horas === undefined) continue;
    await asegurar(
      'registros_tiempo',
      () => prisma.registroTiempoTarea.findFirst({ where: { idAsignacion: asignacion.idAsignacion, nota: 'Horas de demo' } }),
      () => prisma.registroTiempoTarea.create({ data: { idAsignacion: asignacion.idAsignacion, idUsuario: t.asignadoA, horas: t.horas!, fecha: enDias(-2), nota: 'Horas de demo' } }),
    );
  }

  for (const [idUsuario, horas] of Object.entries(d.acreditadas ?? {})) {
    const idParticipacion = participaciones.get(Number(idUsuario))!;
    await asegurar(
      'horas_acreditadas',
      () => prisma.horasParticipacion.findFirst({ where: { idParticipacion, idSprint: sprint.idSprint } }),
      () =>
        prisma.horasParticipacion.create({
          data: { idParticipacion, idSprint: sprint.idSprint, periodoInicio: enDias(-30), periodoFin: enDias(-2), horasReportadas: horas, horasCalculadas: horas, horasAprobadas: horas, estadoHoras: 'APROBADA', fechaAprobacion: new Date() },
        }),
    );
  }
  return proyecto;
}

// ─── Principal ──────────────────────────────────────────────────────────────

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Falta la variable de entorno DEMO_PASSWORD (contraseña de las cuentas demo nuevas).');

  const semestre = semestreDe(new Date());
  const hoy = todayInGuatemala();
  const plan = planDeHoras(semestre, hoy);
  verificarRiesgo(
    [
      ...plan.map((p) => ({ metaBeca: p.metaBeca, avanceBeca: p.avanceBeca, metaExtension: p.metaExtension, avanceExtension: p.avanceExtension })),
      { metaBeca: REGISTRO_PRESIDENTE.metaBeca, avanceBeca: REGISTRO_PRESIDENTE.becaDeclarada, metaExtension: REGISTRO_PRESIDENTE.metaExtension, avanceExtension: REGISTRO_PRESIDENTE.extensionDeclarada },
    ],
    semestre,
    hoy,
    'plan',
  );

  const presidente = await prisma.usuario.findUnique({ where: { correo: CORREO_PRESIDENTE } });
  if (!presidente) throw new Error(`No existe ${CORREO_PRESIDENTE}: debe existir antes de correr este script (corre seed.ts o crea la cuenta).`);

  const carrera = await prisma.carrera.findFirst({ where: { nombreCarrera: { contains: 'Computaci', mode: 'insensitive' } }, orderBy: { idCarrera: 'asc' } });
  if (!carrera) throw new Error('No existe la carrera de Computacion.');

  const rolEstudiante = await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'estudiante' },
    update: {},
    create: { nombrePerfil: 'estudiante', descripcion: 'Estudiante registrado en la plataforma' },
  });

  // La contrasena solo se hashea para cuentas nuevas (mismo bcryptjs y costo 10 que el registro real).
  const hash = hashSync(password, 10);
  const est: number[] = [];
  for (const [i, [nombre, apellido]] of NOMBRES.entries()) {
    const usuario = await asegurar(
      'usuarios',
      () => prisma.usuario.findUnique({ where: { correo: correoDemo(i) } }),
      () => prisma.usuario.create({ data: { correo: correoDemo(i), contrasena: hash, nombre, apellido, estado: 'ACTIVO' } }),
      (u) => (u.estado !== 'ACTIVO' ? prisma.usuario.update({ where: { idUsuario: u.idUsuario }, data: { estado: 'ACTIVO' } }) : undefined),
    );
    est.push(usuario.idUsuario);
    await asegurar(
      'perfiles',
      () => prisma.perfilEstudiante.findUnique({ where: { idUsuario: usuario.idUsuario } }),
      () => prisma.perfilEstudiante.create({ data: { idUsuario: usuario.idUsuario, carne: carneDemo(i), idCarrera: carrera.idCarrera, semestre: 3 + (i % 6) } }),
      (p) => (p.idCarrera !== carrera.idCarrera ? prisma.perfilEstudiante.update({ where: { idUsuario: p.idUsuario }, data: { idCarrera: carrera.idCarrera } }) : undefined),
    );
    await asegurar(
      'roles_acceso',
      () => prisma.usuarioRolAcceso.findFirst({ where: { idUsuario: usuario.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } }),
      () => prisma.usuarioRolAcceso.create({ data: { idUsuario: usuario.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } }),
    );
    const { metaBeca, becaDeclarada, metaExtension, extensionDeclarada } = plan[i];
    await asegurar(
      'registros_horas_semestre',
      () => prisma.registroHorasSemestre.findUnique({ where: { idUsuario_anio_periodo: { idUsuario: usuario.idUsuario, anio: semestre.anio, periodo: semestre.periodo } } }),
      () => prisma.registroHorasSemestre.create({ data: { idUsuario: usuario.idUsuario, anio: semestre.anio, periodo: semestre.periodo, metaBeca, becaDeclarada, metaExtension, extensionDeclarada } }),
      (r) =>
        r.metaBeca !== metaBeca || r.becaDeclarada !== becaDeclarada || r.metaExtension !== metaExtension || r.extensionDeclarada !== extensionDeclarada
          ? prisma.registroHorasSemestre.update({ where: { idRegistro: r.idRegistro }, data: { metaBeca, becaDeclarada, metaExtension, extensionDeclarada } })
          : undefined,
    );
  }
  // Solo el registro del semestre de Carlos; su cuenta y perfil reales no se tocan.
  await asegurar(
    'registro_horas_presidente',
    () => prisma.registroHorasSemestre.findUnique({ where: { idUsuario_anio_periodo: { idUsuario: presidente.idUsuario, anio: semestre.anio, periodo: semestre.periodo } } }),
    () => prisma.registroHorasSemestre.create({ data: { idUsuario: presidente.idUsuario, anio: semestre.anio, periodo: semestre.periodo, ...REGISTRO_PRESIDENTE } }),
    (r) =>
      (Object.keys(REGISTRO_PRESIDENTE) as (keyof typeof REGISTRO_PRESIDENTE)[]).some((k) => r[k] !== REGISTRO_PRESIDENTE[k])
        ? prisma.registroHorasSemestre.update({ where: { idRegistro: r.idRegistro }, data: REGISTRO_PRESIDENTE })
        : undefined,
  );
  // est[0] = VP, est[1] = vocal; el resto son estudiantes y miembros de las orgs.
  const [vp, vocal] = est;

  // ─── Asociacion y junta ───────────────────────────────────────────────────
  const asociacion = await asegurar(
    'asociaciones',
    () => prisma.asociacion.findUnique({ where: { nombre: NOMBRE_ASOCIACION } }),
    () => prisma.asociacion.create({ data: { nombre: NOMBRE_ASOCIACION, descripcion: 'Asociación oficial de la carrera de Ingeniería en Ciencias de la Computación y TI.' } }),
    (a) => (a.archivada ? prisma.asociacion.update({ where: { idAsociacion: a.idAsociacion }, data: { archivada: false } }) : undefined),
  );
  await asegurar(
    'asociacion_carrera',
    () => prisma.asociacionCarrera.findUnique({ where: { idAsociacion_idCarrera: { idAsociacion: asociacion.idAsociacion, idCarrera: carrera.idCarrera } } }),
    () => prisma.asociacionCarrera.create({ data: { idAsociacion: asociacion.idAsociacion, idCarrera: carrera.idCarrera } }),
  );
  const junta = [
    { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR', idUsuario: presidente.idUsuario },
    { cargo: 'VICEPRESIDENTE', nivelPermiso: 'EDITOR', idUsuario: vp },
    { cargo: 'VOCAL', nivelPermiso: 'LECTURA', idUsuario: vocal },
  ] as const;
  for (const j of junta) {
    await asegurar(
      'junta_asociacion',
      () => prisma.juntaAsociacion.findUnique({ where: { idAsociacion_cargo: { idAsociacion: asociacion.idAsociacion, cargo: j.cargo } } }),
      () => prisma.juntaAsociacion.create({ data: { idAsociacion: asociacion.idAsociacion, ...j, asignadoPor: presidente.idUsuario } }),
      (e) =>
        e.idUsuario !== j.idUsuario || e.nivelPermiso !== j.nivelPermiso
          ? prisma.juntaAsociacion.update({ where: { idJuntaAsociacion: e.idJuntaAsociacion }, data: { idUsuario: j.idUsuario, nivelPermiso: j.nivelPermiso } })
          : undefined,
    );
  }

  // ─── Organizaciones, invitacion y chat #general ───────────────────────────
  const orgsDef: { nombre: string; descripcion: string; visibilidad: 'PUBLICA' | 'PRIVADA'; propietario: number; miembros: [number, RolOrganizacion][]; mensajes: [number, string][] }[] = [
    {
      nombre: 'Laboratorio de Innovación Abierta (Demo)',
      descripcion: 'Grupo estudiantil de demo que construye prototipos abiertos para la comunidad UVG.',
      visibilidad: 'PUBLICA',
      propietario: presidente.idUsuario,
      miembros: [[est[0], 'ADMINISTRADOR'], [est[1], 'EDITOR'], [est[3], 'EDITOR'], [est[4], 'LECTURA'], [est[5], 'MIEMBRO'], [est[6], 'LECTURA']],
      mensajes: [[presidente.idUsuario, 'Bienvenidos al laboratorio. Aquí coordinamos todo.'], [est[0], 'Subí el plan del trimestre al tablero.'], [est[4], 'Genial, lo reviso hoy.']],
    },
    {
      nombre: 'Comunidad de Ciencia de Datos (Demo)',
      descripcion: 'Comunidad privada de demo para proyectos de análisis de datos.',
      visibilidad: 'PRIVADA',
      propietario: est[2],
      miembros: [[est[7], 'ADMINISTRADOR'], [est[8], 'EDITOR'], [est[9], 'EDITOR'], [est[10], 'LECTURA'], [est[11], 'MIEMBRO']],
      mensajes: [[est[2], 'Hola equipo, este es el canal general.'], [est[7], 'Compartan sus datasets favoritos.'], [est[9], 'Tengo uno de datos abiertos de Guatemala.']],
    },
  ];
  const orgs: number[] = [];
  for (const [n, o] of orgsDef.entries()) {
    const org = await asegurar(
      'organizaciones',
      () => prisma.organizacion.findFirst({ where: { nombreOrganizacion: o.nombre } }),
      () => prisma.organizacion.create({ data: { nombreOrganizacion: o.nombre, tipoOrganizacion: 'GRUPO_ESTUDIANTIL', descripcionOrganizacion: o.descripcion, visibilidad: o.visibilidad, creadaPor: o.propietario } }),
      (e) =>
        e.visibilidad !== o.visibilidad || e.estadoOrganizacion !== 'ACTIVA'
          ? prisma.organizacion.update({ where: { idOrganizacion: e.idOrganizacion }, data: { visibilidad: o.visibilidad, estadoOrganizacion: 'ACTIVA' } })
          : undefined,
    );
    orgs.push(org.idOrganizacion);
    const miembros: [number, RolOrganizacion][] = [[o.propietario, 'PROPIETARIO'], ...o.miembros];
    for (const [idUsuario, rolOrganizacion] of miembros) {
      await asegurar(
        'miembros_organizacion',
        () => prisma.usuarioOrganizacion.findUnique({ where: { idUsuario_idOrganizacion: { idUsuario, idOrganizacion: org.idOrganizacion } } }),
        () => prisma.usuarioOrganizacion.create({ data: { idUsuario, idOrganizacion: org.idOrganizacion, rolOrganizacion } }),
        (m) =>
          m.rolOrganizacion !== rolOrganizacion || m.estadoMembresia !== 'ACTIVA'
            ? prisma.usuarioOrganizacion.update({ where: { idUsuarioOrganizacion: m.idUsuarioOrganizacion }, data: { rolOrganizacion, estadoMembresia: 'ACTIVA' } })
            : undefined,
      );
    }

    // Mismo canal que OrganizationChatService.sincronizar.
    const general = await asegurar(
      'chat_general',
      () => prisma.conversacion.findFirst({ where: { idOrganizacion: org.idOrganizacion, esCanal: true, nombreCanal: 'general' } }),
      () => prisma.conversacion.create({ data: { idOrganizacion: org.idOrganizacion, tipo: 'GRUPAL', nombre: 'general', nombreCanal: 'general', esCanal: true, creadaPor: o.propietario } }),
    );
    for (const [idUsuario] of miembros) {
      await asegurar(
        'chat_participantes',
        () => prisma.conversacionParticipante.findUnique({ where: { idConversacion_idUsuario: { idConversacion: general.idConversacion, idUsuario } } }),
        () => prisma.conversacionParticipante.create({ data: { idConversacion: general.idConversacion, idUsuario } }),
      );
    }
    for (const [k, [idRemitente, contenido]] of o.mensajes.entries()) {
      await asegurar(
        'chat_mensajes',
        () => prisma.mensajeChat.findFirst({ where: { idConversacion: general.idConversacion, idRemitente, contenido } }),
        () => prisma.mensajeChat.create({ data: { idConversacion: general.idConversacion, idRemitente, contenido, enviadoEn: new Date(Date.now() - (o.mensajes.length - k) * 3_600_000) } }),
      );
    }
    if (n === 0) {
      await asegurar(
        'invitaciones_organizacion',
        () => prisma.invitacionOrganizacion.findFirst({ where: { idOrganizacion: org.idOrganizacion, idInvitado: est[12], estado: 'PENDIENTE' } }),
        () => prisma.invitacionOrganizacion.create({ data: { idOrganizacion: org.idOrganizacion, idInvitado: est[12], idInvitadoPor: presidente.idUsuario, rolOrganizacion: 'EDITOR', venceEn: enDias(14) } }),
      );
    }
  }

  // ─── Proyectos: personal, de organizacion y de asociacion ─────────────────
  const tablero = (prefijo: string, a: number, b: number, c: number, d: number): TareaDef[] => [
    { titulo: `${prefijo}: definir alcance`, estado: 'HECHO', prioridad: 'ALTA', asignadoA: a, horas: 6 },
    { titulo: `${prefijo}: construir prototipo`, estado: 'EN_PROGRESO', prioridad: 'ALTA', asignadoA: b, horas: 4 },
    { titulo: `${prefijo}: revisión de pares`, estado: 'EN_REVISION', prioridad: 'MEDIA', asignadoA: c, horas: 2 },
    { titulo: `${prefijo}: documentación`, estado: 'POR_HACER', prioridad: 'BAJA', asignadoA: d },
  ];
  const cerradoPor = (a: number, b: number): TareaDef[] => [
    { titulo: 'Semana de la Computación: logística', estado: 'HECHO', prioridad: 'ALTA', asignadoA: a, horas: 12 },
    { titulo: 'Semana de la Computación: charlas', estado: 'HECHO', prioridad: 'MEDIA', asignadoA: b, horas: 8 },
  ];
  const proyectos: ProyectoDef[] = [
    {
      titulo: 'Demo - App de tutorías entre pares', descripcion: 'Proyecto personal de demo en progreso con sprint activo.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'EN_PROGRESO',
      creadoPor: est[4], participantes: [est[5], est[6], est[13]], sprint: 'activo', tareas: tablero('Tutorías', est[5], est[6], est[13], est[5]),
    },
    {
      titulo: 'Demo - Estación meteorológica comunitaria', descripcion: 'Proyecto de organización de demo ya publicado.', tipo: 'EXTRACURRICULAR_EXTENSION', estado: 'PUBLICADO',
      creadoPor: est[1], idOrganizacion: orgs[0], participantes: [], sprint: null, tareas: [],
    },
    {
      titulo: 'Demo - Tablero de datos abiertos de Guatemala', descripcion: 'Proyecto de organización de demo en progreso con sprint activo.', tipo: 'EXTRACURRICULAR_EXTENSION', estado: 'EN_PROGRESO',
      creadoPor: est[8], idOrganizacion: orgs[1], participantes: [est[7], est[9]], sprint: 'activo', tareas: tablero('Datos abiertos', est[7], est[9], est[7], est[9]),
    },
    {
      titulo: 'Demo - Hackathon de Computación', descripcion: 'Proyecto de la asociación en progreso con sprint activo.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'EN_PROGRESO',
      creadoPor: presidente.idUsuario, idAsociacion: asociacion.idAsociacion, participantes: [presidente.idUsuario, vp, est[2], est[3]], sprint: 'activo',
      tareas: [
        ...tablero('Hackathon', vp, est[2], est[3], vp),
        // Tarea de Carlos: «Mis tareas en este proyecto», checklist y registro de horas.
        {
          titulo: 'Hackathon: coordinar la logística del evento', estado: 'EN_PROGRESO', prioridad: 'ALTA', asignadoA: presidente.idUsuario,
          checklist: [['Reservar el auditorio', true], ['Confirmar a los jurados', false], ['Preparar el material de registro', false]],
        },
      ],
    },
    {
      titulo: 'Demo - Semana de la Computación (cerrado)', descripcion: 'Proyecto de la asociación ya cerrado, con horas acreditadas.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'CERRADO',
      creadoPor: presidente.idUsuario, idAsociacion: asociacion.idAsociacion, participantes: [est[4], est[8]], sprint: 'cerrado', tareas: cerradoPor(est[4], est[8]),
      acreditadas: { [est[4]]: ACREDITADAS_BECA[4], [est[8]]: ACREDITADAS_BECA[8] },
    },
  ];
  for (const p of proyectos) await armarProyecto(p);

  // ─── Verificacion final contra la base ────────────────────────────────────
  // Mismo universo que la asociacion: estudiantes activos de sus carreras.
  const registros = await prisma.registroHorasSemestre.findMany({
    where: {
      anio: semestre.anio,
      periodo: semestre.periodo,
      usuario: { estado: 'ACTIVO', perfil: { is: { carrera: { asociaciones: { some: { idAsociacion: asociacion.idAsociacion } } } } } },
    },
  });
  const idsRegistros = registros.map((r) => r.idUsuario);
  const acreditadas = await prisma.horasParticipacion.findMany({
    where: {
      estadoHoras: 'APROBADA',
      fechaAprobacion: { gte: inicioDeDia(semestre.inicio), lt: inicioDeDia(addDaysToDay(semestre.fin, 1)) },
      participacion: { idUsuario: { in: idsRegistros } },
    },
    select: { horasAprobadas: true, participacion: { select: { idUsuario: true, rolProyecto: { select: { proyecto: { select: { tipoProyecto: true } } } } } } },
  });
  const acred = (idUsuario: number, tipo: TipoProyecto) =>
    acreditadas.filter((h) => h.participacion.idUsuario === idUsuario && h.participacion.rolProyecto.proyecto.tipoProyecto === tipo).reduce((s, h) => s + Number(h.horasAprobadas ?? 0), 0);
  const demoConRegistro = registros.filter((r) => est.includes(r.idUsuario)).length;
  if (demoConRegistro !== est.length) throw new Error(`Se esperaban ${est.length} registros de horas del semestre y hay ${demoConRegistro}.`);
  verificarRiesgo(
    registros.map((r) => ({
      metaBeca: r.metaBeca,
      avanceBeca: r.becaDeclarada + acred(r.idUsuario, 'ACADEMICO_HORAS_BECA'),
      metaExtension: r.metaExtension,
      avanceExtension: r.extensionDeclarada + acred(r.idUsuario, 'EXTRACURRICULAR_EXTENSION'),
    })),
    semestre,
    hoy,
    'base de datos',
  );

  for (const [entidad, c] of Object.entries(stats)) console.log(`${entidad}: creados ${c.creado}, actualizados ${c.actualizado}`);
  console.log('Demo final seed completed successfully');
}

class Rollback extends Error {}

// Solo corre como entrypoint.
if (require.main === module) {
  const ejecutar = async () => {
    if (process.env.DRY_RUN !== '1') return main();
    try {
      await cliente.$transaction(
        async (tx) => {
          prisma = tx;
          await main();
          throw new Rollback();
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
      console.log('DRY_RUN=1: transaccion revertida, no se guardo nada.');
    }
  };
  ejecutar()
    .then(async () => {
      await cliente.$disconnect();
    })
    .catch(async (e) => {
      console.error(e instanceof Error ? e.message : e);
      await cliente.$disconnect();
      process.exit(1);
    });
}
