import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const estado = vi.hoisted(() => ({ seguir: vi.fn() }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/descubrimiento', () => ({
  getMisSeguimientos: vi.fn().mockResolvedValue({ organizaciones: [], asociaciones: [] }),
  seguirOrganizacion: estado.seguir,
  dejarOrganizacion: vi.fn(),
  seguirAsociacion: vi.fn(),
  dejarAsociacion: vi.fn(),
}));

import { SeguirOrganizacionItem, useSeguirOrganizacion } from '@/components/organizations/boton-seguir';
import { aviso } from '@/lib/mensajes';

// Como la página: el hook vive fuera del menú, que desmonta el ítem al elegirlo.
function Pagina() {
  const seguir = useSeguirOrganizacion(7, 'Grupo Robotica');
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>Más</DropdownMenuTrigger>
      <DropdownMenuContent>
        <SeguirOrganizacionItem nombre="Grupo Robotica" {...seguir} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function abrirYSeguir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Pagina />
    </QueryClientProvider>,
  );
  fireEvent.keyDown(screen.getByText('Más'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Seguir Grupo Robotica' }));
}

describe('seguir desde el menú «Más»', () => {
  afterEach(cleanup);

  it('muestra el aviso de éxito aunque el menú se cierre', async () => {
    estado.seguir.mockResolvedValue({});
    abrirYSeguir();
    await waitFor(() => expect(aviso.exito).toHaveBeenCalledWith('Sigues a Grupo Robotica', expect.any(String)));
  });

  it('muestra el aviso de error aunque el menú se cierre', async () => {
    estado.seguir.mockRejectedValue(new Error('x'));
    abrirYSeguir();
    await waitFor(() => expect(aviso.error).toHaveBeenCalled());
  });
});
