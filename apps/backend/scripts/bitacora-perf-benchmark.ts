/**
 * T-244 — medición de rendimiento de la consulta paginada de bitácora
 * (`BitacoraConsultaService.listEventos`) con un volumen realista.
 *
 * No es un endpoint público ni corre en CI: es una herramienta manual, de
 * un solo uso, para dejar evidencia real (no inventada) del efecto de los
 * índices candidatos sobre la consulta ya filtrada/paginada en BD. Reutiliza
 * PrismaClient directo (mismo criterio que `scripts/sprint7-legacy.ts`) en
 * vez de levantar todo Nest, porque lo que se mide es exactamente el
 * `where`/`orderBy`/`skip`/`take` que arma `bitacora-consulta.service.ts`,
 * no el ciclo HTTP completo (para eso ya existe `k6/`).
 *
 * Escenario: `bitacora_auditoria` es una tabla GLOBAL (todos los proyectos
 * comparten la misma tabla física); un proyecto puntual solo tiene "cientos"
 * de eventos, pero el total del sistema (muchos proyectos) puede ser mucho
 * mayor. Por eso se siembra un proyecto objetivo con un volumen modesto
 * dentro de una tabla grande poblada por muchos otros proyectos, en vez de
 * medir sobre una tabla donde el proyecto objetivo es la mayoría de las filas.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/bitacora-perf-benchmark.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

const prisma = new PrismaClient();

const FILAS_PROYECTO_OBJETIVO = Number(process.env.BENCH_FILAS_OBJETIVO ?? 600);
const CANTIDAD_OTROS_PROYECTOS = Number(process.env.BENCH_OTROS_PROYECTOS ?? 150);
const FILAS_POR_OTRO_PROYECTO = Number(process.env.BENCH_FILAS_POR_OTRO_PROYECTO ?? 500);
const ITERACIONES_POR_ESCENARIO = 30;

const TIPOS = TipoEventoBitacora.VALORES;

function randomFecha(diasAtras: number): Date {
  const ahora = Date.now();
  const offsetMs = Math.floor(Math.random() * diasAtras * 24 * 60 * 60 * 1000);
  return new Date(ahora - offsetMs);
}

async function insertarLotes(filas: Prisma.BitacoraAuditoriaCreateManyInput[]) {
  // Postgres tiene un límite de ~65535 parámetros por statement; con 6
  // columnas por fila, se inserta en lotes de 5000 (30000 params) para
  // soportar volúmenes grandes sin tocar el límite.
  const TAMANO_LOTE = 5000;
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    await prisma.bitacoraAuditoria.createMany({ data: filas.slice(i, i + TAMANO_LOTE) });
  }
}

async function seed() {
  const correoLider = 'perf-bitacora-lider@bench.local';
  const lider = await prisma.usuario.upsert({
    where: { correo: correoLider },
    update: {},
    create: { correo: correoLider, contrasena: 'x', nombre: 'Bench', apellido: 'Lider' },
  });

  const actores = [];
  for (let i = 0; i < 8; i++) {
    const correo = `perf-bitacora-actor-${i}@bench.local`;
    const actor = await prisma.usuario.upsert({
      where: { correo },
      update: {},
      create: { correo, contrasena: 'x', nombre: `Actor${i}`, apellido: `Apellido${i}` },
    });
    actores.push(actor);
  }

  const proyectoObjetivo = await prisma.proyecto.create({
    data: {
      tituloProyecto: 'Bench bitácora — proyecto objetivo',
      descripcionProyecto: 'Seed de benchmark T-244, no es dato real',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'EN_PROGRESO',
      creadoPor: lider.idUsuario,
    },
  });

  const otrosProyectosData: Prisma.ProyectoCreateManyInput[] = Array.from(
    { length: CANTIDAD_OTROS_PROYECTOS },
    (_, i) => ({
      tituloProyecto: `Bench bitácora — otro proyecto ${i}`,
      descripcionProyecto: 'Seed de benchmark T-244, no es dato real',
      tipoProyecto: 'ACADEMICO_HORAS_BECA' as const,
      estadoProyecto: 'EN_PROGRESO' as const,
      creadoPor: lider.idUsuario,
    }),
  );
  await prisma.proyecto.createMany({ data: otrosProyectosData });
  const otrosProyectos = await prisma.proyecto.findMany({
    where: { tituloProyecto: { startsWith: 'Bench bitácora — otro proyecto ' } },
    select: { idProyecto: true },
  });

  const filas: Prisma.BitacoraAuditoriaCreateManyInput[] = [];
  for (let i = 0; i < FILAS_PROYECTO_OBJETIVO; i++) {
    const actor = actores[i % actores.length];
    filas.push({
      idUsuario: actor.idUsuario,
      accion: TIPOS[i % TIPOS.length],
      tipoObjeto: 'TAREA',
      idObjeto: String(1000 + i),
      detalleJson: {
        idProyecto: proyectoObjetivo.idProyecto,
        idSprint: (i % 5) + 1,
        valorAnterior: null,
        valorNuevo: { seed: true, i },
      },
      fechaEvento: randomFecha(120),
    });
  }
  for (const otro of otrosProyectos) {
    for (let i = 0; i < FILAS_POR_OTRO_PROYECTO; i++) {
      const actor = actores[i % actores.length];
      filas.push({
        idUsuario: actor.idUsuario,
        accion: TIPOS[i % TIPOS.length],
        tipoObjeto: 'TAREA',
        idObjeto: String(9000 + i),
        detalleJson: { idProyecto: otro.idProyecto, idSprint: null, valorAnterior: null, valorNuevo: null },
        fechaEvento: randomFecha(120),
      });
    }
  }

  await insertarLotes(filas);

  return { proyectoObjetivo, totalFilas: filas.length };
}

/** Réplica exacta del query de BitacoraConsultaService.listEventos para page=5,limit=20,tipoEvento+rango de fechas. */
async function ejecutarQueryRepresentativa(idProyecto: number) {
  const tiposVisibles = TipoEventoBitacora.VALORES;
  const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const hasta = new Date();

  const andConditions: Prisma.BitacoraAuditoriaWhereInput[] = [
    { accion: { in: [...tiposVisibles] } },
    { detalleJson: { path: ['idProyecto'], equals: idProyecto } },
    { fechaEvento: { gte: desde } },
    { fechaEvento: { lte: hasta } },
  ];
  const where: Prisma.BitacoraAuditoriaWhereInput = { AND: andConditions };

  const [rows, total] = await Promise.all([
    prisma.bitacoraAuditoria.findMany({
      where,
      orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
      take: 20,
      skip: 20, // página 2 (el proyecto objetivo ya no tiene tantas páginas como en el escenario anterior)
      include: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } },
    }),
    prisma.bitacoraAuditoria.count({ where }),
  ]);
  return { rows, total };
}

