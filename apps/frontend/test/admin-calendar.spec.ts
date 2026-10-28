import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));

import { getAdminMeetingsInRange, getAllAdminMeetings } from '../lib/services/admin-meetings';
import {
  agruparEntradasPorDia,
  contarReuniones,
  contarReunionesEnDias,
  describirHorarioReunion,
  etiquetaProyectosReunion,
  reunionToAgendaItems,
  searchReuniones,
  separarReunionesVisibles,
  sprintToAgendaItem,
  type ReunionVisible,
} from '../lib/admin/admin-calendar';
import type { AdminMeeting } from '../lib/types/admin-meetings';
import type { AdminSprintCalendarItem } from '../lib/types/admin-sprints';

/** Instante ISO de una hora LOCAL: los tests no dependen del huso de la máquina. */
const local = (d: number, h: number, m = 0, mes = 9) => new Date(2026, mes, d, h, m).toISOString();

function reunion(idReunion: number, overrides: Partial<AdminMeeting> = {}): AdminMeeting {
  return {
    idReunion,
    estado: 'ACTIVA',
    integridad: 'OK',
    contenido: {
      tituloEvento: `Reunión ${idReunion}`,
      descripcionEvento: null,
      fechaInicio: local(8, 9),
      fechaFin: local(8, 10, 30),
      modalidad: 'VIRTUAL',
      ubicacionNombre: null,
    },
    proyectos: [{ idProyecto: 10, idEvento: 100, tituloProyecto: 'Huerto Comunitario', estadoProyecto: 'EN_PROGRESO' }],
    creador: { idUsuario: 1, nombre: 'Ana', apellido: 'López' },
    ...overrides,
  };
}

function sprint(idSprint: number, fechaFinPlaneada: string): AdminSprintCalendarItem {
  return {
    idSprint,
    numero: 2,
    estado: 'ACTIVO',
    idProyecto: idSprint,
    tituloProyecto: `Proyecto ${idSprint}`,
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    fechaInicio: '2026-09-01T15:00:00.000Z',
    fechaFinPlaneada,
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    situacion: 'EN_CURSO',
    diasRestantes: 3,
    desviacionDias: null,
  };
}

const DESDE = new Date(2026, 9, 1);
const HASTA = new Date(2026, 10, 1);

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('servicio de reuniones de Administración (solo lectura)', () => {
  it('recorre todas las páginas del contrato con el máximo de 50 y el rango pedido', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: [reunion(1)], total: 2, page: 1, totalPages: 2 })
      .mockResolvedValueOnce({ data: [reunion(2)], total: 2, page: 2, totalPages: 2 });

    const resultado = await getAllAdminMeetings('activas', { desde: DESDE, hasta: HASTA });

    expect(resultado.reuniones.map((r) => r.idReunion)).toEqual([1, 2]);
    expect(resultado.completo).toBe(true);
    const url = new URL(`http://x${apiFetchMock.mock.calls[1][0]}`);
    expect(url.pathname).toBe('/admin/reuniones');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      estado: 'activas',
      page: '2',
      limit: '50',
      desde: DESDE.toISOString(),
      hasta: HASTA.toISOString(),
    });
    // Solo GET: ninguna llamada lleva método ni cuerpo.
    for (const llamada of apiFetchMock.mock.calls) expect(llamada[1]).toBeUndefined();
  });

  it('sin reuniones hace una sola petición', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: [], total: 0, page: 1, totalPages: 0 });
    expect(await getAllAdminMeetings('activas')).toEqual({ reuniones: [], completo: true });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('un rango pide activas y pasadas (nunca canceladas) y deja una sola copia de cada reunión', async () => {
    apiFetchMock.mockImplementation(async (ruta: string) =>
      ruta.includes('estado=activas')
        ? { data: [reunion(1), reunion(2)], total: 2, page: 1, totalPages: 1 }
        : { data: [reunion(2), reunion(3)], total: 2, page: 1, totalPages: 1 },
    );

    const { reuniones, completo } = await getAdminMeetingsInRange(DESDE, HASTA);

    expect(reuniones.map((r) => r.idReunion).sort()).toEqual([1, 2, 3]);
    expect(completo).toBe(true);
    const estados = apiFetchMock.mock.calls.map(([ruta]) => new URL(`http://x${ruta}`).searchParams.get('estado'));
    expect(estados.sort()).toEqual(['activas', 'pasadas']);
  });

  it('si el total supera el tope de páginas, el resultado se marca incompleto', async () => {
    apiFetchMock.mockImplementation(async (ruta: string) => {
      const page = Number(new URL(`http://x${ruta}`).searchParams.get('page'));
      return { data: [reunion(page)], total: 5000, page, totalPages: 100 };
    });
    const { reuniones, completo } = await getAllAdminMeetings('activas');
    expect(reuniones).toHaveLength(20);
    expect(completo).toBe(false);
  });
});

