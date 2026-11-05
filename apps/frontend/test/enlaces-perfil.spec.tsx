import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const servicio = vi.hoisted(() => ({ getEnlacesPerfil: vi.fn(), guardarEnlacesPerfil: vi.fn() }));
vi.mock('@/lib/services/perfil-portafolio', () => servicio);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
// La tarjeta importa el hook del chat; aquí no se usa.
vi.mock('@/hooks/use-chat', () => ({ useLinkPreview: vi.fn() }));

import { EnlacesPerfilSeccion, esEnlaceValido } from '@/components/profile/enlaces-perfil';

const ENLACES = [
  { idEnlace: 1, url: 'https://github.com/ana', tipo: 'GITHUB', titulo: 'ana (Ana Paz)', sitio: 'GitHub' },
  { idEnlace: 2, url: 'https://ana.dev/', tipo: 'SITIO', titulo: null, sitio: 'ana.dev' },
];

function renderSeccion(propio: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EnlacesPerfilSeccion idUsuario={7} propio={propio} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('esEnlaceValido', () => {
  it('solo https con dominio', () => {
    expect(esEnlaceValido('https://github.com/ana')).toBe(true);
    expect(esEnlaceValido('http://github.com/ana')).toBe(false);
    expect(esEnlaceValido('javascript:alert(1)')).toBe(false);
    expect(esEnlaceValido('https://localhost')).toBe(false);
    expect(esEnlaceValido('github.com/ana')).toBe(false);
  });
});

describe('EnlacesPerfilSeccion', () => {
  it('muestra la vista previa (sitio, título, enlace seguro) de cada enlace', async () => {
    servicio.getEnlacesPerfil.mockResolvedValue(ENLACES);
    renderSeccion(false);
    const github = await screen.findByRole('link', { name: /ana \(Ana Paz\)/ });
    expect(github).toHaveAttribute('href', 'https://github.com/ana');
    expect(github).toHaveAttribute('target', '_blank');
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Editar enlaces' })).not.toBeInTheDocument();
  });

  it('en el perfil ajeno sin enlaces no muestra la sección', async () => {
    servicio.getEnlacesPerfil.mockResolvedValue([]);
    const { container } = renderSeccion(false);
    await waitFor(() => expect(servicio.getEnlacesPerfil).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });

  it('propio: edita, valida https y guarda la lista', async () => {
    servicio.getEnlacesPerfil.mockResolvedValue(ENLACES);
    servicio.guardarEnlacesPerfil.mockResolvedValue([ENLACES[0]]);
    renderSeccion(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar enlaces' }));
    expect(screen.getByLabelText('Enlace 1')).toHaveValue('https://github.com/ana');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar enlace 2' }));
    fireEvent.change(screen.getByLabelText('Enlace 1'), { target: { value: 'http://inseguro.com' } });
    expect(screen.getByRole('alert')).toHaveTextContent('https://');
    expect(screen.getByRole('button', { name: 'Guardar enlaces' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Enlace 1'), { target: { value: 'https://github.com/ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar enlaces' }));
    await waitFor(() => expect(servicio.guardarEnlacesPerfil).toHaveBeenCalledWith(['https://github.com/ana']));
  });

  it('propio: el límite de 5 enlaces deshabilita agregar más', async () => {
    servicio.getEnlacesPerfil.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ idEnlace: i, url: `https://s${i}.dev/`, tipo: 'SITIO', titulo: null, sitio: `s${i}.dev` })),
    );
    renderSeccion(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar enlaces' }));
    expect(screen.getByRole('button', { name: 'Agregar enlace' })).toBeDisabled();
  });
});
