import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../components/closure/closure-document-viewer', () => ({
  ClosureDocumentViewer: () => null,
  formatearTamano: (b: number | null) => (b == null ? null : `${(b / 1_048_576).toFixed(1)} MB`),
}));
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

import { ClosureDocumentsManager, MAX_EVIDENCIAS } from '../components/closure/closure-documents-manager';
import { esUploadCancelado, useClosureMutations } from '../hooks/use-closure';
import { reserveClosureDocument, uploadClosureDocument } from '../lib/services/closure';
import type { ClosureRevision, ClosureUploadEnCurso } from '../lib/types/closure';

function revision(overrides: Partial<ClosureRevision> = {}): ClosureRevision {
  return {
    idRevisionCierre: 5,
    idProyecto: 7,
    numeroRevision: 1,
    estadoRevision: 'BORRADOR',
    idSolicitante: null,
    enviadaEn: null,
    fingerprintEntrega: null,
    idRevisor: null,
    comentarioRevisor: null,
    resueltaEn: null,
    idDocumentoOficial: null,
    creadaEn: '2026-09-01T10:00:00.000Z',
    documentosEnviados: [
      { idDocumentoCierre: 101, tipoDocumento: 'EVIDENCIA_LIDER', nombreArchivo: 'captura.pdf', tamanoBytes: 500_000, checksumSha256: null, orden: 1 },
    ],
    informeOficial: null,
    puedeEditar: true,
    puedeEnviar: true,
    puedeResolver: false,
    ...overrides,
  };
}

function enCurso(overrides: Partial<ClosureUploadEnCurso> = {}): ClosureUploadEnCurso {
  return { id: 'u1', nombreArchivo: 'anexo-final.pdf', tamanoBytes: 1_048_576, ...overrides };
}

function renderManager(props: Record<string, unknown> = {}) {
  const onCancelUpload = vi.fn();
  const utils = render(
    createElement(ClosureDocumentsManager, {
      projectId: 7,
      revision: revision(),
      onUpload: vi.fn(),
      onDetach: vi.fn(),
      onCancelUpload,
      ...props,
    } as never),
  );
  return { ...utils, onCancelUpload };
}