describe('normalización de reuniones y finalizaciones', () => {
  it('excluye canceladas y separa las de contenido inconsistente sin inventarles horario', () => {
    const { visibles, inconsistentes } = separarReunionesVisibles([
      reunion(1),
      reunion(2, { estado: 'CANCELADA' }),
      reunion(3, { integridad: 'INCONSISTENTE', contenido: null }),
    ]);
    expect(visibles.map((r) => r.idReunion)).toEqual([1]);
    expect(inconsistentes).toBe(1);
  });

  it('una reunión es un evento de tipo Reunión con su hora real, no navegable y con el id de la reunión', () => {
    const [tramo] = reunionToAgendaItems(reunion(7) as ReunionVisible, DESDE, HASTA);
    expect(tramo).toMatchObject({
      kind: 'evento',
      id: 7,
      key: '2026-10-08',
      tipo: 'REUNION',
      horaInicio: '09:00',
      horaFin: '10:30',
      multiDia: false,
      href: '',
      projectTitle: 'Huerto Comunitario',
    });
  });

  it('una reunión que cruza medianoche se parte en dos tramos por fecha real', () => {
    const nocturna = reunion(8, {
      contenido: { ...reunion(8).contenido!, fechaInicio: local(8, 23), fechaFin: local(9, 1) },
    }) as ReunionVisible;
    const tramos = reunionToAgendaItems(nocturna, DESDE, HASTA);
    expect(tramos.map((t) => [t.key, t.horaInicio, t.horaFin])).toEqual([
      ['2026-10-08', '23:00', '00:00'],
      ['2026-10-09', '00:00', '01:00'],
    ]);
    expect(describirHorarioReunion(nocturna.contenido)).toBe('23:00 – 01:00 (termina el 9 oct 2026)');
    expect(describirHorarioReunion(reunion(1).contenido!)).toBe('09:00 – 10:30');
  });

  it('la finalización de un Sprint es de todo el día y conserva su fecha de calendario', () => {
    expect(sprintToAgendaItem({ ...sprint(4, '2026-10-04'), fechaFinPlaneada: '2026-10-04' })).toMatchObject({
      kind: 'tarea',
      key: '2026-10-04',
      id: 4,
      href: '/dashboard/admin/proyectos/4',
    });
  });

  it('agrupa por día: finalizaciones primero y reuniones por hora; una reunión de varios días cuenta una vez', () => {
    const temprano = reunion(2, { contenido: { ...reunion(2).contenido!, fechaInicio: local(8, 8), fechaFin: local(8, 8, 30) } });
    const larga = reunion(3, { contenido: { ...reunion(3).contenido!, fechaInicio: local(8, 0), fechaFin: local(10, 0) } });
    const porDia = agruparEntradasPorDia(
      new Map([['2026-10-08', [sprint(1, '2026-10-08')]]]),
      [reunion(1), temprano, larga] as ReunionVisible[],
      DESDE,
      HASTA,
    );

    const delDia = porDia.get('2026-10-08')!;
    expect(delDia.map((e) => e.origen)).toEqual([
      'SPRINT_FINALIZACION',
      'REUNION_ADMINISTRATIVA',
      'REUNION_ADMINISTRATIVA',
      'REUNION_ADMINISTRATIVA',
    ]);
    expect(delDia.slice(1).map((e) => (e.origen === 'REUNION_ADMINISTRATIVA' ? e.reunion.idReunion : 0))).toEqual([3, 2, 1]);
    expect(porDia.get('2026-10-09')?.map((e) => e.origen)).toEqual(['REUNION_ADMINISTRATIVA']);
    expect(contarReunionesEnDias(porDia, ['2026-10-08', '2026-10-09'])).toBe(3);
  });

  it('busca reuniones por título o por cualquiera de sus proyectos, sin tildes', () => {
    const multi = reunion(2, {
      proyectos: [
        { idProyecto: 1, idEvento: 1, tituloProyecto: 'Portal de Voluntariado', estadoProyecto: 'EN_PROGRESO' },
        { idProyecto: 2, idEvento: 2, tituloProyecto: 'Plataforma de Tutorías', estadoProyecto: 'EN_PROGRESO' },
      ],
    });
    const lista = [reunion(1), multi];
    expect(searchReuniones(lista, ' tutorias ').map((r) => r.idReunion)).toEqual([2]);
    expect(searchReuniones(lista, 'reunión 1').map((r) => r.idReunion)).toEqual([1]);
    expect(searchReuniones(lista, '')).toHaveLength(2);
    expect(etiquetaProyectosReunion(multi)).toBe('2 proyectos');
    expect(contarReuniones(1)).toBe('1 reunión administrativa');
    expect(contarReuniones(2)).toBe('2 reuniones administrativas');
  });
});
