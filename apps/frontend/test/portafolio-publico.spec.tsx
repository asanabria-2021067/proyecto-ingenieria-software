import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const servicio = vi.hoisted(() => ({
  getPortafolioEstado: vi.fn(),
  actualizarPortafolio: vi.fn(),
  regenerarPortafolio: vi.fn(),
}));
vi.mock('@/lib/services/perfil-portafolio', () => servicio);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { PortafolioPublicoAjustes } from '@/components/profile/portafolio-publico-ajustes';
import { PortafolioPublicoVista } from '@/components/profile/portafolio-publico-vista';
import PortafolioPublicoPage, { generateMetadata } from '@/app/portafolio/[token]/page';

const TOKEN = 'B'.repeat(43);

function renderAjustes() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortafolioPublicoAjustes />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PortafolioPublicoAjustes', () => {
  it('desactivado: solo muestra el interruptor y activarlo manda activo=true', async () => {
    servicio.getPortafolioEstado.mockResolvedValue({ activo: false, indexable: false, token: null });
    servicio.actualizarPortafolio.mockResolvedValue({ activo: true, indexable: false, token: TOKEN });
    renderAjustes();
    const interruptor = await screen.findByRole('switch', { name: 'Portafolio público activo' });
    expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Enlace de tu portafolio público')).not.toBeInTheDocument();
    expect(screen.getByText(/Nunca muestra tu correo, carné, teléfono ni tus horas/)).toBeInTheDocument();
    fireEvent.click(interruptor);
    await waitFor(() => expect(servicio.actualizarPortafolio).toHaveBeenCalledWith({ activo: true }));
    expect(await screen.findByLabelText('Enlace de tu portafolio público')).toHaveValue(`${window.location.origin}/portafolio/${TOKEN}`);
  });

  it('activo: copia el enlace, genera uno nuevo y desactiva', async () => {
    servicio.getPortafolioEstado.mockResolvedValue({ activo: true, indexable: false, token: TOKEN });
    servicio.regenerarPortafolio.mockResolvedValue({ activo: true, indexable: false, token: 'C'.repeat(43) });
    servicio.actualizarPortafolio.mockResolvedValue({ activo: false, indexable: false, token: TOKEN });
    renderAjustes();
    fireEvent.click(await screen.findByRole('button', { name: /Copiar enlace/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/portafolio/${TOKEN}`));
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace nuevo/ }));
    await waitFor(() => expect(servicio.regenerarPortafolio).toHaveBeenCalled());
    expect(await screen.findByLabelText('Enlace de tu portafolio público')).toHaveValue(`${window.location.origin}/portafolio/${'C'.repeat(43)}`);
    fireEvent.click(screen.getByRole('switch', { name: 'Portafolio público activo' }));
    await waitFor(() => expect(servicio.actualizarPortafolio).toHaveBeenCalledWith({ activo: false }));
    await waitFor(() => expect(screen.queryByLabelText('Enlace de tu portafolio público')).not.toBeInTheDocument());
  });

  it('permitir indexar es opcional y arranca desmarcado', async () => {
    servicio.getPortafolioEstado.mockResolvedValue({ activo: true, indexable: false, token: TOKEN });
    servicio.actualizarPortafolio.mockResolvedValue({ activo: true, indexable: true, token: TOKEN });
    renderAjustes();
    const casilla = await screen.findByRole('checkbox', { name: /indexen mi portafolio/ });
    expect(casilla).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(casilla);
    await waitFor(() => expect(servicio.actualizarPortafolio).toHaveBeenCalledWith({ indexable: true }));
  });
});

const PORTAFOLIO = {
  nombre: 'Ana Paz',
  carrera: 'Ingeniería en Sistemas',
  habilidades: [{ nombre: 'TypeScript', nivel: 'AVANZADO', confirmaciones: 2 }],
  proyectos: [{ titulo: 'Huerto escolar', rol: 'Desarrolladora' }],
  indexable: false,
};

describe('PortafolioPublicoVista', () => {
  it('muestra nombre, carrera, habilidades con confirmaciones y proyectos cerrados', () => {
    render(<PortafolioPublicoVista portafolio={PORTAFOLIO} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Paz' })).toBeInTheDocument();
    expect(screen.getByText('Ingeniería en Sistemas')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Avanzado')).toBeInTheDocument();
    expect(screen.getByText('2 confirmaciones')).toBeInTheDocument();
    expect(screen.getByText('Huerto escolar')).toBeInTheDocument();
    expect(screen.getByText('Desarrolladora')).toBeInTheDocument();
  });

  it('no pinta ningún dato fuera de la lista blanca aunque llegue en la respuesta', () => {
    const sucio = { ...PORTAFOLIO, correo: 'ana@uvg.edu.gt', carne: '20123', telefono: '5555-5555', horasBeca: 80 };
    const { container } = render(<PortafolioPublicoVista portafolio={sucio} />);
    for (const privado of ['ana@uvg.edu.gt', '20123', '5555-5555', 'Horas', 'Correo', 'Carné']) {
      expect(container.textContent).not.toContain(privado);
    }
  });

  it('sin habilidades ni proyectos muestra mensajes vacíos', () => {
    render(<PortafolioPublicoVista portafolio={{ ...PORTAFOLIO, habilidades: [], proyectos: [] }} />);
    expect(screen.getByText('Sin habilidades registradas.')).toBeInTheDocument();
    expect(screen.getByText('Todavía no tiene proyectos cerrados.')).toBeInTheDocument();
  });
});

describe('página pública /portafolio/[token]', () => {
  const respuesta = (status: number, cuerpo: unknown = {}) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

  it('pide el portafolio sin cookies ni credenciales y por defecto no se indexa', async () => {
    const fetchMock = vi.fn().mockReturnValue(respuesta(200, PORTAFOLIO));
    vi.stubGlobal('fetch', fetchMock);
    const meta = await generateMetadata({ params: Promise.resolve({ token: TOKEN }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe('Portafolio de Ana Paz');
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toContain(`/api/publico/portafolio/${TOKEN}`);
    expect(opciones).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    expect(opciones.headers).not.toHaveProperty('Authorization');
    expect(opciones.headers).not.toHaveProperty('Cookie');
  });

  it('solo se indexa si la persona lo permitió', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(respuesta(200, { ...PORTAFOLIO, indexable: true })));
    const meta = await generateMetadata({ params: Promise.resolve({ token: 'D'.repeat(43) }) });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('un enlace desactivado o inexistente (404) responde not found y no se indexa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(respuesta(404)));
    const token = 'E'.repeat(43);
    await expect(PortafolioPublicoPage({ params: Promise.resolve({ token }) })).rejects.toThrow('NEXT_NOT_FOUND');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('un token con formato inválido ni siquiera llega al backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(PortafolioPublicoPage({ params: Promise.resolve({ token: '../etc/passwd' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