function file(nombre: string, bytes: number): File {
  const f = new File(['x'], nombre, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Evidencias del cierre — carga visible y cancelable', () => {
  it('una evidencia en curso aparece en la lista con su nombre, su tamaño y actividad de subida', () => {
    renderManager({ uploads: [enCurso()], uploading: true });

    const fila = screen.getByLabelText('Evidencia en curso: anexo-final.pdf');
    expect(within(fila).getByText('anexo-final.pdf')).toBeInTheDocument();
    expect(within(fila).getByText('1.0 MB')).toBeInTheDocument();
    expect(within(fila).getByText('Subiendo…')).toBeInTheDocument();
    expect(within(fila).getByRole('progressbar', { name: 'Subiendo anexo-final.pdf' })).toBeInTheDocument();
  });

  it('no anuncia un porcentaje que el navegador no conoce', () => {
    renderManager({ uploads: [enCurso()], uploading: true });

    const barra = screen.getByRole('progressbar', { name: 'Subiendo anexo-final.pdf' });
    // Indeterminada a propósito: `fetch` no expone el progreso de subida.
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('ofrece cancelar esa carga y avisa con el id de la carga, no con el del documento', () => {
    const { onCancelUpload } = renderManager({ uploads: [enCurso({ id: 'carga-7' })], uploading: true });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar la subida de anexo-final.pdf' }));

    expect(onCancelUpload).toHaveBeenCalledTimes(1);
    expect(onCancelUpload).toHaveBeenCalledWith('carga-7');
  });

  it('la carga en curso convive con las evidencias ya adjuntas, sin confundirse con ellas', () => {
    renderManager({ uploads: [enCurso()], uploading: true });

    const lista = screen.getByRole('list', { name: 'Evidencias adjuntas' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    // La ya adjunta se puede ver y quitar; la que sube, solo cancelar.
    expect(screen.getByRole('button', { name: 'Quitar captura.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar la subida de captura.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar anexo-final.pdf' })).not.toBeInTheDocument();
  });

  it('lo que está en vuelo cuenta para el cupo: no deja pasar del máximo', () => {
    const adjuntas = Array.from({ length: MAX_EVIDENCIAS - 1 }, (_, i) => ({
      idDocumentoCierre: 200 + i,
      tipoDocumento: 'EVIDENCIA_LIDER' as const,
      nombreArchivo: `e${i}.pdf`,
      tamanoBytes: 1000,
      checksumSha256: null,
      orden: i,
    }));
    renderManager({ revision: revision({ documentosEnviados: adjuntas }), uploads: [enCurso()], uploading: true });

    expect(screen.getByRole('button', { name: /Subiendo…|Añadir PDF/ })).toBeDisabled();
  });

  it('en solo lectura (administración) no se ofrece cancelar nada', () => {
    renderManager({ readOnly: true, uploads: [enCurso()] });

    expect(screen.queryByRole('button', { name: 'Cancelar la subida de anexo-final.pdf' })).not.toBeInTheDocument();
  });
});

describe('useClosureMutations — cargas en curso', () => {
  function renderMutations() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    }
    return renderHook(() => useClosureMutations(7), { wrapper: Wrapper });
  }

  it('expone la carga mientras vuela y la retira al terminar', async () => {
    let resolver: (v: unknown) => void = () => {};
    (reserveClosureDocument as any).mockResolvedValue({ documentId: 9, uploadUrl: '/u', ticket: 't', expiraEn: '', maxBytes: 10 });
    (uploadClosureDocument as any).mockReturnValue(new Promise((r) => { resolver = r; }));

    const { result } = renderMutations();
    result.current.upload.mutate({ revisionId: 5, file: file('anexo.pdf', 2048) });

    await waitFor(() => expect(result.current.uploads).toHaveLength(1));
    expect(result.current.uploads[0]).toMatchObject({ nombreArchivo: 'anexo.pdf', tamanoBytes: 2048 });

    resolver({});
    await waitFor(() => expect(result.current.uploads).toHaveLength(0));
  });

  it('cancelar aborta la petición en curso y libera la fila', async () => {
    (reserveClosureDocument as any).mockResolvedValue({ documentId: 9, uploadUrl: '/u', ticket: 't', expiraEn: '', maxBytes: 10 });
    let señal: AbortSignal | undefined;
    (uploadClosureDocument as any).mockImplementation(
      (_g: unknown, _f: File, signal?: AbortSignal) =>
        new Promise((_res, rej) => {
          señal = signal;
          signal?.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })));
        }),
    );

    const { result } = renderMutations();
    result.current.upload.mutate({ revisionId: 5, file: file('anexo.pdf', 2048) });
    await waitFor(() => expect(result.current.uploads).toHaveLength(1));

    result.current.cancelUpload(result.current.uploads[0].id);

    await waitFor(() => expect(señal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.uploads).toHaveLength(0));
  });

  it('la reserva viaja con la misma señal, para poder cancelar antes de que empiece a subir', async () => {
    (reserveClosureDocument as any).mockResolvedValue({ documentId: 9, uploadUrl: '/u', ticket: 't', expiraEn: '', maxBytes: 10 });
    (uploadClosureDocument as any).mockResolvedValue({});

    const { result } = renderMutations();
    result.current.upload.mutate({ revisionId: 5, file: file('anexo.pdf', 2048) });

    await waitFor(() => expect(reserveClosureDocument).toHaveBeenCalledTimes(1));
    expect((reserveClosureDocument as any).mock.calls[0][2]).toBeInstanceOf(AbortSignal);
  });

  it('una cancelación se distingue de un fallo real', () => {
    expect(esUploadCancelado(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(esUploadCancelado(Object.assign(new Error('x'), { statusCode: 413 }))).toBe(false);
    expect(esUploadCancelado(null)).toBe(false);
  });
});
