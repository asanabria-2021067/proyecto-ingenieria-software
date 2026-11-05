import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const servicio = vi.hoisted(() => ({ getResumenSemestre: vi.fn() }));
vi.mock('@/lib/services/perfil-portafolio', () => servicio);
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { nombre: 'Ana', apellido: 'Paz', correo: 'ana@uvg.edu.gt', perfil: { carne: '20123' } } }),
}));
const descarga = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/download-file', () => descarga);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));

import { MiSemestreCard } from '@/components/profile/mi-semestre-card';
import { crearTarjetaSemestrePng, textosTarjeta } from '@/lib/perfil/semestre-card-png';

const RESUMEN = {
  semestre: { anio: 2026, periodo: 2 as const },
  horasAcreditadas: 35,
  proyectos: 3,
  tareasCompletadas: 11,
  reconocimientos: 2,
  insignias: [{ clave: 'tareas', nombre: 'Constante', nivel: 'BRONCE' }],
};

const textosDibujados: string[] = [];
const blobPng = new Blob(['png'], { type: 'image/png' });

beforeEach(() => {
  textosDibujados.length = 0;
  const ctx = new Proxy(
    { fillText: (t: string) => textosDibujados.push(t) },
    { get: (obj, prop) => (prop in obj ? (obj as Record<string, unknown>)[prop as string] : () => undefined), set: () => true },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blobPng));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTarjeta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MiSemestreCard />
    </QueryClientProvider>,
  );
}

describe('MiSemestreCard', () => {
  it('muestra horas, proyectos, tareas, reconocimientos e insignias del semestre', async () => {
    servicio.getResumenSemestre.mockResolvedValue(RESUMEN);
    renderTarjeta();
    expect(await screen.findByRole('heading', { name: 'Mi semestre en UVGenius' })).toBeInTheDocument();
    expect(screen.getByText('2.º semestre 2026')).toBeInTheDocument();
    expect(screen.getByText('35 h')).toBeInTheDocument();
    expect(screen.getByText('Proyectos')).toBeInTheDocument();
    expect(screen.getByText('Tareas completadas')).toBeInTheDocument();
    expect(screen.getByText('Reconocimientos')).toBeInTheDocument();
    expect(screen.getByText('Constante')).toBeInTheDocument();
  });

  it('descargar imagen genera el PNG y lo baja con un nombre que incluye el semestre', async () => {
    servicio.getResumenSemestre.mockResolvedValue(RESUMEN);
    renderTarjeta();
    fireEvent.click(await screen.findByRole('button', { name: /Descargar imagen/ }));
    await waitFor(() => expect(descarga.downloadBlob).toHaveBeenCalledWith(blobPng, 'mi-semestre-uvgenius-2026-2.png'));
  });
});

describe('crearTarjetaSemestrePng', () => {
  it('dibuja las cifras y nunca correo, carné ni teléfono', async () => {
    await crearTarjetaSemestrePng(RESUMEN, 'Ana Paz');
    const texto = textosDibujados.join(' | ');
    for (const esperado of ['MI SEMESTRE EN UVGENIUS', 'Ana Paz', '35 h', 'Proyectos', 'Tareas completadas', 'Reconocimientos', 'Constante']) {
      expect(texto).toContain(esperado);
    }
    for (const privado of ['ana@uvg.edu.gt', '20123', 'carné', 'correo', 'teléfono']) {
      expect(texto.toLowerCase()).not.toContain(privado.toLowerCase());
    }
  });

  it('textosTarjeta usa singular y el texto de sin insignias', () => {
    const t = textosTarjeta({ ...RESUMEN, proyectos: 1, reconocimientos: 1, tareasCompletadas: 1, insignias: [] }, 'Ana Paz');
    expect(t.cifras.map((c) => c.etiqueta)).toEqual(['Horas acreditadas', 'Proyecto', 'Tarea completada', 'Reconocimiento']);
    expect(t.insignias).toBe('Sin insignias nuevas este semestre');
  });

  it('falla con un error claro si el navegador no puede crear el canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(crearTarjetaSemestrePng(RESUMEN, 'Ana')).rejects.toThrow('generar la imagen');
  });
});
