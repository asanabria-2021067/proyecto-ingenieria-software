import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';

// Vacío principal dentro de una tarjeta = contenido directo sobre la tarjeta
// blanca (tone="flush"), con un icono pequeño y neutro (variant="subtle").
describe('Empty — variantes para vacíos dentro de tarjetas', () => {
  afterEach(() => cleanup());

  it('flush no añade otra superficie: sin borde, fondo, sombra ni radio propios', () => {
    render(
      <Empty tone="flush" role="status">
        <EmptyMedia variant="subtle">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Nada por aquí</EmptyTitle>
        </EmptyHeader>
      </Empty>,
    );

    const vacio = screen.getByRole('status');
    expect(vacio).toHaveClass('border-0', 'bg-transparent', 'shadow-none', 'rounded-none');
    expect(vacio).not.toHaveClass('border-dashed', 'shadow-sm', 'rounded-2xl');
    const icono = vacio.querySelector('[data-slot="empty-icon"]') as HTMLElement;
    expect(icono).toHaveClass('size-10', 'text-text-secondary');
    expect(icono.className).not.toMatch(/\bring-8\b|\bsize-16\b/);
  });

  it.each([
    'app/dashboard/proyectos/[id]/miembros/postulaciones/page.tsx',
    'app/dashboard/proyectos/[id]/miembros/solicitudes-salida/page.tsx',
  ])('%s usa el vacío directo sobre la tarjeta', (ruta) => {
    const fuente = readFileSync(join(__dirname, '..', ruta), 'utf-8');
    expect(fuente).toMatch(/<Empty tone="flush" role="status">/);
    expect(fuente).toMatch(/<EmptyMedia variant="subtle">/);
    expect(fuente).not.toMatch(/<Empty tone="muted"/);
  });
});
