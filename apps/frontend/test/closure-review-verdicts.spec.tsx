import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({ default: { fire: swalFire }, swalCustomClass: {} }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/services/admin-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-projects')>();
  return { ...actual, getAdminProjects: vi.fn(), getAdminProjectDetail: vi.fn() };
});
vi.mock('../lib/services/closure', () => ({
  getClosureDocumentReadGrant: vi.fn(),
  fetchClosureDocumentBytes: vi.fn(),
  prepareClosure: vi.fn(),
  getCloseReadiness: vi.fn(),
  generateAutoReport: vi.fn(),
  reserveClosureDocument: vi.fn(),
  uploadClosureDocument: vi.fn(),
  detachClosureDocument: vi.fn(),
  requestClose: vi.fn(),
  resubmitClosure: vi.fn(),
  getClosureRevisions: vi.fn(),
  getClosureRevision: vi.fn(),
}));
vi.mock('../lib/services/closure-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/closure-review')>();
  return { ...actual, returnToExecution: vi.fn(), requestCorrection: vi.fn(), approveClosure: vi.fn() };
});

import ClosureReviewClient from '../app/dashboard/admin/proyectos/[id]/cierre/closure-review-client';
import { getAdminProjectDetail } from '../lib/services/admin-projects';
import { getCloseReadiness, getClosureRevision, getClosureRevisions } from '../lib/services/closure';
import { approveClosure, requestCorrection, returnToExecution } from '../lib/services/closure-review';
import { adminProjectsPrefix } from '../lib/query-keys/admin-projects';
import type { AdminProjectDetail } from '../lib/types/admin-projects';
import type { CloseReadinessSummary, ClosureRevision } from '../lib/types/closure';

const FINGERPRINT_ENTREGA = 'a'.repeat(64);
const FINGERPRINT_INFORME = 'b'.repeat(64);

function detalle(overrides: Partial<AdminProjectDetail['resumen']> = {}): AdminProjectDetail {
  return {
    projectId: 123,
    resumen: {
      idProyecto: 123,
      tituloProyecto: 'Sistema de Tutorías Académicas UVG',
      descripcionProyecto: 'Plataforma de tutorías.',
      tipoProyecto: 'DESARROLLO',
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
      creador: { idUsuario: 1, nombre: 'Víctor', apellido: 'Hernández' },
      ...overrides,
    },
    liderazgo: { liderActual: { idUsuario: 1, nombre: 'Víctor', apellido: 'Hernández' }, historial: [] },
    miembros: [
      { idParticipacion: 1, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 1, nombre: 'Víctor', apellido: 'Hernández' }, rolProyecto: { idRolProyecto: 1, nombreRol: 'Líder' } },
    ],
    sprints: [{ idSprint: 1, numero: 1, estado: 'CERRADO' }],
    permisos: { puedeEditar: false, puedeOperar: false },
    lector: { perfil: 'ADMIN', sprintEstados: ['CERRADO'] },
  };
}

function revision(overrides: Partial<ClosureRevision> = {}): ClosureRevision {
  return {
    idRevisionCierre: 55,
    idProyecto: 123,
    numeroRevision: 1,
    estadoRevision: 'ENVIADA',
    idSolicitante: 1,
    enviadaEn: '2026-08-12T12:00:00.000Z',
    fingerprintEntrega: FINGERPRINT_ENTREGA,
    idRevisor: null,
    comentarioRevisor: null,
    resueltaEn: null,
    idDocumentoOficial: null,
    creadaEn: '2026-08-10T12:00:00.000Z',
    documentosEnviados: [
      { idDocumentoCierre: 900, tipoDocumento: 'INFORME_AUTOMATICO', nombreArchivo: 'informe.pdf', tamanoBytes: 2048, checksumSha256: FINGERPRINT_INFORME, orden: 0 },
      { idDocumentoCierre: 901, tipoDocumento: 'EVIDENCIA_LIDER', nombreArchivo: 'evidencia-1.pdf', tamanoBytes: 1024, checksumSha256: null, orden: 1 },
      { idDocumentoCierre: 902, tipoDocumento: 'EVIDENCIA_LIDER', nombreArchivo: 'evidencia-2.pdf', tamanoBytes: 1024, checksumSha256: null, orden: 2 },
    ],
    informeOficial: null,
    puedeEditar: false,
    puedeEnviar: false,
    puedeResolver: true,
    ...overrides,
  };
}

