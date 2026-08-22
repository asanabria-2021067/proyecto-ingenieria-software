/**
 * Fixture dedicado y aislado para los escenarios de carga en k6/. Nunca se
 * mezcla con el namespace `s6.*` de seed-demo.ts ni con datos reales: usa su
 * propio namespace `k6.*@uvg.edu.gt` con credenciales fijas y conocidas
 * (entorno de TESTING local, nunca producción).
 *
 * A diferencia del resto de seeds (que nunca reactivan estado histórico),
 * este script SÍ resetea el Sprint a ACTIVO en cada corrida: es la única
 * forma de que kanban-operations.js y socket-io.js (modo trigger) tengan
 * siempre, sin intervención manual, un Sprint ACTIVO disponible para
 * escribir contra él. Es seguro porque el Sprint es 100% propiedad de este
 * fixture (número fijo, proyecto propio) — nunca toca Sprints ajenos.
 *
 * No pensado para invocarse a mano: k6/run.js lo ejecuta como subproceso
 * antes de cada `k6 run` y lee de stdout la única línea JSON que imprime con
 * los ids reales (Postgres los asigna, nunca se fijan a mano).
 *
 * Uso manual (debug):
 *   DATABASE_URL="..." npx tsx prisma/seed-k6-fixture.ts
 */
import { hashSync } from 'bcryptjs';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PASSWORD = 'K6demo1234!';
const PASSWORD_HASH = hashSync(PASSWORD, 10);

const LIDER_EMAIL = 'k6.lider@uvg.edu.gt';
const LISTENER_EMAIL = 'k6.listener@uvg.edu.gt';
const PROJECT_TITLE = 'Escenario k6 — Fixture Automatizado';
const ROL_NAME = 'Fixture k6';

async function ensureUsuario(correo: string, nombre: string, apellido: string) {
  return prisma.usuario.upsert({
    where: { correo },
    update: { estado: 'ACTIVO' },
    create: { correo, contrasena: PASSWORD_HASH, nombre, apellido, estado: 'ACTIVO' },
  });
}

async function ensureParticipacionActiva(idUsuario: number, idRolProyecto: number) {
  const activa = await prisma.participacionProyecto.findFirst({
    where: { idUsuario, idRolProyecto, estadoParticipacion: EstadoParticipacion.ACTIVO },
  });
  if (activa) return activa;
  const existente = await prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto } });
  if (existente) {
    return prisma.participacionProyecto.update({
      where: { idParticipacion: existente.idParticipacion },
      data: { estadoParticipacion: EstadoParticipacion.ACTIVO, fechaSalida: null },
    });
  }
  return prisma.participacionProyecto.create({
    data: { idUsuario, idRolProyecto, estadoParticipacion: EstadoParticipacion.ACTIVO, fechaIngreso: new Date() },
  });
}

async function main() {
  const lider = await ensureUsuario(LIDER_EMAIL, 'K6', 'Lider');
  const listener = await ensureUsuario(LISTENER_EMAIL, 'K6', 'Listener');

  const proyectoExistente = await prisma.proyecto.findFirst({
    where: { tituloProyecto: PROJECT_TITLE, creadoPor: lider.idUsuario },
  });
  const proyecto =
    proyectoExistente ??
    (await prisma.proyecto.create({
      data: {
        tituloProyecto: PROJECT_TITLE,
        creadoPor: lider.idUsuario,
        descripcionProyecto: 'Proyecto fijo para las pruebas de carga k6 (k6/scenarios/*). No usar en producción.',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA',
        estadoProyecto: EstadoProyecto.EN_PROGRESO,
        modalidadProyecto: 'VIRTUAL',
        fechaInicio: new Date(),
      },
    }));

  const rolExistente = await prisma.rolProyecto.findFirst({ where: { idProyecto: proyecto.idProyecto, nombreRol: ROL_NAME } });
  const rol = rolExistente ?? (await prisma.rolProyecto.create({ data: { idProyecto: proyecto.idProyecto, nombreRol: ROL_NAME, cupos: 5 } }));

  await ensureParticipacionActiva(lider.idUsuario, rol.idRolProyecto);
  await ensureParticipacionActiva(listener.idUsuario, rol.idRolProyecto);

  // Sprint fijo #1: se resetea a ACTIVO en cada corrida. Las tareas que
  // kanban-operations.js va creando quedan siempre HECHO (marcarComoHecha),
  // así que nunca bloquean finalizeSprint ("0 tareas no-HECHO") aunque se
  // acumulen entre corridas.
  const sprintExistente = await prisma.sprint.findFirst({ where: { idProyecto: proyecto.idProyecto, numero: 1 } });
  const sprint = sprintExistente
    ? await prisma.sprint.update({
        where: { idSprint: sprintExistente.idSprint },
        data: {
          estado: EstadoSprint.ACTIVO,
          fechaFinalizacionIniciada: null,
          fechaCierre: null,
          cerradoPor: null,
        },
      })
    : await prisma.sprint.create({
        data: { idProyecto: proyecto.idProyecto, numero: 1, estado: EstadoSprint.ACTIVO, fechaInicio: new Date() },
      });

  // Única línea de stdout: k6/run.js la parsea como JSON. Cualquier otro log
  // de este script debe ir a stderr (console.error), nunca a stdout.
  console.log(
    JSON.stringify({
      email: LIDER_EMAIL,
      password: PASSWORD,
      listenerEmail: LISTENER_EMAIL,
      listenerPassword: PASSWORD,
      projectId: proyecto.idProyecto,
      sprintId: sprint.idSprint,
      userId: lider.idUsuario,
    }),
  );
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
