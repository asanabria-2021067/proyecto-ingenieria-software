import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';
import { CreateEventDto } from '../src/events/dto/create-event.dto';
import { UpdateEventDto } from '../src/events/dto/update-event.dto';
import { GetEventsRangeQueryDto, MAX_DIAS_RANGO_EVENTOS } from '../src/events/dto/get-events-range-query.dto';

/**
 * G05-C04 (UI-15, UI-20, UI-24): fronteras de los DTO de eventos pasando por
 * el ValidationPipe REAL de main.ts (whitelist + forbidNonWhitelisted +
 * transform), que es lo que decide el 400 en producción; no se llaman
 * funciones internas de los DTO.
 */
// Mismas opciones de validación que main.ts. La única diferencia es `exceptionFactory`, que no cambia qué
// se acepta o rechaza: solo adjunta al 400 los nombres de los campos (los mensajes en español no siempre
// empiezan por el nombre del campo, así que no se pueden deducir del texto).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errores: ValidationError[]) => new BadRequestException({ message: 'Bad Request', campos: errores.map((e) => e.property) }),
});
const cuerpo = <T>(metatype: new () => T, valor: unknown) => pipe.transform(valor, { type: 'body', metatype }) as Promise<T>;
const consulta = (valor: unknown) => pipe.transform(valor, { type: 'query', metatype: GetEventsRangeQueryDto }) as Promise<GetEventsRangeQueryDto>;

/** Campos que el pipe rechazó con 400. */
async function camposRechazados(promesa: Promise<unknown>): Promise<string[]> {
  try {
    await promesa;
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    const { campos } = (error as BadRequestException).getResponse() as { campos: string[] };
    return [...new Set(campos)].sort();
  }
}

