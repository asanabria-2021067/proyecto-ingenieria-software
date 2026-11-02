import { describe, expect, it } from 'vitest';
import { etiquetaDeRuta, migasDe } from '../lib/migas';

describe('migasDe (MEJ-74)', () => {
  it('pagina de primer nivel: Inicio > Pagina, la actual sin enlace', () => {
    expect(migasDe('/dashboard/mis-tareas')).toEqual([
      { label: 'Inicio', href: '/dashboard' },
      { label: 'Mis tareas', href: undefined },
    ]);
  });

  it('enlaza solo tramos intermedios que son pagina y nombra los ids segun su seccion', () => {
    expect(migasDe('/dashboard/proyectos/12/sprints/5')).toEqual([
      { label: 'Inicio', href: '/dashboard' },
      { label: 'Proyectos', href: '/dashboard/proyectos' },
      { label: 'Proyecto', href: '/dashboard/proyectos/12' },
      { label: 'Sprints', href: '/dashboard/proyectos/12/sprints' },
      { label: 'Sprint', href: undefined },
    ]);
  });

  it('un tramo sin pagina propia no se enlaza a una ruta inexistente', () => {
    const migas = migasDe('/dashboard/organizaciones/3/editar')!;
    expect(migas.map((m) => m.href)).toEqual([
      '/dashboard',
      '/dashboard/organizaciones',
      '/dashboard/organizaciones/3',
      undefined,
    ]);
    expect(migasDe('/dashboard/chats/archivados')![1]).toEqual({ label: 'Chats', href: undefined });
  });

  it('ignora query y barra final', () => {
    expect(migasDe('/dashboard/personas/?seccion=amigos')?.map((m) => m.label)).toEqual(['Inicio', 'Personas']);
  });

  it('no dibuja migas en el inicio, la administracion, el chat ni pantallas que ya traen la suya', () => {
    for (const ruta of [
      '/dashboard',
      '/dashboard/admin/usuarios',
      '/dashboard/mensajes/9',
      '/dashboard/proyectos/12',
      '/dashboard/projects/3/kanban/tasks/8',
      '/dashboard/projects/3/cierre',
      '/dashboard/projects/3/salida/preparacion',
      '/login',
    ]) {
      expect(migasDe(ruta), ruta).toBeNull();
    }
  });
});

describe('etiquetaDeRuta (MEJ-78)', () => {
  it('une las migas sin Inicio y excluye el panel de administracion', () => {
    expect(etiquetaDeRuta('/dashboard/proyectos/12/bitacora')).toBe('Proyectos / Proyecto / Bitácora');
    expect(etiquetaDeRuta('/dashboard/admin/horas')).toBeNull();
    expect(etiquetaDeRuta('/dashboard')).toBeNull();
  });
});