async function medir(idProyecto: number, etiqueta: string) {
  // Descarta la primera ejecución (cache de planificador/buffers) y mide el resto.
  await ejecutarQueryRepresentativa(idProyecto);

  const tiempos: number[] = [];
  for (let i = 0; i < ITERACIONES_POR_ESCENARIO; i++) {
    const inicio = performance.now();
    await ejecutarQueryRepresentativa(idProyecto);
    tiempos.push(performance.now() - inicio);
  }
  tiempos.sort((a, b) => a - b);
  const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const p95 = tiempos[Math.floor(tiempos.length * 0.95)];
  console.log(
    `[${etiqueta}] n=${tiempos.length} promedio=${promedio.toFixed(2)}ms p95=${p95.toFixed(2)}ms min=${tiempos[0].toFixed(2)}ms max=${tiempos[tiempos.length - 1].toFixed(2)}ms`,
  );
  return { promedio, p95 };
}

/** Mismo predicado que Prisma genera para `detalleJson: { path: ['idProyecto'], equals }` — ver comentario sobre el índice. */
async function explainRepresentativa(idProyecto: number) {
  const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const tiposVisibles = TIPOS.map((t) => `'${t}'`).join(',');
  const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN ANALYZE
     SELECT id_auditoria FROM bitacora_auditoria
     WHERE accion IN (${tiposVisibles})
       AND (detalle_json #> ARRAY['idProyecto']::text[])::jsonb = '${idProyecto}'
       AND fecha_evento >= '${desde}'
       AND fecha_evento <= now()
     ORDER BY fecha_evento DESC, id_auditoria DESC
     LIMIT 20 OFFSET 20`,
  );
  console.log(plan.map((r) => r['QUERY PLAN']).join('\n'));
}

async function main() {
  console.log(
    `Sembrando proyecto objetivo (${FILAS_PROYECTO_OBJETIVO} filas) + ${CANTIDAD_OTROS_PROYECTOS} proyectos con ${FILAS_POR_OTRO_PROYECTO} filas c/u...`,
  );
  const { proyectoObjetivo, totalFilas } = await seed();
  console.log(`Total sembrado: ${totalFilas} filas de bitacora_auditoria.`);

  console.log('\n--- ANTES (sin índice dedicado en bitacora_auditoria) ---');
  await medir(proyectoObjetivo.idProyecto, 'antes');
  console.log('\nPlan de ejecución ANTES:');
  await explainRepresentativa(proyectoObjetivo.idProyecto);

  console.log('\nCreando índice funcional sobre detalle_json#>{idProyecto} (+ fecha_evento/id_auditoria)...');
  // La expresión debe calcar EXACTAMENTE lo que genera Prisma para
  // `detalleJson: { path: ['idProyecto'], equals }` — confirmado con
  // `prisma.$on('query', ...)`: `(detalle_json #> ARRAY['idProyecto']::text[])::jsonb`,
  // no `detalle_json->>'idProyecto'` (que es lo primero que se probó y no
  // se usaba: el índice no calzaba con la expresión real de la query).
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS bitacora_auditoria_id_proyecto_fecha_idx
     ON bitacora_auditoria ((detalle_json #> '{idProyecto}'), fecha_evento DESC, id_auditoria DESC)`,
  );

  console.log('\n--- DESPUÉS (con índice funcional idProyecto+fecha+id) ---');
  await medir(proyectoObjetivo.idProyecto, 'después');
  console.log('\nPlan de ejecución DESPUÉS:');
  await explainRepresentativa(proyectoObjetivo.idProyecto);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
