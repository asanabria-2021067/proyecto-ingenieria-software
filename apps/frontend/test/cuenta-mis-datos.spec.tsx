import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/download-file', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/services/cuenta', async (original) => ({
  ...(await original<typeof import('@/lib/services/cuenta')>()),
  getMisDatos: vi.fn(),
}));

import { downloadBlob } from '@/lib/download-file';
import { aviso } from '@/lib/mensajes';
import { getMisDatos } from '@/lib/services/cuenta';
import { MisDatosSection } from '../components/profile/mis-datos-section';

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(MisDatosSection)));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-84: Descargar mis datos', () => {
  it('explica qué incluye y descarga el archivo mis-datos-uvgenius.json', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    vi.mocked(getMisDatos).mockResolvedValue(blob);
    montar();
    expect(screen.getByText(/No incluye contraseñas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'mis-datos-uvgenius.json'));
    expect(aviso.exito).toHaveBeenCalled();
  });

  it('con el límite de frecuencia (429) avisa que debe volver más tarde y no descarga', async () => {
    vi.mocked(getMisDatos).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 429 }));
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await waitFor(() =>
      expect(aviso.error).toHaveBeenCalledWith(
        'No se pudo descargar tus datos',
        'Alcanzaste el límite de descargas por hora. Vuelve a intentarlo más tarde.',
      ),
    );
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
