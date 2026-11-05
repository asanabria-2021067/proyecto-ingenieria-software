import { describe, expect, it, vi } from 'vitest';
import { SemestreResumenService } from '../src/perfil-portafolio/semestre-resumen.service';

const fila = (clave: string, nombre: string, fechaBronce: string) => ({
  clave,
  nombre,
  descripcion: 'x',
  icono: 'i',
  umbralBronce: 1,
  umbralPlata: 2,
  umbralOro: 3,
  umbralDiamante: 4,
  usuarios: [{ nivel: 'BRONCE', progreso: 1, fechaBronce: new Date(fechaBronce), fechaPlata: null, fechaOro: null, fechaDiamante: null }],
});

function build() {
  const prisma = {
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([{ rolProyecto: { idProyecto: 1 } }, { rolProyecto: { idProyecto: 2 } }]) },
    proyecto: { findMany: vi.fn().mockResolvedValue([{ idProyecto: 2 }, { idProyecto: 3 }]) },
    tarea: { count: vi.fn().mockResolvedValue(11) },
    reconocimientoCompanero: { count: vi.fn().mockResolvedValue(2) },
    insignia: {
      findMany: vi.fn().mockResolvedValue([fila('tareas', 'Constante', '2026-08-10T12:00:00Z'), fila('horas', 'Antigua', '2025-01-10T12:00:00Z')]),
    },
  };
  const horas = {
    getProgreso: vi.fn().mockResolvedValue({
      semestre: { anio: 2026, periodo: 2, inicio: '2026-07-01', fin: '2026-12-31' },
      beca: { acreditadas: 30, declaradas: 999 },
      extension: { acreditadas: 5, declaradas: 999 },
    }),
  };
  return { prisma, horas, service: new SemestreResumenService(prisma as never, horas as never) };
}

describe('SemestreResumenService', () => {
  it('resume el semestre: horas acreditadas (sin las declaradas), proyectos unicos, tareas, reconocimientos e insignias del periodo', async () => {
    const { service } = build();
    await expect(service.resumen(5)).resolves.toEqual({
      semestre: { anio: 2026, periodo: 2 },
      horasAcreditadas: 35,
      proyectos: 3,
      tareasCompletadas: 11,
      reconocimientos: 2,
      insignias: [{ clave: 'tareas', nombre: 'Constante', nivel: 'BRONCE' }],
    });
  });

  it('todo se consulta con el id propio y la ventana del semestre; no devuelve datos privados', async () => {
    const { prisma, service } = build();
    const r = await service.resumen(5);
    expect(prisma.tarea.count.mock.calls[0][0].where.asignaciones).toEqual({ some: { idUsuario: 5 } });
    expect(prisma.reconocimientoCompanero.count.mock.calls[0][0].where.idReceptor).toBe(5);
    expect(prisma.tarea.count.mock.calls[0][0].where.actualizadaEn.gte.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(Object.keys(r).sort()).toEqual(['horasAcreditadas', 'insignias', 'proyectos', 'reconocimientos', 'semestre', 'tareasCompletadas']);
    expect(JSON.stringify(r)).not.toMatch(/correo|carne|telefono/i);
  });
});
