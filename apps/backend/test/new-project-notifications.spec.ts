import { describe, expect, it, vi } from 'vitest';
import { avisarProyectoNuevo } from '../src/projects/new-project-notifications';

const PROYECTO = {
  tituloProyecto: 'Feria',
  creadoPor: 1,
  idAsociacion: 7,
  asociacion: { nombre: 'AECC' },
  organizaciones: [{ idOrganizacion: 3, organizacion: { nombreOrganizacion: 'Robotica' } }],
  intereses: [{ idInteres: 4 }],
  roles: [{ idCarreraRequerida: 2 }, { idCarreraRequerida: null }, { idCarreraRequerida: 2 }],
};

function crear(proyecto: unknown = PROYECTO) {
  const tx = {
    proyecto: { findUnique: vi.fn().mockResolvedValue(proyecto) },
    seguimientoEntidad: { findMany: vi.fn().mockResolvedValue([]) },
    usuario: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  return { tx, notifications, run: () => avisarProyectoNuevo(tx as never, notifications as never, 5) };
}

describe('avisarProyectoNuevo (MEJ-16)', () => {
  it('un proyecto inexistente no avisa a nadie', async () => {
    const { notifications, run } = crear(null);
    await expect(run()).resolves.toBe(0);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('cada persona recibe un solo aviso con el motivo más fuerte: sigue > carrera > interés', async () => {
    const { tx, notifications, run } = crear();
    tx.seguimientoEntidad.findMany.mockResolvedValue([
      { idUsuario: 10, idOrganizacion: 3 },
      { idUsuario: 11, idOrganizacion: null },
    ]);
    // 10 también es de la carrera y comparte interés; 12 de la carrera e interés; 13 solo interés.
    tx.usuario.findMany
      .mockResolvedValueOnce([{ idUsuario: 10 }, { idUsuario: 12 }])
      .mockResolvedValueOnce([{ idUsuario: 10 }, { idUsuario: 12 }, { idUsuario: 13 }]);

    await expect(run()).resolves.toBe(4);

    const llamadas = notifications.notifyFromTemplate.mock.calls.map(([ids, plantilla, datos]) => [ids, plantilla, datos.motivo, datos.entidad]);
    expect(llamadas).toEqual(
      expect.arrayContaining([
        [[10], 'PROYECTO_NUEVO_PARA_TI', 'SIGUE', 'Robotica'],
        [[11], 'PROYECTO_NUEVO_PARA_TI', 'SIGUE', 'AECC'],
        [[12], 'PROYECTO_NUEVO_PARA_TI', 'CARRERA', null],
        [[13], 'PROYECTO_NUEVO_PARA_TI', 'INTERES', null],
      ]),
    );
    expect(llamadas).toHaveLength(4);
  });

  it('excluye al líder y solo cuentas activas en cada consulta', async () => {
    const { tx, run } = crear();
    await run();
    const filtro = { estado: 'ACTIVO', idUsuario: { not: 1 } };
    expect(tx.seguimientoEntidad.findMany.mock.calls[0][0].where.usuario).toEqual(filtro);
    expect(tx.usuario.findMany.mock.calls[0][0].where).toMatchObject(filtro);
    expect(tx.usuario.findMany.mock.calls[1][0].where).toMatchObject(filtro);
    // Carreras repetidas se consultan una sola vez.
    expect(tx.usuario.findMany.mock.calls[0][0].where.perfil).toEqual({ idCarrera: { in: [2] } });
  });

  it('sin organización, asociación, carrera ni intereses no consulta nada', async () => {
    const { tx, notifications, run } = crear({
      ...PROYECTO, idAsociacion: null, asociacion: null, organizaciones: [], intereses: [], roles: [{ idCarreraRequerida: null }],
    });
    await expect(run()).resolves.toBe(0);
    expect(tx.seguimientoEntidad.findMany).not.toHaveBeenCalled();
    expect(tx.usuario.findMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});
