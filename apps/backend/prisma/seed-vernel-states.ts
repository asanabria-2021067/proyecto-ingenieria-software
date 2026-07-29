/**
 * Completa, para el usuario real vernel@uvg.edu.gt, los proyectos que le
 * faltan para cubrir cada valor de EstadoProyecto, junto con el historial de
 * revisión (admin ↔ líder) que documenta el flujo de creación → aceptación.
 *
 * A diferencia de seed.ts/seed-admin.ts, este script nunca fija IDs
 * explícitos: esos scripts asumen que ellos son la única fuente de datos de
 * la base, y en un entorno con uso real esa suposición ya no se cumple. Aquí
 * cada entidad se busca por clave natural (correo, idProyecto+nombreRol,
 * idProyecto+numeroEnvio) antes de crearla, y los IDs los asigna Postgres.
 *
 * Uso: DATABASE_URL="..." npx tsx prisma/seed-vernel-states.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureProyecto(data: Prisma.ProyectoUncheckedCreateInput) {
  const existente = await prisma.proyecto.findFirst({
    where: { creadoPor: data.creadoPor, tituloProyecto: data.tituloProyecto },
  });
  if (existente) return existente;
  return prisma.proyecto.create({ data });
}

async function ensureRol(data: Prisma.RolProyectoUncheckedCreateInput) {
  const existente = await prisma.rolProyecto.findFirst({
    where: { idProyecto: data.idProyecto, nombreRol: data.nombreRol },
  });
  if (existente) return existente;
  return prisma.rolProyecto.create({ data });
}

async function ensureRevision(data: Prisma.RevisionProyectoUncheckedCreateInput) {
  const existente = await prisma.revisionProyecto.findFirst({
    where: { idProyecto: data.idProyecto, numeroEnvio: data.numeroEnvio },
  });
  if (existente) return existente;
  return prisma.revisionProyecto.create({ data });
}

async function ensureMensaje(data: Prisma.MensajeRevisionProyectoUncheckedCreateInput) {
  const existente = await prisma.mensajeRevisionProyecto.findFirst({
    where: { idProyecto: data.idProyecto, idRemitente: data.idRemitente, contenido: data.contenido },
  });
  if (existente) return existente;
  return prisma.mensajeRevisionProyecto.create({ data });
}

async function main() {
  const vernel = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'vernel@uvg.edu.gt' } });
  const admin = await prisma.usuario.findFirstOrThrow({
    where: { rolesAcceso: { some: { rolAcceso: { nombrePerfil: 'administrador' } } } },
  });

  // ── BORRADOR: proyecto recién creado, aún no enviado a revisión ──────────
  // El canal de revisión (mensaje_revision_proyecto) está deshabilitado en
  // este estado, así que no se agregan mensajes ni revisiones.
  const pBorrador = await ensureProyecto({
    tituloProyecto: 'Sistema de Reservas de Salas de Estudio',
    descripcionProyecto:
      'Plataforma para reservar salas de estudio y cubículos de la biblioteca desde el celular, evitando reservas duplicadas.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'BORRADOR',
    creadoPor: vernel.idUsuario,
  });
  await ensureRol({ idProyecto: pBorrador.idProyecto, nombreRol: 'Desarrollador Backend', cupos: 2 });

  // ── EN_PROGRESO: aprobado en primer envío, equipo trabajando activamente ─
  const pEnProgreso = await ensureProyecto({
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
  await ensureRol({ idProyecto: pEnProgreso.idProyecto, nombreRol: 'Desarrollador Mobile', cupos: 2 });
  const revEnProgreso = await ensureRevision({
    idProyecto: pEnProgreso.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision:
      'Propuesta clara, con objetivos medibles y roles bien definidos. Aprobado sin observaciones en la primera revisión.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-04-28'),
    revisadaEn: new Date('2026-05-08'),
  });
  await ensureMensaje({
    idProyecto: pEnProgreso.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revEnProgreso.idRevisionProyecto,
    contenido: 'Envié el proyecto a revisión, quedo atento por si necesitan algún ajuste.',
    enviadoEn: new Date('2026-04-28T09:00:00Z'),
  });
  await ensureMensaje({
    idProyecto: pEnProgreso.idProyecto,
    idRemitente: admin.idUsuario,
    idRevision: revEnProgreso.idRevisionProyecto,
    contenido: 'Todo en orden, aprobado sin observaciones. Éxitos con la aplicación de bienestar físico.',
    enviadoEn: new Date('2026-05-08T13:00:00Z'),
    leidoEn: new Date('2026-05-08T15:00:00Z'),
  });

  // ── EN_SOLICITUD_CIERRE: aprobado y avanzado, ahora esperando cierre ────
  const pSolicitudCierre = await ensureProyecto({
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
  await ensureRol({ idProyecto: pSolicitudCierre.idProyecto, nombreRol: 'Coordinador de Tutorías', cupos: 1 });
  const revSolicitudCierre = await ensureRevision({
    idProyecto: pSolicitudCierre.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision: 'Proyecto aprobado, cumple con los lineamientos de horas beca.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-01-25'),
    revisadaEn: new Date('2026-02-10'),
  });
  await ensureMensaje({
    idProyecto: pSolicitudCierre.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revSolicitudCierre.idRevisionProyecto,
    contenido:
      'Ya completamos el semestre de tutorías y todos los tutores reportaron sus horas. Solicito el cierre del proyecto.',
    enviadoEn: new Date('2026-07-10T09:00:00Z'),
  });
  await ensureMensaje({
    idProyecto: pSolicitudCierre.idProyecto,
    idRemitente: admin.idUsuario,
    contenido: 'Recibido, estamos revisando las horas reportadas antes de aprobar el cierre.',
    enviadoEn: new Date('2026-07-11T10:00:00Z'),
    leidoEn: new Date('2026-07-11T12:00:00Z'),
  });

  // ── CERRADO: ciclo completo, proyecto finalizado y cerrado ──────────────
  const pCerrado = await ensureProyecto({
    tituloProyecto: 'Torneo Interno de Ajedrez UVG',
    descripcionProyecto: 'Organización del torneo semestral de ajedrez para estudiantes de todas las carreras.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'CERRADO',
    creadoPor: vernel.idUsuario,
    fechaInicio: new Date('2026-01-10'),
    fechaFinEstimada: new Date('2026-03-10'),
    fechaPublicacion: new Date('2026-01-15'),
  });
  await ensureRol({ idProyecto: pCerrado.idProyecto, nombreRol: 'Organizador de Logística', cupos: 2 });
  const revCerrado = await ensureRevision({
    idProyecto: pCerrado.idProyecto,
    idRevisor: admin.idUsuario,
    estadoRevision: 'APROBADA',
    comentarioRevision: 'Excelente propuesta, aprobado sin observaciones.',
    numeroEnvio: 1,
    enviadaEn: new Date('2026-01-05'),
    revisadaEn: new Date('2026-01-15'),
  });
  await ensureMensaje({
    idProyecto: pCerrado.idProyecto,
    idRemitente: vernel.idUsuario,
    idRevision: revCerrado.idRevisionProyecto,
    contenido: 'El torneo se realizó con éxito y ya entregamos el informe final de resultados.',
    enviadoEn: new Date('2026-03-12T09:00:00Z'),
  });
  await ensureMensaje({
    idProyecto: pCerrado.idProyecto,
    idRemitente: admin.idUsuario,
    contenido: 'Cierre aprobado. Ya se generaron los certificados de participación para el equipo organizador.',
    enviadoEn: new Date('2026-03-13T11:00:00Z'),
    leidoEn: new Date('2026-03-13T14:00:00Z'),
  });

  console.log(`Proyectos verificados/creados para ${vernel.correo}:`);
  console.log(`  BORRADOR            -> #${pBorrador.idProyecto} ${pBorrador.tituloProyecto}`);
  console.log(`  EN_PROGRESO         -> #${pEnProgreso.idProyecto} ${pEnProgreso.tituloProyecto}`);
  console.log(`  EN_SOLICITUD_CIERRE -> #${pSolicitudCierre.idProyecto} ${pSolicitudCierre.tituloProyecto}`);
  console.log(`  CERRADO             -> #${pCerrado.idProyecto} ${pCerrado.tituloProyecto}`);
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
