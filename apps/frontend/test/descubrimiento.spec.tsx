import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getNotificationLink } from '@/lib/services/notifications';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
// La tarjeta real trae sus propios hooks; aquí importa qué proyectos y qué chip se pintan.
vi.mock('@/components/projects/available-project-card', () => ({
  PROJECT_CARD_GRID: 'grid',
  AvailableProjectCardSkeleton: () => null,
  AvailableProjectCard: ({ proyecto }: { proyecto: { tituloProyecto: string; coincidencia?: { porcentaje: number } } }) => (
    <article>
      {proyecto.tituloProyecto}
      {proyecto.coincidencia && <span>{`Coincide ${proyecto.coincidencia.porcentaje}%`}</span>}
    </article>
  ),
}));

const base = { descripcionProyecto: '', estadoProyecto: 'PUBLICADO', modalidadProyecto: 'MIXTA', organizaciones: [], intereses: [], roles: [{ cupos: 1 }] };
const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => apiFetchMock.mockReset());
afterEach(cleanup);

describe('enlaces de notificaciones de descubrimiento', () => {
  it('proyecto nuevo y aviso de guardado abren el proyecto; sin id válido, Explorar', () => {
    for (const tipo of ['PROYECTO_NUEVO_PARA_TI', 'PROYECTO_GUARDADO_AVISO']) {
      expect(getNotificationLink({ tipoNotificacion: tipo, datosJson: { projectId: 7 } })).toBe('/dashboard/proyectos/7');
      expect(getNotificationLink({ tipoNotificacion: tipo, datosJson: { projectId: '../x' } })).toBe('/dashboard/proyectos');
    }
  });

  it('la invitación a un rol lleva a Mis postulaciones y la respuesta al líder, a su proyecto', () => {
    expect(getNotificationLink({ tipoNotificacion: 'INVITACION_ROL_PROYECTO', datosJson: { projectId: 7, invitationId: 3 } })).toBe('/dashboard/mis-postulaciones');
    expect(getNotificationLink({ tipoNotificacion: 'INVITACION_ROL_PROYECTO', datosJson: { idProyecto: 7, aceptada: true } })).toBe('/dashboard/proyectos/7');
  });
});

describe('Explorar: dueño y «Para ti»', () => {
  async function pagina() {
    apiFetchMock.mockImplementation(async (ruta: string) =>
      String(ruta).startsWith('/proyectos/para-ti')
        ? [{ ...base, idProyecto: 9, tituloProyecto: 'Match', tipoProyecto: 'ACADEMICO_EXPERIENCIA', coincidencia: { porcentaje: 80, interesesCompartidos: 0, coincideHabilidades: true } }]
        : [{ ...base, idProyecto: 1, tituloProyecto: 'Catálogo', tipoProyecto: 'ACADEMICO_EXPERIENCIA' }],
    );
    const { default: Page } = await import('../app/dashboard/proyectos/page');
    wrap(<Page />);
    await screen.findByRole('group', { name: 'Filtros de proyectos' });
  }

  it('reemplaza el filtro de organizaciones por el de dueño y ya no consulta /organizaciones', async () => {
    await pagina();
    expect(screen.getByRole('combobox', { name: 'Filtrar proyectos por dueño' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /organización/i })).not.toBeInTheDocument();
    expect(apiFetchMock.mock.calls.map(([ruta]) => ruta)).not.toContain('/organizaciones');
  });

  it('«Para ti» pide /proyectos/para-ti y muestra la coincidencia; al soltarlo vuelve al catálogo', async () => {
    await pagina();
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: 'Para ti' });
    expect(boton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(boton);
    await screen.findByText('Match');
    expect(screen.getByText('Coincide 80%')).toBeInTheDocument();
    expect(screen.queryByText('Catálogo')).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/proyectos/para-ti');

    fireEvent.click(screen.getByRole('button', { name: 'Para ti' }));
    await screen.findByText('Catálogo');
  });

  it('sin coincidencias ofrece completar el perfil', async () => {
    await pagina();
    apiFetchMock.mockImplementation(async () => []);
    fireEvent.click(screen.getByRole('button', { name: 'Para ti' }));
    await screen.findByText('Aún no hay proyectos para ti');
    expect(screen.getByRole('link', { name: 'Completar mi perfil' })).toHaveAttribute('href', '/dashboard/perfil');
  });
});

describe('MisInvitacionesRol', () => {
  const invitacion = {
    idInvitacionRol: 5,
    mensaje: 'Te necesitamos',
    creadaEn: '2026-11-01T00:00:00.000Z',
    invitadoPor: { idUsuario: 2, nombre: 'Ana', apellido: 'Paz', fotoUrl: null },
    rolProyecto: { idRolProyecto: 4, nombreRol: 'Backend', descripcionRolProyecto: null, proyecto: { idProyecto: 9, tituloProyecto: 'Feria', estadoProyecto: 'PUBLICADO' } },
  };

  it('no pinta nada sin invitaciones', async () => {
    apiFetchMock.mockResolvedValue([]);
    const { MisInvitacionesRol } = await import('@/components/projects/mis-invitaciones-rol');
    const { container } = wrap(<MisInvitacionesRol />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/invitaciones-rol/mias'));
    expect(container).toBeEmptyDOMElement();
  });

  it('lista la invitación y la acepta o rechaza por su ruta', async () => {
    apiFetchMock.mockImplementation(async (ruta: string) => (ruta === '/invitaciones-rol/mias' ? [invitacion] : {}));
    const { MisInvitacionesRol } = await import('@/components/projects/mis-invitaciones-rol');
    wrap(<MisInvitacionesRol />);
    expect(await screen.findByText(/Backend en/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feria' })).toHaveAttribute('href', '/dashboard/proyectos/9');

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/invitaciones-rol/5/aceptar', { method: 'POST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/invitaciones-rol/5/rechazar', { method: 'POST' }));
  });
});

describe('BotonSeguir', () => {
  it('sigue y deja de seguir por la ruta de su tipo', async () => {
    apiFetchMock.mockResolvedValue({});
    const { BotonSeguir } = await import('@/components/organizations/boton-seguir');
    const { rerender } = wrap(<BotonSeguir tipo="asociacion" id={3} nombre="AECC" siguiendo={false} />);
    const boton = screen.getByRole('button', { name: 'Seguir AECC' });
    expect(boton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(boton);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/seguimientos/asociaciones/3', { method: 'POST' }));

    const client = new QueryClient();
    rerender(
      <QueryClientProvider client={client}>
        <BotonSeguir tipo="organizacion" id={8} nombre="Robotica" siguiendo />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dejar de seguir Robotica' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/seguimientos/organizaciones/8', { method: 'DELETE' }));
  });
});