function readiness(): CloseReadinessSummary {
  return {
    projectId: 123,
    revisionId: 55,
    phase: 'APPROVE',
    canSubmit: true,
    blockers: [],
    warnings: [],
    executionFingerprint: FINGERPRINT_INFORME,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderReview() {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(createElement(ClosureReviewClient, { id: 123 }), { wrapper });
  return { ...utils, queryClient };
}

async function abrirVeredicto(nombre: string) {
  // El botón se remonta al habilitarse (sale del wrapper con tooltip): consultar siempre de nuevo.
  await waitFor(() => expect(screen.getByRole('button', { name: nombre })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  (getAdminProjectDetail as any).mockResolvedValue(detalle());
  (getCloseReadiness as any).mockResolvedValue(readiness());
  (getClosureRevisions as any).mockResolvedValue({ page: 1, limit: 20, total: 1, items: [revision()] });
  (getClosureRevision as any).mockResolvedValue(revision());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-14 — revisión administrativa del cierre (F016)', () => {
  it('muestra la entrega ENVIADA, pide el readiness en fase APPROVE y monta los documentos en solo lectura sin regenerar', async () => {
    renderReview();
    expect(await screen.findByText(/Envío #1/)).toBeInTheDocument();
    await waitFor(() => expect(getCloseReadiness).toHaveBeenCalledWith(123, 'APPROVE'));
    expect(await screen.findByText('2 archivos adjuntos · Máximo 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver informe/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar|Regenerar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subir|Adjuntar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar|Eliminar/ })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('Devolver a ejecución exige comentario y llama a rechazar-cierre con ReturnExecutionDto sin legacy', async () => {
    (returnToExecution as any).mockResolvedValue({ projectId: 123, estadoProyecto: 'EN_PROGRESO' });
    renderReview();
    await abrirVeredicto('Devolver a ejecución');
    const confirmar = screen.getAllByRole('button', { name: 'Devolver a ejecución' }).at(-1)!;
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Comentario para el líder/), { target: { value: 'Faltan horas por revisar.' } });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);
    await waitFor(() => expect(returnToExecution).toHaveBeenCalledWith(123, { revisionId: 55, comentario: 'Faltan horas por revisar.' }));
    expect((returnToExecution as any).mock.calls[0][1]).not.toHaveProperty('legacy');
  });

  it('Solicitar corrección documental exige comentario y llama a correccion-documental con CorrectionDto', async () => {
    (requestCorrection as any).mockResolvedValue({ projectId: 123, estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    renderReview();
    await abrirVeredicto('Solicitar corrección documental');
    const confirmar = screen.getByRole('button', { name: 'Solicitar corrección' });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Qué debe corregir el líder/), { target: { value: 'Adjunta la evidencia final.' } });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);
    await waitFor(() => expect(requestCorrection).toHaveBeenCalledWith(123, { revisionId: 55, comentario: 'Adjunta la evidencia final.' }));
  });

  it('Aprobar cierre acepta comentario opcional, envía el fingerprint de la ENTREGA (no el del informe) e invalida la bandeja admin', async () => {
    (approveClosure as any).mockResolvedValue({ projectId: 123, estadoProyecto: 'CERRADO' });
    const { queryClient } = renderReview();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    await abrirVeredicto('Aprobar cierre');
    const confirmar = screen.getAllByRole('button', { name: 'Aprobar cierre' }).at(-1)!;
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(approveClosure).toHaveBeenCalledWith(123, { revisionId: 55, expectedFingerprint: FINGERPRINT_ENTREGA, comentario: undefined }),
    );
    expect((approveClosure as any).mock.calls[0][1].expectedFingerprint).not.toBe(FINGERPRINT_INFORME);
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminProjectsPrefix }));
    await waitFor(() => expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' })));
  });

  it('409 muestra que otro administrador resolvió, recarga y NO reintenta', async () => {
    (requestCorrection as any).mockRejectedValue(Object.assign(new Error('conflicto'), { statusCode: 409 }));
    renderReview();
    await abrirVeredicto('Solicitar corrección documental');
    fireEvent.change(screen.getByLabelText(/Qué debe corregir el líder/), { target: { value: 'Corrige.' } });
    const confirmar = screen.getByRole('button', { name: 'Solicitar corrección' });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);
    await waitFor(() => expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringMatching(/Otro administrador resolvió/) })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestCorrection).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getClosureRevisions).toHaveBeenCalledTimes(2));
  });

  it('503 al aprobar deja claro que el proyecto NO se cerró y nunca muestra éxito', async () => {
    (approveClosure as any).mockRejectedValue(Object.assign(new Error('storage'), { statusCode: 503 }));
    renderReview();
    await abrirVeredicto('Aprobar cierre');
    const confirmar = screen.getAllByRole('button', { name: 'Aprobar cierre' }).at(-1)!;
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/NO se cerró/);
    expect(swalFire).not.toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(approveClosure).toHaveBeenCalledTimes(1);
  });

  it('con comprobaciones pendientes: ámbar solo en lo incompleto, acceso directo a la categoría y aviso junto a los veredictos', async () => {
    (getCloseReadiness as any).mockResolvedValue({
      ...readiness(),
      canSubmit: false,
      blockers: [
        { code: 'HORAS_SIN_CONSOLIDAR', message: 'Hay horas sin consolidar', cantidad: 2, ids: [7, 8] },
        { code: 'EVIDENCIAS_INVALIDAS', message: 'La entrega necesita entre una y diez evidencias disponibles en PDF', cantidad: 0, ids: [] },
      ],
    });
    renderReview();

    expect(await screen.findByText('14 de 16')).toBeInTheDocument();
    // Solo las dos categorías incompletas llevan el contador en ámbar.
    const horas = screen.getByRole('button', { name: 'Horas: 4 de 5' });
    const sprints = screen.getByRole('button', { name: 'Sprints: 2 de 2' });
    expect(within(horas).getByText('4 de 5')).toHaveClass('pill', 'pill-amber');
    expect(within(sprints).getByText('2 de 2')).not.toHaveClass('pill-amber');
    expect(document.querySelectorAll('[data-slot="accordion-trigger"] .pill-amber')).toHaveLength(2);
    // El texto del progreso le habla al revisor, no al líder que envía.
    expect(screen.queryByText(/habilitar el envío|puedes enviar/)).not.toBeInTheDocument();
    expect(screen.getByText(/revísalas antes de emitir el veredicto/)).toBeInTheDocument();

    // Acceso directo: abre la categoría pendiente y muestra el mensaje del backend.
    expect(horas).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Ver pendientes de Horas' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Horas: 4 de 5' })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText('Hay horas sin consolidar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver pendientes de Sprints' })).not.toBeInTheDocument();

    // La regla no cambia: «Aprobar cierre» sigue disponible (el servidor decide); solo se avisa.
    const veredictos = screen.getByRole('region', { name: 'Veredictos de la revisión' });
    await waitFor(() => expect(within(veredictos).getByRole('button', { name: 'Aprobar cierre' })).not.toBeDisabled());
    expect(within(veredictos).getByText('2 pendientes')).toHaveClass('pill-amber');
    expect(veredictos).toHaveTextContent(/La aprobación se rechazará mientras existan comprobaciones pendientes/);
  });

  it('sin pendientes no hay avisos ámbar ni accesos directos; pestañas y veredictos van sin iconos', async () => {
    renderReview();
    expect(await screen.findByText('16 de 16')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="closure-pendientes"]')).toBeNull();
    expect(document.querySelector('[data-slot="veredicto-pendientes"]')).toBeNull();

    const pestanas = screen.getAllByRole('tab');
    expect(pestanas.map((p) => p.textContent)).toEqual(['Documentos', 'Resumen', 'Miembros', 'Sprints']);
    for (const pestana of pestanas) {
      expect(pestana.querySelector('svg')).toBeNull();
      expect(pestana).toHaveClass('data-[state=active]:after:bg-primary');
    }
    const veredictos = screen.getByRole('region', { name: 'Veredictos de la revisión' });
    expect(veredictos.querySelector('svg')).toBeNull();
  });

  it('Documentos distingue los obligatorios entregados de los archivos adjuntos y no da instrucciones de subida al administrador', async () => {
    (getClosureRevision as any).mockResolvedValue(
      revision({ documentosEnviados: [{ idDocumentoCierre: 901, tipoDocumento: 'EVIDENCIA_LIDER', nombreArchivo: 'evidencia-1.pdf', tamanoBytes: 1024, checksumSha256: null, orden: 1 }] }),
    );
    renderReview();
    expect(await screen.findByText('1 archivo adjunto · Máximo 10')).toBeInTheDocument();
    const docs = screen.getByRole('region', { name: 'Documentos del cierre' });
    expect(within(docs).getAllByText('Obligatorio')).toHaveLength(2);
    // Falta el informe (ámbar); la evidencia sí está entregada.
    expect(within(docs).getByText('Pendiente')).toHaveClass('pill-amber');
    expect(within(docs).getByText('Entregado')).toHaveClass('pill-success');
    expect(within(docs).queryByText(/^Adjunta capturas/)).not.toBeInTheDocument();
    expect(within(docs).getByText(/adjuntado por el líder/)).toBeInTheDocument();
  });

  it('Resumen deja la huella y los identificadores internos en un apartado técnico plegado', async () => {
    renderReview();
    await screen.findByText(/Envío #1/);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Resumen' }));
    const tecnico = (await screen.findByText('Datos técnicos de auditoría')).closest('details')!;
    expect(tecnico).not.toHaveAttribute('open');
    expect(within(tecnico).getByText(FINGERPRINT_ENTREGA)).toBeInTheDocument();
    expect(within(tecnico).getByText(FINGERPRINT_INFORME)).toBeInTheDocument();
    expect(within(tecnico).getByText('55')).toBeInTheDocument();
    expect(screen.getByText('Máximo 10')).toBeInTheDocument();
  });

  it('fuera de EN_SOLICITUD_CIERRE los tres veredictos quedan deshabilitados', async () => {
    (getAdminProjectDetail as any).mockResolvedValue(detalle({ estadoProyecto: 'EN_PROGRESO' }));
    (getClosureRevisions as any).mockResolvedValue({ page: 1, limit: 20, total: 1, items: [revision({ estadoRevision: 'DEVUELTA', comentarioRevisor: 'Faltan horas.' })] });
    renderReview();
    expect(await screen.findByText('Faltan horas.')).toBeInTheDocument();
    for (const nombre of ['Devolver a ejecución', 'Solicitar corrección documental', 'Aprobar cierre']) {
      expect(screen.getByRole('button', { name: nombre })).toBeDisabled();
    }
    expect(getCloseReadiness).not.toHaveBeenCalled();
  });
});
