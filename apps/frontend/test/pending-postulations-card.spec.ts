import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PendingPostulationsCard } from '../components/projects/pending-postulations-card';
import { PendingExitRequestsCard } from '../components/projects/pending-exit-requests-card';
import { PROJECT_ACTION_BUTTON_CLASS } from '../components/projects/project-action-button';

afterEach(() => cleanup());

// Los accesos de Miembros son el mismo botón negro que «Ver proyecto», sin
// contador (vive en la vista dedicada) y con una flecha: llevan a otra vista.
describe.each([
  {
    nombre: 'PendingPostulationsCard — F13.1 entry point',
    componente: PendingPostulationsCard,
    accesible: /ver postulaciones pendientes/i,
    texto: 'Postulaciones pendientes',
    href: '/dashboard/proyectos/42/miembros/postulaciones',
  },
  {
    nombre: 'PendingExitRequestsCard — F14.2 entry point',
    componente: PendingExitRequestsCard,
    accesible: /ver solicitudes de salida pendientes/i,
    texto: 'Solicitudes de salida',
    href: '/dashboard/proyectos/42/miembros/solicitudes-salida',
  },
])('$nombre', ({ componente, accesible, texto, href }) => {
  it('navega a la vista dedicada', () => {
    render(createElement(componente, { idProyecto: 42 }));
    expect(screen.getByRole('link', { name: accesible })).toHaveAttribute('href', href);
  });

  it('usa el botón de acción de «Ver proyecto», con su texto y una flecha de navegación al final', () => {
    render(createElement(componente, { idProyecto: 42 }));
    const enlace = screen.getByRole('link', { name: accesible });
    expect(enlace).toHaveClass(...PROJECT_ACTION_BUTTON_CLASS.split(' '));
    expect(enlace).toHaveTextContent(new RegExp(`^${texto}$`));
    const iconos = enlace.querySelectorAll('svg');
    expect(iconos).toHaveLength(1);
    expect(iconos[0]).toHaveClass('lucide-arrow-right', 'size-3.5');
    expect(iconos[0]).toHaveAttribute('aria-hidden', 'true');
    expect(enlace.lastElementChild).toBe(iconos[0]);
  });

  it('no comunica expansión ni renderiza el listado inline', () => {
    render(createElement(componente, { idProyecto: 42 }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
