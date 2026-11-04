import { describe, expect, it, vi } from 'vitest';
import { MisDatosService } from '../src/cuenta/mis-datos.service';
import type { PrismaService } from '../src/prisma/prisma.service';

type Select = Record<string, unknown>;

/** Recorre el select y devuelve todas las claves pedidas, anidadas con punto. */
function claves(select: Select, prefijo = ''): string[] {
  return Object.entries(select).flatMap(([k, v]) => {
    const ruta = `${prefijo}${k}`;
    if (v === true) return [ruta];
    const anidado = (v as { select?: Select }).select;
    return anidado ? claves(anidado, `${ruta}.`) : [];
  });
}

describe('MEJ-84 MisDatosService', () => {
  const llamar = async () => {
    const findUnique = vi.fn().mockResolvedValue({ idUsuario: 7, nombre: 'Ana' });
    const r = await new MisDatosService({ usuario: { findUnique } } as unknown as PrismaService).exportar(7);
    return { r, args: findUnique.mock.calls[0][0] };
  };

  it('consulta solo la cuenta del token y devuelve fecha de generacion', async () => {
    const { r, args } = await llamar();
    expect(args.where).toEqual({ idUsuario: 7 });
    expect(r).toMatchObject({ idUsuario: 7, generadoEn: expect.any(String) });
  });

  it('usa select (lista blanca) sin hashes, tokens ni datos de otras personas', async () => {
    const { args } = await llamar();
    expect(args.include).toBeUndefined();
    const pedidas = claves(args.select);
    for (const prohibida of [
      'contrasena',
      'sesionVersion',
      'tokenHash',
      'comentarioResolucion',
      'resueltaPor',
      'aprobadoPor',
      'justificacionAjuste',
      'descripcionTarea',
      'creadaPor',
      'asignadoPor',
    ]) {
      expect(pedidas.some((c) => c.endsWith(prohibida))).toBe(false);
    }
    expect(pedidas).toEqual(
      expect.arrayContaining([
        'correo',
        'perfil.carne',
        'participaciones.registrosHoras.horasAprobadas',
        'postulaciones.justificacion',
        'tareasAsignadas.tarea.tituloTarea',
      ]),
    );
  });

  it('los registros de tiempo exportados son solo los propios y no revocados', async () => {
    const { args } = await llamar();
    expect(args.select.tareasAsignadas.select.registrosTiempo.where).toEqual({ idUsuario: 7, revocadoEn: null });
  });
});
