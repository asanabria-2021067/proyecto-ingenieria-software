import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AsistenteReunionesService, sugerirFranjas } from '../src/perfil-portafolio/asistente-reuniones.service';

const todas = (desde: number, hasta: number) => new Set(Array.from({ length: hasta - desde }, (_, i) => desde + i));

describe('MEJ-142 sugerirFranjas', () => {
  const ayer = new Date('2020-01-01T00:00:00Z');

  it('devuelve las primeras 3 franjas libres para todos, sin solaparse', () => {
    const dias = [{ fecha: '2030-03-04', libresPorPersona: [todas(7, 21), todas(9, 12)] }];
    expect(sugerirFranjas(dias, 1, ayer)).toEqual([
      { fecha: '2030-03-04', horaInicio: 9, horaFin: 10 },
      { fecha: '2030-03-04', horaInicio: 10, horaFin: 11 },
      { fecha: '2030-03-04', horaInicio: 11, horaFin: 12 },
    ]);
  });

  it('exige horas seguidas libres para todas las personas y pasa al dia siguiente', () => {
    const dias = [
      { fecha: '2030-03-04', libresPorPersona: [new Set([8, 10]), todas(7, 21)] },
      { fecha: '2030-03-05', libresPorPersona: [todas(14, 17), todas(7, 21)] },
    ];
    expect(sugerirFranjas(dias, 2, ayer)).toEqual([{ fecha: '2030-03-05', horaInicio: 14, horaFin: 16 }]);
  });

  it('no sugiere horas que ya pasaron', () => {
    const dias = [{ fecha: '2030-03-04', libresPorPersona: [todas(7, 21)] }];
    const ahora = new Date('2030-03-04T15:30:00-06:00');
    expect(sugerirFranjas(dias, 1, ahora)[0]).toEqual({ fecha: '2030-03-04', horaInicio: 16, horaFin: 17 });
  });

  it('sin coincidencia devuelve lista vacia', () => {
    expect(sugerirFranjas([{ fecha: '2030-03-04', libresPorPersona: [todas(7, 10), todas(12, 15)] }], 1, ayer)).toEqual([]);
  });
});

describe('MEJ-142 consultar', () => {
  const MANANA = '2099-03-02'; // lunes
  function crear({ visible = true, bloqueo = false } = {}) {
    const prisma = {
      usuario: {
        findFirst: vi.fn().mockResolvedValue(visible ? { idUsuario: 2 } : null),
        findMany: vi.fn().mockResolvedValue([
          { idUsuario: 1, nombre: 'Yo', apellido: 'Mismo', fotoUrl: null, correo: 'yo@uvg.edu.gt', preferenciaNoMolestar: null },
          { idUsuario: 2, nombre: 'Ana', apellido: 'Paz', fotoUrl: null, correo: 'ana@uvg.edu.gt', preferenciaNoMolestar: null },
        ]),
      },
      restriccionUsuario: { findFirst: vi.fn().mockResolvedValue(bloqueo ? { idRestriccion: 1 } : null) },
      tarea: { findMany: vi.fn().mockResolvedValue([{ fechaLimite: new Date(`${MANANA}T00:00:00Z`) }]) },
    };
    const eventos = {
      findForUserInRange: vi.fn().mockResolvedValue([
        { fechaInicio: new Date(`${MANANA}T15:00:00Z`), fechaFin: new Date(`${MANANA}T16:00:00Z`), tituloEvento: 'Reunion secreta', proyecto: { tituloProyecto: 'Proyecto X' } },
      ]),
    };
    const disponibilidad = { bloquesDe: vi.fn().mockResolvedValue([]) };
    return { prisma, servicio: new AsistenteReunionesService(prisma as never, eventos as never, disponibilidad as never) };
  }

  it('cada persona expone solo identidad, esYo, sinDisponibilidad y las horas libres; nunca titulos ni proyectos', async () => {
    const { servicio } = crear();
    const res = await servicio.consultar(1, [2], MANANA, 1, 1);
    expect(res.personas).toHaveLength(2);
    for (const p of res.personas) {
      expect(Object.keys(p).sort()).toEqual(['apellido', 'dias', 'esYo', 'fotoUrl', 'idUsuario', 'nombre', 'sinDisponibilidad']);
    }
    const yo = res.personas.find((p) => p.esYo)!;
    const ana = res.personas.find((p) => !p.esYo)!;
    // Las 15:00Z son las 09:00 de Guatemala: ocupado para ambos.
    expect(ana.dias[0].libres).not.toContain(9);
    expect(Object.keys(ana.dias[0]).sort()).toEqual(['fecha', 'libres']);
    // Solo lo propio incluye la fecha limite.
    expect(Object.keys(yo.dias[0]).sort()).toEqual(['fecha', 'fechaLimite', 'libres']);
    expect(JSON.stringify(res)).not.toMatch(/Reunion secreta|Proyecto X|tituloEvento|correo|uvg\.edu/);
  });

  it('un invitado fuera del directorio es 404 y uno bloqueado es 403', async () => {
    await expect(crear({ visible: false }).servicio.consultar(1, [2], MANANA, 1, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(crear({ bloqueo: true }).servicio.consultar(1, [2], MANANA, 1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
