import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/horas-semestre', () => ({
  getHorasProgreso: vi.fn(),
  getHorasActual: vi.fn(),
  getHorasHistorial: vi.fn(),
  putHorasActual: vi.fn(),
}));
const USUARIO = { data: { perfil: { horasBecaRequeridas: 150, horasExtensionRequeridas: null } } };
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => USUARIO }));

import { SemestreHorasCard } from '../components/hours/semestre-horas-card';
import { SemestreHorasHistorial } from '../components/hours/semestre-horas-historial';
import {
  getHorasActual,
  getHorasHistorial,
  getHorasProgreso,
  putHorasActual,
  type HorasProgreso,
  type TramoProgreso,
} from '../lib/services/horas-semestre';

const SEMESTRE = { anio: 2026, periodo: 2 as const, inicio: '2026-07-01', fin: '2026-12-31' };

const tramo = (p: Partial<TramoProgreso> = {}): TramoProgreso => ({
  meta: null,
  declaradas: 0,
  acreditadas: 0,
  avance: 0,
  falta: null,
  fechaProyectada: null,
  enRiesgo: false,
  ...p,
});

const progreso = (p: Partial<HorasProgreso> = {}): HorasProgreso => ({
  semestre: SEMESTRE,
  beca: tramo({ meta: 100, declaradas: 10, acreditadas: 20, avance: 30, falta: 70, fechaProyectada: '2026-11-25' }),
  extension: tramo(),
  ...p,
});

function montar(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HRS: tarjeta del semestre actual', () => {
  it('separa declaradas de acreditadas y muestra la proyeccion dd/mm/aaaa', async () => {
    vi.mocked(getHorasProgreso).mockResolvedValue(progreso());
    montar(<SemestreHorasCard />);

    const seccion = await screen.findByRole('region', { name: 'Horas de este semestre' });
    expect(within(seccion).getByText('2.º semestre 2026')).toBeInTheDocument();
    expect(within(seccion).getByText('Declaradas por ti').nextSibling).toHaveTextContent('10 h');
    expect(within(seccion).getByText('Acreditadas en UVGenius').nextSibling).toHaveTextContent('20 h');
    expect(within(seccion).getByText('30 h')).toBeInTheDocument();
    expect(within(seccion).getByText('A este ritmo completas tus horas beca el 25/11/2026')).toBeInTheDocument();
    expect(within(seccion).queryByText(/extensión/i)).toBeNull();
    expect(within(seccion).queryByRole('button', { name: /Editar horas/ })).toBeNull();
  });

  it('marca En riesgo', async () => {
    vi.mocked(getHorasProgreso).mockResolvedValue(progreso({ beca: tramo({ meta: 100, avance: 5, falta: 95, enRiesgo: true }) }));
    montar(<SemestreHorasCard />);
    expect(await screen.findByText('En riesgo')).toHaveClass('pill');
  });

  it('sin metas ni avance invita a declararlas', async () => {
    vi.mocked(getHorasProgreso).mockResolvedValue(progreso({ beca: tramo() }));
    montar(<SemestreHorasCard editable />);
    expect(await screen.findByText(/Aún no registras tus metas/)).toBeInTheDocument();
  });

  it('si el servicio falla no pinta nada', async () => {
    vi.mocked(getHorasProgreso).mockRejectedValue(new Error('x'));
    const { container } = montar(<SemestreHorasCard />);
    await waitFor(() => expect(getHorasProgreso).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('editar abre el registro del semestre con la meta del perfil y guarda', async () => {
    vi.mocked(getHorasProgreso).mockResolvedValue(progreso());
    vi.mocked(getHorasActual).mockResolvedValue({ semestre: SEMESTRE, registro: null, necesitaRegistro: true });
    vi.mocked(putHorasActual).mockResolvedValue({ metaBeca: 150, becaDeclarada: 12, metaExtension: null, extensionDeclarada: 0 });
    montar(<SemestreHorasCard editable />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar horas/ }));
    const meta = await screen.findByLabelText('¿Cuántas horas beca debes completar este semestre?');
    await waitFor(() => expect(meta).toHaveValue(150));
    const declaradas = screen.getAllByLabelText('¿Cuántas llevas ya este semestre?')[0];
    fireEvent.change(declaradas, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(putHorasActual).toHaveBeenCalledWith({ metaBeca: 150, becaDeclarada: 12, metaExtension: null, extensionDeclarada: 0 }),
    );
  });

  it('no deja guardar valores invalidos', async () => {
    vi.mocked(getHorasProgreso).mockResolvedValue(progreso());
    vi.mocked(getHorasActual).mockResolvedValue({ semestre: SEMESTRE, registro: null, necesitaRegistro: true });
    montar(<SemestreHorasCard editable />);
    fireEvent.click(await screen.findByRole('button', { name: /Editar horas/ }));
    const declaradas = (await screen.findAllByLabelText('¿Cuántas llevas ya este semestre?'))[0];
    fireEvent.change(declaradas, { target: { value: '-4' } });
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(screen.getByText('Escribe un número entero entre 0 y 2000')).toBeInTheDocument();
  });
});

describe('HRS: desglose por semestre', () => {
  it('lista cada semestre con declaradas y acreditadas', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue([
      { semestre: SEMESTRE, metaBeca: 100, becaDeclarada: 10, becaAcreditada: 20, metaExtension: null, extensionDeclarada: 0, extensionAcreditada: 4 },
      { semestre: { ...SEMESTRE, periodo: 1, inicio: '2026-01-01', fin: '2026-06-30' }, metaBeca: null, becaDeclarada: 0, becaAcreditada: 0, metaExtension: 40, extensionDeclarada: 8, extensionAcreditada: 0 },
    ]);
    montar(<SemestreHorasHistorial />);
    const tabla = (await screen.findAllByRole('table'))[0];
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3);
    expect(within(filas[1]).getByText('2.º semestre 2026')).toBeInTheDocument();
    expect(within(filas[2]).getByText('1.er semestre 2026')).toBeInTheDocument();
  });

  it('sin historial no renderiza', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue([]);
    const { container } = montar(<SemestreHorasHistorial />);
    await waitFor(() => expect(getHorasHistorial).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
