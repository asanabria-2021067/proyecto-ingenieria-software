import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/swal', () => ({
  default: {
    fire: vi.fn(),
  },
}));

vi.mock('@/lib/services/admin', () => ({
  listPasswordResetRequests: vi.fn(),
  generatePasswordResetLink: vi.fn(),
}));

import uvgSwal from '@/lib/swal';
import { listPasswordResetRequests, generatePasswordResetLink } from '@/lib/services/admin';
import AdminSolicitudesRecuperacionPage from '../app/dashboard/admin/solicitudes-recuperacion/page';

const SOLICITUD = {
  idSolicitud: 1,
  carneReferencia: '20231234',
  correoReferencia: 'estudiante@uvg.edu.gt',
  estado: 'PENDIENTE' as const,
  creadaEn: '2026-08-01T10:00:00.000Z',
  usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Perez', correo: 'ana@uvg.edu.gt' },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(AdminSolicitudesRecuperacionPage)));
}

/** Renderiza la página y genera el enlace para la única solicitud pendiente. */
async function generarEnlace() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /generar enlace/i }));
  return screen.findByRole('button', { name: /copiar/i });
}

describe('AdminSolicitudesRecuperacionPage', () => {
  beforeEach(() => {
    vi.mocked(listPasswordResetRequests).mockResolvedValue([SOLICITUD]);
    vi.mocked(generatePasswordResetLink).mockResolvedValue({
      resetUrl: 'https://uvgenius.com/reset-password?token=abc123',
      resetToken: 'abc123',
      // 30 minutos en el futuro: dentro del rango que formatVigencia formatea como hora.
      expiraEn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra la vigencia real del token (no un texto fijo de "1 hora")', async () => {
    await generarEnlace();

    const vigenciaEsperada = new Intl.DateTimeFormat('es-GT', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(Date.now() + 30 * 60 * 1000),
    );

    expect(screen.getByText(new RegExp(`Válido hasta las ${vigenciaEsperada}`))).toBeInTheDocument();
    expect(screen.queryByText(/Válido por 1 hora/i)).not.toBeInTheDocument();
  });

  it('avisa que el enlace ya expiró cuando expiraEn quedó en el pasado', async () => {
    vi.mocked(generatePasswordResetLink).mockResolvedValue({
      resetUrl: 'https://uvgenius.com/reset-password?token=viejo',
      resetToken: 'viejo',
      expiraEn: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    await generarEnlace();

    expect(screen.getByText(/Este enlace ya expiró/i)).toBeInTheDocument();
  });

  it('contexto seguro: copia con la Clipboard API y muestra confirmación visible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const copiarBtn = await generarEnlace();
    fireEvent.click(copiarBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://uvgenius.com/reset-password?token=abc123'));
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'success', title: 'Enlace copiado' }),
    );

    delete (navigator as any).clipboard;
  });

  it('contexto no seguro: sin Clipboard API, usa execCommand y aun así confirma la copia', async () => {
    delete (navigator as any).clipboard;
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const copiarBtn = await generarEnlace();
    fireEvent.click(copiarBtn);

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'success', title: 'Enlace copiado' }),
    );
  });

  it('fallback manual: sin Clipboard API ni execCommand, selecciona el input para copiar a mano', async () => {
    delete (navigator as any).clipboard;
    document.execCommand = vi.fn().mockReturnValue(false);

    const copiarBtn = await generarEnlace();
    const input = screen.getByDisplayValue('https://uvgenius.com/reset-password?token=abc123') as HTMLInputElement;
    const selectSpy = vi.spyOn(input, 'select');

    fireEvent.click(copiarBtn);

    await waitFor(() => expect(selectSpy).toHaveBeenCalled());
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'warning', title: 'Copia manual requerida' }),
    );
  });
});
