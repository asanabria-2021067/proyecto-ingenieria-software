import { describe, expect, it } from 'vitest';
import {
  agendaItemKey,
  eventoToAgendaItem,
  eventoToAgendaItems,
  groupAgendaItemsByDay,
  tareaCompartidaToAgendaItem,
  tareaToAgendaItem,
} from '@/lib/calendar/agenda';
import type { MiTareaDTO } from '@/lib/services/users';
import type { MiEventoDTO } from '@/lib/services/events';

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