const VIRTUAL = { tituloEvento: 'Reunión', fechaInicio: '2030-10-01T14:00:00.000Z', fechaFin: '2030-10-01T15:00:00.000Z', modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij' };
const PRESENCIAL = { tituloEvento: 'Taller', fechaInicio: '2030-10-01T14:00:00.000Z', fechaFin: '2030-10-01T15:00:00.000Z', modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5 };
const MIXTA = { ...PRESENCIAL, modalidad: 'MIXTA', linkSesion: VIRTUAL.linkSesion };

// Matriz compartida de G05-C04: es la MISMA lista en apps/backend/test/events.dto.spec.ts y en
// apps/frontend/test/event-form-schema.spec.ts. Cada caso cambia un solo campo de un evento válido
// (virtual o presencial) y dice si formulario y API deben aceptarlo. `texto: n` es una cadena de n letras.
type CasoLimite = { caso: string; campo: string; valor?: unknown; texto?: number; base?: 'VIRTUAL' | 'PRESENCIAL'; acepta: boolean };
const LIMITES_COMPARTIDOS: CasoLimite[] = [
  { caso: 'título de 1 carácter', campo: 'tituloEvento', texto: 1, acepta: true },
  { caso: 'título de 200 caracteres', campo: 'tituloEvento', texto: 200, acepta: true },
  { caso: 'título de 201 caracteres', campo: 'tituloEvento', texto: 201, acepta: false },
  { caso: 'título vacío', campo: 'tituloEvento', valor: '', acepta: false },
  { caso: 'título solo con espacios', campo: 'tituloEvento', valor: '    ', acepta: false },
  { caso: 'descripción de 5000 caracteres', campo: 'descripcionEvento', texto: 5000, acepta: true },
  { caso: 'descripción de 5001 caracteres', campo: 'descripcionEvento', texto: 5001, acepta: false },
  { caso: 'nombre de lugar de 255 caracteres', campo: 'ubicacionNombre', texto: 255, base: 'PRESENCIAL', acepta: true },
  { caso: 'nombre de lugar de 256 caracteres', campo: 'ubicacionNombre', texto: 256, base: 'PRESENCIAL', acepta: false },
  { caso: 'recordatorio 0 minutos', campo: 'antelacionMinutos', valor: 0, acepta: true },
  { caso: 'recordatorio 10080 minutos (7 días)', campo: 'antelacionMinutos', valor: 10080, acepta: true },
  { caso: 'recordatorio 10081 minutos', campo: 'antelacionMinutos', valor: 10081, acepta: false },
  { caso: 'recordatorio negativo', campo: 'antelacionMinutos', valor: -1, acepta: false },
  { caso: 'recordatorio con decimales', campo: 'antelacionMinutos', valor: 30.5, acepta: false },
  { caso: 'tipo TUTORIA', campo: 'tipoEvento', valor: 'TUTORIA', acepta: true },
  { caso: 'tipo REUNION', campo: 'tipoEvento', valor: 'REUNION', acepta: true },
  { caso: 'tipo ENTREGA', campo: 'tipoEvento', valor: 'ENTREGA', acepta: true },
  { caso: 'tipo REVISION', campo: 'tipoEvento', valor: 'REVISION', acepta: true },
  { caso: 'tipo TALLER', campo: 'tipoEvento', valor: 'TALLER', acepta: true },
  { caso: 'tipo OTRO', campo: 'tipoEvento', valor: 'OTRO', acepta: true },
  { caso: 'tipo inexistente', campo: 'tipoEvento', valor: 'FIESTA', acepta: false },
  { caso: 'tipo en minúsculas', campo: 'tipoEvento', valor: 'tutoria', acepta: false },
  { caso: 'modalidad inexistente', campo: 'modalidad', valor: 'HIBRIDA', acepta: false },
  { caso: 'enlace de 500 caracteres', campo: 'linkSesion', valor: `https://ejemplo.com/${'a'.repeat(480)}`, acepta: true },
  { caso: 'enlace de 501 caracteres', campo: 'linkSesion', valor: `https://ejemplo.com/${'a'.repeat(481)}`, acepta: false },
  { caso: 'enlace vacío en evento virtual', campo: 'linkSesion', valor: '', acepta: false },
  { caso: 'enlace javascript:', campo: 'linkSesion', valor: 'javascript:alert(1)', acepta: false },
  { caso: 'enlace sin dominio real', campo: 'linkSesion', valor: 'http://localhost:3000/sala', acepta: false },
  { caso: 'presencial sin coordenadas', campo: 'ubicacionLat', valor: null, base: 'PRESENCIAL', acepta: false },
  { caso: 'presencial con enlace inválido (no se usa)', campo: 'linkSesion', valor: 'no es un enlace', base: 'PRESENCIAL', acepta: true },
];
const valorDe = (c: CasoLimite) => (c.texto !== undefined ? 'a'.repeat(c.texto) : c.valor);

describe('CreateEventDto y UpdateEventDto — matriz de límites compartida con el formulario (G05-C04)', () => {
  it.each(LIMITES_COMPARTIDOS)('$caso → acepta: $acepta', async (c) => {
    const plano = { ...(c.base === 'PRESENCIAL' ? PRESENCIAL : VIRTUAL), [c.campo]: valorDe(c) };
    // El formulario envía `undefined`, nunca `null`, cuando no hay coordenadas.
    if (plano[c.campo as keyof typeof plano] === null) delete (plano as Record<string, unknown>)[c.campo];
    for (const Dto of [CreateEventDto, UpdateEventDto]) {
      const rechazados = await camposRechazados(cuerpo(Dto as new () => unknown, plano));
      if (c.acepta) expect(rechazados, Dto.name).toEqual([]);
      else expect(rechazados, Dto.name).toContain(c.campo);
    }
  });

  it('la matriz cubre todos los campos con límite de texto, número o lista cerrada que el formulario puede enviar', () => {
    expect([...new Set(LIMITES_COMPARTIDOS.map((c) => c.campo))].sort()).toEqual(
      ['antelacionMinutos', 'descripcionEvento', 'linkSesion', 'modalidad', 'tipoEvento', 'tituloEvento', 'ubicacionLat', 'ubicacionNombre'],
    );
  });
});

describe('CreateEventDto — reglas por modalidad con el ValidationPipe real (G05-C04)', () => {
  it.each([
    ['VIRTUAL sin enlace', { ...VIRTUAL, linkSesion: undefined }, ['linkSesion']],
    ['MIXTA sin enlace', { ...MIXTA, linkSesion: undefined }, ['linkSesion']],
    ['MIXTA sin coordenadas', { ...MIXTA, ubicacionLat: undefined, ubicacionLng: undefined }, ['ubicacionLat', 'ubicacionLng']],
    ['PRESENCIAL solo con latitud', { ...PRESENCIAL, ubicacionLng: undefined }, ['ubicacionLng']],
    ['PRESENCIAL con coordenadas como texto', { ...PRESENCIAL, ubicacionLat: '14.6', ubicacionLng: '-90.5' }, ['ubicacionLat', 'ubicacionLng']],
    ['PRESENCIAL con NaN', { ...PRESENCIAL, ubicacionLat: Number.NaN }, ['ubicacionLat']],
  ])('%s → 400 en %j', async (_caso, plano, esperados) => {
    expect(await camposRechazados(cuerpo(CreateEventDto, plano))).toEqual(esperados);
  });

  it.each([
    ['latitud', 'ubicacionLat', 90, true],
    ['latitud', 'ubicacionLat', -90, true],
    ['latitud', 'ubicacionLat', 90.000001, false],
    ['latitud', 'ubicacionLat', -90.000001, false],
    ['longitud', 'ubicacionLng', 180, true],
    ['longitud', 'ubicacionLng', -180, true],
    ['longitud', 'ubicacionLng', 180.000001, false],
    ['longitud', 'ubicacionLng', -180.000001, false],
  ] as const)('%s %s = %d → acepta: %s', async (_nombre, campo, valor, acepta) => {
    const rechazados = await camposRechazados(cuerpo(CreateEventDto, { ...PRESENCIAL, [campo]: valor }));
    expect(rechazados).toEqual(acepta ? [] : [campo]);
  });

  it('las tres modalidades completas pasan y el DTO sale recortado y tipado', async () => {
    for (const plano of [VIRTUAL, PRESENCIAL, MIXTA]) expect(await camposRechazados(cuerpo(CreateEventDto, plano))).toEqual([]);
    const dto = await cuerpo(CreateEventDto, { ...MIXTA, tituloEvento: '  Demo  ', linkSesion: `  ${VIRTUAL.linkSesion}  `, ubicacionNombre: '  Edificio CIT  ', descripcionEvento: '  nota  ' });
    expect(dto).toBeInstanceOf(CreateEventDto);
    expect(dto).toMatchObject({ tituloEvento: 'Demo', linkSesion: VIRTUAL.linkSesion, ubicacionNombre: 'Edificio CIT', descripcionEvento: 'nota' });
  });

  it('un evento virtual ignora coordenadas absurdas porque esa modalidad no las usa, pero el nombre del lugar conserva su tope', async () => {
    expect(await camposRechazados(cuerpo(CreateEventDto, { ...VIRTUAL, ubicacionLat: 999, ubicacionLng: 999 }))).toEqual([]);
    expect(await camposRechazados(cuerpo(CreateEventDto, { ...VIRTUAL, ubicacionNombre: 'a'.repeat(256) }))).toEqual(['ubicacionNombre']);
  });
});

describe('CreateEventDto — invitados, fechas y campos no declarados (G05-C04)', () => {
  const con = (extra: Record<string, unknown>) => camposRechazados(cuerpo(CreateEventDto, { ...VIRTUAL, ...extra }));

  it('invitados: hasta 200 enteros; 201, no enteros o algo que no sea lista responden 400', async () => {
    const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(await con({ invitados: [] })).toEqual([]);
    expect(await con({ invitados: lista(200) })).toEqual([]);
    expect(await con({ invitados: lista(201) })).toEqual(['invitados']);
    for (const invitados of [[1, '2'], [1.5], [null], '1,2', 7, { 0: 1 }]) expect(await con({ invitados })).toEqual(['invitados']);
  });

  it('rolesDestino sigue siendo una lista de enteros (deuda UI-23: se valida y se guarda, nada lo aplica)', async () => {
    expect(await con({ rolesDestino: [3, 4] })).toEqual([]);
    for (const rolesDestino of [['3'], 3, [1.2]]) expect(await con({ rolesDestino })).toEqual(['rolesDestino']);
  });

  it.each(['ayer', '2030-13-01T00:00:00.000Z', '01/10/2030', '', 1_900_000_000_000, null])('fechaInicio y fechaFin deben ser ISO 8601: %j responde 400', async (fecha) => {
    expect(await con({ fechaInicio: fecha })).toEqual(['fechaInicio']);
    expect(await con({ fechaFin: fecha })).toEqual(['fechaFin']);
  });

  it.each(['idEvento', 'idProyecto', 'idCreador', 'recordatorioEnviadoEn', 'canceladoEn', 'creadoEn', '__proto__x'])(
    'un campo no declarado ("%s") responde 400: el cliente no elige creador, proyecto ni estado del recordatorio',
    async (campo) => {
      expect(await con({ [campo]: 1 })).toEqual([campo]);
      expect(await camposRechazados(cuerpo(UpdateEventDto, { tituloEvento: 'x', [campo]: 1 }))).toEqual([campo]);
    },
  );

  it('faltan los obligatorios: sin título ni fechas no hay evento', async () => {
    expect(await camposRechazados(cuerpo(CreateEventDto, {}))).toEqual(['fechaFin', 'fechaInicio', 'tituloEvento']);
    // En la edición todo es opcional: un cuerpo vacío es válido y no cambia nada.
    expect(await camposRechazados(cuerpo(UpdateEventDto, {}))).toEqual([]);
  });
});

describe('GetEventsRangeQueryDto — rango de la consulta con el ValidationPipe real (G05-C04, UI-20)', () => {
  const DIA = 86_400_000;
  const desde = '2026-09-28T06:00:00.000Z';
  const hastaEn = (ms: number) => new Date(Date.parse(desde) + ms).toISOString();

  it.each([
    ['un día (vista Día)', DIA, true],
    ['una semana (vista Semana)', 7 * DIA, true],
    ['seis semanas (vista Mes: 42 días)', 42 * DIA, true],
    [`${MAX_DIAS_RANGO_EVENTOS} días exactos`, MAX_DIAS_RANGO_EVENTOS * DIA, true],
    [`${MAX_DIAS_RANGO_EVENTOS} días y 1 ms`, MAX_DIAS_RANGO_EVENTOS * DIA + 1, false],
    ['un año', 365 * DIA, false],
    ['rango vacío (hasta = desde)', 0, true],
    ['invertido', -DIA, false],
  ] as const)('%s → acepta: %s', async (_caso, ms, acepta) => {
    expect(await camposRechazados(consulta({ desde, hasta: hastaEn(ms) }))).toEqual(acepta ? [] : ['hasta']);
  });

  it('las tres vistas del calendario caben holgadamente en el tope y la consulta llega como DTO', async () => {
    expect(42).toBeLessThanOrEqual(MAX_DIAS_RANGO_EVENTOS);
    const dto = await consulta({ desde, hasta: hastaEn(42 * DIA) });
    expect(dto).toBeInstanceOf(GetEventsRangeQueryDto);
    expect(dto.desde).toBe(desde);
  });

  it('faltan parámetros, no son fechas, vienen repetidos o sobran: 400', async () => {
    expect(await camposRechazados(consulta({}))).toEqual(['desde', 'hasta']);
    expect(await camposRechazados(consulta({ desde }))).toEqual(['hasta']);
    expect(await camposRechazados(consulta({ desde: 'ayer', hasta: 'mañana' }))).toEqual(['desde', 'hasta']);
    expect(await camposRechazados(consulta({ desde: [desde, desde], hasta: hastaEn(DIA) }))).toEqual(['desde']);
    expect(await camposRechazados(consulta({ desde, hasta: hastaEn(DIA), idUsuario: '9' }))).toEqual(['idUsuario']);
    expect(await camposRechazados(consulta({ desde, hasta: hastaEn(DIA), limite: '100000' }))).toEqual(['limite']);
  });
});
