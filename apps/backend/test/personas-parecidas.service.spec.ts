import { describe, expect, it, vi } from 'vitest';
import { PersonasParecidasService } from '../src/perfil-portafolio/personas-parecidas.service';

function crear(propios: unknown[], parecidos: unknown[]) {
  const prisma = {
    usuario: {
      findFirst: vi.fn().mockResolvedValue({ idUsuario: 7 }),
      findMany: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where.idUsuario.in.map((idUsuario: number) => ({ idUsuario, nombre: `N${idUsuario}`, apellido: 'A', fotoUrl: null, perfil: null })),
        ),
      ),
    },
    restriccionUsuario: { findMany: vi.fn().mockResolvedValue([{ idUsuario: 1, idObjetivo: 30 }]) },
    proyecto: { findMany: vi.fn().mockResolvedValueOnce(propios).mockResolvedValueOnce(parecidos) },
  };
  return { prisma, servicio: new PersonasParecidasService(prisma as never) };
}

const proyecto = (titulo: string, creadoPor: number, participantes: number[]) => ({
  tituloProyecto: titulo,
  creadoPor,
  intereses: [{ idInteres: 1 }],
  roles: [{ participaciones: participantes.map((idUsuario) => ({ idUsuario })) }],
});

describe('MEJ-152 personas de proyectos parecidos', () => {
  it('sin intereses en los proyectos propios no hay nada que comparar', async () => {
    const { servicio, prisma } = crear([{ idProyecto: 1, intereses: [] }], []);
    await expect(servicio.listar(1, 7)).resolves.toEqual([]);
    expect(prisma.proyecto.findMany).toHaveBeenCalledTimes(1);
  });

  it('excluye al visor, al objetivo y a los bloqueados, y ordena por proyectos parecidos', async () => {
    const { servicio } = crear(
      [{ idProyecto: 1, intereses: [{ idInteres: 1 }] }],
      [proyecto('Huerto', 20, [1, 7, 30, 21]), proyecto('Reciclaje', 21, [20])],
    );
    const res = await servicio.listar(1, 7);
    expect(res.map((p) => [p.idUsuario, p.proyectosParecidos])).toEqual([
      [20, 2],
      [21, 2],
    ]);
  });
});
