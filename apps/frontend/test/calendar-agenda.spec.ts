import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  agendaItemKey,
  eventoToAgendaItem,
  eventoToAgendaItems,
  groupAgendaItemsByDay,
  ocupaDiasCompletos,
  tareaCompartidaToAgendaItem,
  tareaToAgendaItem,
} from '@/lib/calendar/agenda';
import type { MiTareaDTO } from '@/lib/services/users';
import type { MiEventoDTO } from '@/lib/services/events';
import type { AgendaCompartidaDTO, EventoCompartidoDTO, TareaCompartidaDTO } from '@/lib/services/calendar-shares';

function tarea(overrides: Partial<MiTareaDTO> & { fechaLimite: string }): MiTareaDTO & { fechaLimite: string } {
  return {
    idTarea: 1,
    tituloTarea: 'Entregar informe',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    idHito: null,
    proyecto: { idProyecto: 10, tituloProyecto: 'Proyecto X', estadoProyecto: 'EN_PROGRESO' },
    ...overrides,
  };
}

function evento(overrides: Partial<MiEventoDTO> = {}): MiEventoDTO {
  return {
    idEvento: 1,
    idProyecto: 10,
    tituloEvento: 'Kickoff',
    descripcionEvento: null,
    fechaInicio: '2026-09-23T15:00:00.000Z',
    fechaFin: '2026-09-23T16:00:00.000Z',
    antelacionMinutos: 60,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: null,
    linkSesion: null,
    rolesDestino: [],
    tipoEvento: 'OTRO',
    invitados: [],
    proyecto: { idProyecto: 10, tituloProyecto: 'Proyecto X' },
    ...overrides,
  };
}

describe('calendar/agenda — mapeo a AgendaItem', () => {
  it('tareaToAgendaItem usa el día de fechaLimite (sin corrimiento UTC) y sortKey al final del día', () => {
    const item = tareaToAgendaItem(tarea({ fechaLimite: '2026-09-23T00:00:00.000Z' }));
    expect(item.kind).toBe('tarea');
    expect(item.key).toBe('2026-09-23');
    expect(item.sortKey).toBe('24:00');
  });

  it('eventoToAgendaItem usa el día/hora local de fechaInicio', () => {
    const item = eventoToAgendaItem(evento());
    expect(item.kind).toBe('evento');
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item.projectId).toBe(10);
    expect(item.projectTitle).toBe('Proyecto X');
    // sortKey es la hora formateada (HH:mm), no "24:00"
    expect(item.sortKey).not.toBe('24:00');
    expect(item.sortKey).toMatch(/^\d{2}:\d{2}$/);
  });
  it('eventoToAgendaItem conserva la modalidad para colorear el evento (HU-184 T-324)', () => {
    const item = eventoToAgendaItem(evento({ modalidad: 'PRESENCIAL' }));
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item.modalidad).toBe('PRESENCIAL');
  });
});

