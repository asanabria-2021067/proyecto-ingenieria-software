import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { HorasSemestreService } from '../src/horas-semestre/horas-semestre.service';
import { renderConstanciaHorasPdf } from '../src/exports/constancia-horas.builder';
import { avanceParaTarjeta } from '../src/projects/projects.read-model';

const aprobada = (horas: number, tipoProyecto: string, fecha: string) => ({
  horasAprobadas: horas,
  fechaAprobacion: new Date(fecha),
  participacion: { rolProyecto: { nombreRol: 'Dev', proyecto: { tituloProyecto: `P-${tipoProyecto}`, tipoProyecto } } },
});

function crear(usuario: unknown, aprobadas: unknown[] = []) {
  const prisma = {
    usuario: { findUnique: vi.fn(async () => usuario) },
    horasParticipacion: { findMany: vi.fn(async () => aprobadas) },
  };
  return { service: new HorasSemestreService(prisma as never), prisma };
}

const USUARIO = { nombre: 'Ana', apellido: 'Lopez', perfil: { carne: '24001', carrera: { nombreCarrera: 'Computacion' } } };

describe('MEJ-11 constancia de horas acreditadas', () => {
  it('lista solo las horas beca y extension acreditadas del propio usuario en el semestre pedido', async () => {
    const { service, prisma } = crear(USUARIO, [
      aprobada(10, 'ACADEMICO_HORAS_BECA', '2026-08-10T12:00:00Z'),
      aprobada(5, 'EXTRACURRICULAR_EXTENSION', '2026-09-01T12:00:00Z'),
      aprobada(7, 'ACADEMICO_EXPERIENCIA', '2026-09-02T12:00:00Z'),
    ]);
    const datos = await service.datosConstancia(9, { anio: 2026, periodo: 2 });

    expect(datos.filas.map((f) => [f.tipo, f.horas, f.fecha])).toEqual([
      ['beca', 10, '2026-08-10'],
      ['extension', 5, '2026-09-01'],
    ]);
    expect(datos).toMatchObject({ nombre: 'Ana Lopez', carne: '24001', carrera: 'Computacion', semestre: { anio: 2026, periodo: 2 } });

    const where = (prisma.horasParticipacion.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ estadoHoras: 'APROBADA', participacion: { idUsuario: 9 } });
    expect((where.fechaAprobacion as { gte: Date; lt: Date }).gte.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect((where.fechaAprobacion as { gte: Date; lt: Date }).lt.toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });

  it('un usuario inexistente es 404', async () => {
    const { service } = crear(null);
    await expect(service.datosConstancia(1, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('genera un PDF valido, incluso sin horas acreditadas', async () => {
    const { service } = crear(USUARIO, []);
    const bytes = renderConstanciaHorasPdf(await service.datosConstancia(1, { anio: 2026, periodo: 1 }));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('MEJ-25 avance de tarjeta', () => {
  it('calcula el avance del proyecto y del sprint activo', () => {
    const r = avanceParaTarjeta({
      tareas: [
        { estadoTarea: 'HECHO', idHito: null },
        { estadoTarea: 'POR_HACER', idHito: null },
        { estadoTarea: 'HECHO', idHito: null },
      ],
      hitos: [],
      sprints: [{ numero: 2, tareas: [{ estadoTarea: 'HECHO' }, { estadoTarea: 'EN_PROGRESO' }] }],
    });
    expect(r.avanceProyecto.tareas).toMatchObject({ total: 3, hecho: 2, porcentaje: 67 });
    expect(r.sprintActual).toEqual({ numero: 2, porcentaje: 50, total: 2, hecho: 1 });
  });

  it('sin sprint activo, sprintActual es null', () => {
    expect(avanceParaTarjeta({ tareas: [], hitos: [], sprints: [] }).sprintActual).toBeNull();
  });
});
