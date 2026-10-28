import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InsigniaCircular } from '../components/insignias/insignia-circular';
import { InsigniasVitrina } from '../components/insignias/insignias-vitrina';
import type { InsigniaDto, NivelInsignia } from '../lib/types/insignias';

const sinFechas = { BRONCE: null, PLATA: null, ORO: null, DIAMANTE: null };

function insignia(overrides: Partial<InsigniaDto> = {}): InsigniaDto {
  return {
    clave: 'tareas',
    nombre: 'Tareas completadas',
    descripcion: 'Tareas en Hecho en las que estuviste asignado.',
    icono: 'CheckCircle2',
    nivel: null,
    progreso: 0,
    umbrales: [1, 10, 50, 100],
    siguienteUmbral: 1,
    fechas: sinFechas,
    ...overrides,
  };
}

const plata = insignia({
  nivel: 'PLATA',
  progreso: 30,
  siguienteUmbral: 50,
  fechas: { ...sinFechas, BRONCE: '2026-09-01T12:00:00.000Z', PLATA: '2026-10-12T15:00:00.000Z' },
});

describe('InsigniaCircular (HU-190, T-348)', () => {
  it.each([
    ['BRONCE', 'border-insignia-bronce', null, 'Bronce'],
    ['PLATA', 'border-insignia-plata', 'x2', 'Plata'],
    ['ORO', 'border-insignia-oro', 'x3', 'Oro'],
    ['DIAMANTE', 'border-insignia-diamante', 'x4', 'Diamante'],
  ] as [NivelInsignia, string, string | null, string][])(
    'nivel %s: anillo %s, contador %s y nombre del nivel en texto',
    (nivel, anillo, contador, nombre) => {
      const { container } = render(<InsigniaCircular insignia={insignia({ nivel, progreso: 5, siguienteUmbral: 100 })} />);

      expect(container.querySelector(`.${anillo}`)).not.toBeNull();
      expect(screen.getByText(nombre)).toBeInTheDocument();
      if (contador) expect(screen.getByText(contador)).toBeInTheDocument();
      else expect(screen.queryByText(/^x\d$/)).not.toBeInTheDocument();
    },
  );

  it('el botón tiene aria-label con el nivel en palabras y es enfocable con teclado', async () => {
    render(<InsigniaCircular insignia={plata} />);
    const boton = screen.getByRole('button', { name: 'Tareas completadas, nivel Plata' });

    boton.focus();

    expect(boton).toHaveFocus();
    expect(boton.tagName).toBe('BUTTON');
  });

  it('el popover se abre con clic y muestra descripción, nivel, fecha y progreso al siguiente nivel', async () => {
    render(<InsigniaCircular insignia={plata} />);

    fireEvent.click(screen.getByRole('button', { name: /nivel Plata/ }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('Tareas en Hecho en las que estuviste asignado.')).toBeInTheDocument();
    expect(within(popover).getByText('Plata', { selector: 'strong' })).toBeInTheDocument();
    expect(within(popover).getByText(/Obtenida el .*2026/)).toBeInTheDocument();
    expect(within(popover).getByText('Progreso: 30 / 50 para Oro')).toBeInTheDocument();
    expect(within(popover).getByRole('progressbar', { name: 'Progreso hacia Oro' })).toBeInTheDocument();
  });

  it('el popover se cierra con Escape', async () => {
    render(<InsigniaCircular insignia={plata} />);

    fireEvent.click(screen.getByRole('button', { name: /nivel Plata/ }));
    const dialogo = await screen.findByRole('dialog');

    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('con Diamante dice nivel máximo en vez de progreso', async () => {
    render(<InsigniaCircular insignia={insignia({ nivel: 'DIAMANTE', progreso: 120, siguienteUmbral: null })} />);

    fireEvent.click(screen.getByRole('button', { name: /Diamante/ }));

    expect(await screen.findByText('Nivel máximo alcanzado.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('bloqueada: sin anillo de nivel, dice Bloqueada y el popover muestra el progreso hacia Bronce', async () => {
    const { container } = render(<InsigniaCircular insignia={insignia({ progreso: 2, siguienteUmbral: 5, umbrales: [5, 25, 100, 250] })} />);

    expect(container.querySelector('[class*="border-insignia-"]')).toBeNull();
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bloqueada/ }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('Sin nivel')).toBeInTheDocument();
    expect(within(popover).getByText('Progreso: 2 / 5 para Bronce')).toBeInTheDocument();
    expect(within(popover).queryByText(/Obtenida el/)).not.toBeInTheDocument();
  });

  it('en el perfil público no muestra el progreso hacia el siguiente nivel', async () => {
    render(<InsigniaCircular insignia={plata} publica />);

    fireEvent.click(screen.getByRole('button', { name: /nivel Plata/ }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText(/Obtenida el/)).toBeInTheDocument();
    expect(within(popover).queryByText(/Progreso:/)).not.toBeInTheDocument();
    expect(within(popover).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('un icono desconocido cae en un icono por defecto sin reventar', () => {
    render(<InsigniaCircular insignia={insignia({ icono: 'NoExiste', nivel: 'BRONCE', progreso: 1, siguienteUmbral: 10 })} />);

    expect(screen.getByRole('button', { name: /nivel Bronce/ })).toBeInTheDocument();
  });
});

describe('InsigniasVitrina (HU-190, T-348)', () => {
  const lista = [
    insignia({ clave: 'tareas', nombre: 'Tareas completadas', nivel: 'ORO', progreso: 60, siguienteUmbral: 100 }),
    insignia({ clave: 'horas', nombre: 'Horas acreditadas', progreso: 2, siguienteUmbral: 5 }),
    insignia({ clave: 'sprints', nombre: 'Sprints completados', nivel: 'BRONCE', progreso: 1, siguienteUmbral: 5 }),
  ];

  it('separa obtenidas y bloqueadas en secciones', () => {
    render(<InsigniasVitrina insignias={lista} />);

    expect(screen.getByRole('heading', { name: 'Insignias' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Tareas completadas')).toBeInTheDocument();
    expect(within(items[1]).getByText('Sprints completados')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bloqueadas' })).toBeInTheDocument();
    expect(within(items[2]).getByText('Horas acreditadas')).toBeInTheDocument();
  });

  it('sin obtenidas muestra un mensaje y deja las 7 como bloqueadas', () => {
    render(<InsigniasVitrina insignias={[lista[1]]} />);

    expect(screen.getByText(/Todavía no tienes insignias/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bloqueadas' })).toBeInTheDocument();
  });

  it('pública: solo las obtenidas, sin sección de bloqueadas', () => {
    render(<InsigniasVitrina insignias={lista.slice(0, 1)} publica />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Bloqueadas' })).not.toBeInTheDocument();
  });

  it('pública sin insignias dice que todavía no tiene', () => {
    render(<InsigniasVitrina insignias={[]} publica />);

    expect(screen.getByText('Todavía no tiene insignias.')).toBeInTheDocument();
  });

  it('muestra estado de carga y de error accesibles', () => {
    const { rerender } = render(<InsigniasVitrina insignias={[]} isLoading />);
    expect(screen.getByRole('status', { name: 'Cargando insignias' })).toHaveAttribute('aria-busy', 'true');

    rerender(<InsigniasVitrina insignias={[]} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las insignias.');
  });
});