describe('calendar/agenda — eventoToAgendaItems (evento multi-día, T-264)', () => {
  it('un evento de un solo día produce un único AgendaItem, en su día', () => {
    const items = eventoToAgendaItems(evento(), new Date(2026, 8, 1), new Date(2026, 9, 1));
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('2026-09-23');
  });

  it('un evento que abarca varios días aparece en cada día que toca', () => {
    const e = evento({
      fechaInicio: '2026-09-23T15:00:00.000Z',
      fechaFin: '2026-09-25T16:00:00.000Z',
    });
    const items = eventoToAgendaItems(e, new Date(2026, 8, 1), new Date(2026, 9, 1));
    expect(items.map((i) => i.key)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
  });

  it('un evento que empieza antes del rango visible pero lo solapa se recorta al rango, no desaparece', () => {
    const e = evento({
      fechaInicio: '2026-08-28T15:00:00.000Z',
      fechaFin: '2026-09-02T16:00:00.000Z',
    });
    const rangoDesde = new Date(2026, 8, 1); // 2026-09-01
    const rangoHasta = new Date(2026, 8, 3); // exclusivo: hasta el 2026-09-02
    const items = eventoToAgendaItems(e, rangoDesde, rangoHasta);
    expect(items.map((i) => i.key)).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('calendar/agenda — groupAgendaItemsByDay', () => {
  it('agrupa por día y ordena eventos antes que tareas del mismo día (por hora)', () => {
    const items = [
      tareaToAgendaItem(tarea({ fechaLimite: '2026-09-23' })),
      eventoToAgendaItem(evento({ idEvento: 2, fechaInicio: '2026-09-23T09:00:00.000Z', fechaFin: '2026-09-23T10:00:00.000Z' })),
    ];
    const agrupado = groupAgendaItemsByDay(items);

    expect([...agrupado.keys()]).toEqual(['2026-09-23']);
    const dia = agrupado.get('2026-09-23')!;
    expect(dia).toHaveLength(2);
    expect(dia[0].kind).toBe('evento'); // hora real < "24:00"
    expect(dia[1].kind).toBe('tarea');
  });

  it('mantiene días distintos en grupos separados', () => {
    const items = [
      tareaToAgendaItem(tarea({ fechaLimite: '2026-09-23' })),
      tareaToAgendaItem(tarea({ idTarea: 2, fechaLimite: '2026-09-24' })),
    ];
    const agrupado = groupAgendaItemsByDay(items);
    expect(agrupado.size).toBe(2);
  });

  it('sin ítems produce un mapa vacío', () => {
    expect(groupAgendaItemsByDay([]).size).toBe(0);
  });
});

describe('calendar/agenda — calendarios compartidos y tipo (HU-184)', () => {
  const origen = { idUsuario: 7, nombre: 'Ana García', tono: 3 as const };

  it('el evento lleva su tipo y si dura varios días', () => {
    const corto = eventoToAgendaItem(evento({ tipoEvento: 'TUTORIA' }));
    if (corto.kind !== 'evento') throw new Error('unreachable');
    expect(corto.tipo).toBe('TUTORIA');
    expect(corto.multiDia).toBe(false);

    const largo = eventoToAgendaItem(evento({ fechaFin: '2026-09-25T16:00:00.000Z' }));
    if (largo.kind !== 'evento') throw new Error('unreachable');
    expect(largo.multiDia).toBe(true);
  });

  it('un evento de un calendario compartido conserva de quién es', () => {
    const [item] = eventoToAgendaItems(evento(), new Date(2026, 8, 1), new Date(2026, 9, 1), origen);
    expect(item.compartidoPor).toEqual(origen);
    expect(eventoToAgendaItem(evento()).compartidoPor).toBeUndefined();
  });

  it('la tarea compartida no es navegable y usa el día de su fecha límite', () => {
    const item = tareaCompartidaToAgendaItem(
      {
        idTarea: 3,
        visibilidad: 'DETALLE',
        tituloTarea: 'Informe',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'ALTA',
        fechaLimite: '2026-09-23T00:00:00.000Z',
        proyecto: { idProyecto: 10, tituloProyecto: 'Proyecto X' },
      },
      origen,
    );
    expect(item.key).toBe('2026-09-23');
    expect(item.href).toBe('');
    expect(item.compartidoPor).toEqual(origen);
  });

  it('agendaItemKey distingue el mismo evento visto en mi calendario y en uno compartido', () => {
    const mio = eventoToAgendaItem(evento());
    const compartido = eventoToAgendaItem(evento(), origen);
    expect(agendaItemKey(mio)).not.toBe(agendaItemKey(compartido));
  });
});

describe('calendar-shares — contrato mínimo de la agenda compartida (G01-C06, UI-01)', () => {
  it('EventoCompartidoDTO no admite campos privados ni en DETALLE ni en OCUPADO', () => {
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('linkSesion');
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('descripcionEvento');
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('ubicacionLat');
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('invitados');
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('rolesDestino');
    expectTypeOf<EventoCompartidoDTO>().not.toHaveProperty('antelacionMinutos');
    // OCUPADO: ni título ni proyecto; DETALLE: solo lo necesario para pintarlo.
    expectTypeOf<Extract<EventoCompartidoDTO, { visibilidad: 'OCUPADO' }>>().not.toHaveProperty('tituloEvento');
    expectTypeOf<Extract<EventoCompartidoDTO, { visibilidad: 'OCUPADO' }>>().not.toHaveProperty('proyecto');
    expectTypeOf<Extract<EventoCompartidoDTO, { visibilidad: 'DETALLE' }>>().toHaveProperty('tituloEvento');
    expectTypeOf<Extract<TareaCompartidaDTO, { visibilidad: 'OCUPADO' }>>().not.toHaveProperty('tituloTarea');
    expectTypeOf<AgendaCompartidaDTO['eventos'][number]>().toEqualTypeOf<EventoCompartidoDTO>();
  });

  it('el DTO personal (MiEventoDTO) no es asignable al compartido: no se puede colar por accidente', () => {
    expectTypeOf<MiEventoDTO>().not.toMatchTypeOf<EventoCompartidoDTO>();
    // Y un evento compartido nunca pasa por donde se espera el DTO completo.
    expectTypeOf<EventoCompartidoDTO>().not.toMatchTypeOf<MiEventoDTO>();
  });
});

describe('calendar/agenda — mapeo de la agenda compartida reducida (G01-C07, UI-01)', () => {
  const origen = { idUsuario: 7, nombre: 'Ana García', tono: 3 as const };
  const base = { idEvento: 50, fechaInicio: '2026-09-23T15:00:00.000Z', fechaFin: '2026-09-23T16:00:00.000Z' };

  it('un evento compartido con DETALLE conserva título, tipo, modalidad y proyecto, sin descripción ni enlace al proyecto', () => {
    const evento: EventoCompartidoDTO = {
      ...base,
      visibilidad: 'DETALLE',
      tituloEvento: 'Demo',
      tipoEvento: 'TALLER',
      modalidad: 'MIXTA',
      proyecto: { idProyecto: 10, tituloProyecto: 'Proyecto X' },
    };
    const item = eventoToAgendaItem(evento, origen);
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item).toMatchObject({ id: 50, titulo: 'Demo', tipo: 'TALLER', modalidad: 'MIXTA', projectId: 10, projectTitle: 'Proyecto X', descripcion: null, href: '', compartidoPor: origen });
    expect(item.ocupado).toBeUndefined();
  });

  it('un evento compartido OCUPADO no lleva título, proyecto ni tipo reales: solo horario y la marca', () => {
    const item = eventoToAgendaItem({ ...base, visibilidad: 'OCUPADO' }, origen);
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item).toMatchObject({ id: 50, titulo: 'Ocupado', projectId: 0, projectTitle: '', descripcion: null, href: '', ocupado: true, compartidoPor: origen });
    expect(item.horaInicio).toMatch(/^\d{2}:\d{2}$/);
    expect(JSON.stringify(item)).not.toContain('Proyecto');
  });

  it('eventoToAgendaItems también acepta el DTO compartido y lo expande por día', () => {
    const items = eventoToAgendaItems({ ...base, fechaFin: '2026-09-24T16:00:00.000Z', visibilidad: 'OCUPADO' }, new Date(2026, 8, 1), new Date(2026, 9, 1), origen);
    expect(items.map((i) => i.key)).toEqual(['2026-09-23', '2026-09-24']);
    expect(items.every((i) => i.kind === 'evento' && i.ocupado)).toBe(true);
  });

  it('un evento compartido sin origen es un error de programación, no un ítem propio', () => {
    expect(() => eventoToAgendaItem({ ...base, visibilidad: 'OCUPADO' })).toThrow();
  });

  it('una tarea compartida OCUPADO solo conserva el día, sin título ni proyecto', () => {
    const item = tareaCompartidaToAgendaItem({ idTarea: 3, fechaLimite: '2026-09-23T00:00:00.000Z', visibilidad: 'OCUPADO' }, origen);
    expect(item).toMatchObject({ kind: 'tarea', key: '2026-09-23', id: 3, titulo: 'Fecha límite', projectId: 0, projectTitle: '', href: '', ocupado: true, compartidoPor: origen });
  });

  it('el mapeo del evento propio no cambia (sigue llevando descripción y enlace al proyecto)', () => {
    const item = eventoToAgendaItem(evento({ descripcionEvento: 'Notas' }));
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item.descripcion).toBe('Notas');
    expect(item.href).toBe('/dashboard/projects/10');
    expect(item.ocupado).toBeUndefined();
  });
});

describe('calendar/agenda — eventos nocturnos partidos por fecha real (G02-C04, UI-05)', () => {
  const RANGO: [Date, Date] = [new Date(2026, 9, 1), new Date(2026, 10, 1)];
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const soloEventos = (items: ReturnType<typeof eventoToAgendaItems>) =>
    items.map((i) => (i.kind === 'evento' ? { key: i.key, horaInicio: i.horaInicio, horaFin: i.horaFin, multiDia: i.multiDia } : null));

  it('un evento 22:00 → 00:00 (fin exactamente a medianoche) es un único tramo del primer día, sin fantasma al siguiente', () => {
    const items = eventoToAgendaItems(evento({ fechaInicio: local(8, 22), fechaFin: local(9, 0) }), ...RANGO);
    expect(soloEventos(items)).toEqual([{ key: '2026-10-08', horaInicio: '22:00', horaFin: '00:00', multiDia: false }]);
    const [tramo] = items;
    if (tramo.kind !== 'evento') throw new Error('unreachable');
    expect(tramo.fechaFin).toEqual(new Date(2026, 9, 9, 0, 0));
  });

  it('un evento 23:00 → 01:00 produce dos tramos con horas reales y ninguno es de todo el día', () => {
    const items = eventoToAgendaItems(evento({ fechaInicio: local(8, 23), fechaFin: local(9, 1) }), ...RANGO);
    expect(soloEventos(items)).toEqual([
      { key: '2026-10-08', horaInicio: '23:00', horaFin: '00:00', multiDia: false },
      { key: '2026-10-09', horaInicio: '00:00', horaFin: '01:00', multiDia: false },
    ]);
    expect(new Set(items.map(agendaItemKey)).size).toBe(2);
    expect(items.every((i) => i.id === 1)).toBe(true);
    expect(items.map((i) => i.sortKey)).toEqual(['23:00', '00:00']);
  });

  it('un evento de 24 h o más sigue siendo de días completos: mismo ítem en cada día, sin recortar horas', () => {
    const items = eventoToAgendaItems(evento({ fechaInicio: local(8, 9), fechaFin: local(10, 17) }), ...RANGO);
    expect(items.map((i) => i.key)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
    expect(items.every((i) => i.kind === 'evento' && i.multiDia && i.horaInicio === '09:00' && i.horaFin === '17:00')).toBe(true);
    expect(ocupaDiasCompletos(new Date(local(8, 9)), new Date(local(9, 9)))).toBe(true);
    expect(ocupaDiasCompletos(new Date(local(8, 23)), new Date(local(9, 1)))).toBe(false);
  });

  it('un tramo nocturno fuera del rango visible se recorta igual que cualquier día', () => {
    const items = eventoToAgendaItems(evento({ fechaInicio: local(31, 23), fechaFin: new Date(2026, 10, 1, 1).toISOString() }), ...RANGO);
    expect(soloEventos(items)).toEqual([{ key: '2026-10-31', horaInicio: '23:00', horaFin: '00:00', multiDia: false }]);
  });

  it('eventoToAgendaItem (un solo ítem) también deja de marcar como varios días un evento con horas que cruza medianoche', () => {
    const item = eventoToAgendaItem(evento({ fechaInicio: local(8, 23), fechaFin: local(9, 1) }));
    if (item.kind !== 'evento') throw new Error('unreachable');
    expect(item.multiDia).toBe(false);
    expect(item.horaFin).toBe('01:00');
  });

  it('los tramos de un evento compartido conservan el contrato de G01 (OCUPADO sin título ni proyecto)', () => {
    const origen = { idUsuario: 7, nombre: 'Ana García', tono: 3 as const };
    const items = eventoToAgendaItems({ idEvento: 50, fechaInicio: local(8, 23), fechaFin: local(9, 1), visibilidad: 'OCUPADO' }, ...RANGO, origen);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'evento' && i.ocupado && i.titulo === 'Ocupado' && i.projectId === 0 && i.compartidoPor === origen)).toBe(true);
    expect(JSON.stringify(items)).not.toContain('Proyecto');
  });
});

/**
 * G02-C13: fixtures canónicas de regresión del calendario (las mismas que usan
 * los specs de vistas): 15 min, 30 min, 23:00→01:00, fin 00:00, 2 días,
 * 3 solapados y 4 tareas el mismo día. Aquí se fija el mapeo; en
 * calendar-time-grid-view/calendar-week-view su representación.
 */
describe('calendar/agenda — regresión temporal consolidada (G02-C13)', () => {
  const RANGO: [Date, Date] = [new Date(2026, 9, 5), new Date(2026, 9, 12)];
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const CASOS = {
    quince: evento({ idEvento: 101, tituloEvento: 'Stand-up', fechaInicio: local(8, 9), fechaFin: local(8, 9, 15) }),
    treinta: evento({ idEvento: 102, tituloEvento: 'Daily', fechaInicio: local(8, 10), fechaFin: local(8, 10, 30) }),
    nocturno: evento({ idEvento: 103, tituloEvento: 'Hackathon', fechaInicio: local(8, 23), fechaFin: local(9, 1) }),
    medianoche: evento({ idEvento: 104, tituloEvento: 'Cierre', fechaInicio: local(8, 22), fechaFin: local(9, 0) }),
    dosDias: evento({ idEvento: 105, tituloEvento: 'Congreso', fechaInicio: local(9, 9), fechaFin: local(10, 17) }),
    solapados: [1, 2, 3].map((n) => evento({ idEvento: 110 + n, tituloEvento: `Solapado ${n}`, fechaInicio: local(7, 10, (n - 1) * 15), fechaFin: local(7, 11) })),
  };

  it('cada caso produce exactamente los ítems esperados por día, con horas reales y sin fantasmas', () => {
    const items = [
      CASOS.quince,
      CASOS.treinta,
      CASOS.nocturno,
      CASOS.medianoche,
      CASOS.dosDias,
      ...CASOS.solapados,
    ].flatMap((e) => eventoToAgendaItems(e, ...RANGO));
    const porDia = groupAgendaItemsByDay(items);
    const resumen = (key: string) =>
      (porDia.get(key) ?? []).map((i) => (i.kind === 'evento' ? `${i.id}:${i.horaInicio}-${i.horaFin}${i.multiDia ? ':todoElDia' : ''}` : 'tarea'));

    expect(resumen('2026-10-07')).toEqual(['111:10:00-11:00', '112:10:15-11:00', '113:10:30-11:00']);
    expect(resumen('2026-10-08')).toEqual(['101:09:00-09:15', '102:10:00-10:30', '104:22:00-00:00', '103:23:00-00:00']);
    expect(resumen('2026-10-09')).toEqual(['103:00:00-01:00', '105:09:00-17:00:todoElDia']);
    expect(resumen('2026-10-10')).toEqual(['105:09:00-17:00:todoElDia']);
    expect(porDia.has('2026-10-11')).toBe(false);
    // Claves React únicas aunque un mismo evento aparezca en dos días.
    expect(new Set(items.map(agendaItemKey)).size).toBe(items.length);
  });

  it('los ítems compartidos OCUPADO de esas mismas fixtures no revelan título ni proyecto (G01 intacto)', () => {
    const origen = { idUsuario: 7, nombre: 'Ana García', tono: 3 as const };
    const compartidos = [CASOS.nocturno, CASOS.dosDias].flatMap((e) =>
      eventoToAgendaItems({ idEvento: e.idEvento, fechaInicio: e.fechaInicio, fechaFin: e.fechaFin, visibilidad: 'OCUPADO' }, ...RANGO, origen),
    );
    expect(compartidos).toHaveLength(4);
    expect(compartidos.every((i) => i.kind === 'evento' && i.ocupado && i.titulo === 'Ocupado' && i.projectTitle === '')).toBe(true);
    expect(JSON.stringify(compartidos)).not.toMatch(/Hackathon|Congreso|Proyecto X/);
  });
});
