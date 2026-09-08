import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../lib/services/closure', () => ({
  getClosureDocumentReadGrant: vi.fn(),
  fetchClosureDocumentBytes: vi.fn(),
}));

const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({ default: { fire: swalFire }, swalCustomClass: {} }));

import { ClosureDocumentViewer, formatearTamano } from '../components/closure/closure-document-viewer';
import { fetchClosureDocumentBytes, getClosureDocumentReadGrant } from '../lib/services/closure';
import { apiFetchBlob } from '../lib/api/client';
import { closureDocumentGrantQueryKey } from '../lib/query-keys/closure';

const PROVIDER_URL = 'https://res.cloudinary.com/demo/raw/upload/v1/informe.pdf';
const BACKEND_URL = '/proyectos/7/cierre/documentos/33/contenido?ticket=abc.def';

let createSpy: ReturnType<typeof vi.fn>;
let revokeSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createSpy = vi.fn(() => 'blob:local/doc-33');
  revokeSpy = vi.fn();
  (URL as any).createObjectURL = createSpy;
  (URL as any).revokeObjectURL = revokeSpy;
  (getClosureDocumentReadGrant as any).mockResolvedValue({
    documentId: 33,
    url: BACKEND_URL,
    expiraEn: '2026-09-06T12:05:00.000Z',
  });
  (fetchClosureDocumentBytes as any).mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderViewer(props: Record<string, unknown> = {}) {
  const { wrapper, queryClient } = createWrapper();
  const onOpenChange = vi.fn();
  const utils = render(
    createElement(ClosureDocumentViewer, {
      projectId: 7,
      documentId: 33,
      nombre: 'Informe_Final.pdf',
      tipo: 'INFORME_AUTOMATICO',
      tamanoBytes: 2_516_582,
      fecha: '2026-09-01T10:00:00.000Z',
      open: true,
      onOpenChange,
      ...props,
    }),
    { wrapper },
  );
  return { ...utils, queryClient, onOpenChange, wrapper };
}

describe('ClosureDocumentViewer (VIEW-20 / F004)', () => {
  it('pide el grant y luego los bytes, en ese orden, con la URL del backend', async () => {
    renderViewer();

    await waitFor(() => expect(fetchClosureDocumentBytes).toHaveBeenCalledWith(BACKEND_URL));
    expect(getClosureDocumentReadGrant).toHaveBeenCalledWith(7, 33);
    const ordenGrant = (getClosureDocumentReadGrant as any).mock.invocationCallOrder[0];
    const ordenBytes = (fetchClosureDocumentBytes as any).mock.invocationCallOrder[0];
    expect(ordenGrant).toBeLessThan(ordenBytes);
  });

  it('crea un objectURL local, lo muestra en un iframe y llama a revokeObjectURL al cerrar', async () => {
    const { rerender, wrapper, onOpenChange } = renderViewer();

    const iframe = await screen.findByTitle('Vista previa de Informe_Final.pdf');
    expect(iframe).toHaveAttribute('src', 'blob:local/doc-33');
    expect(createSpy).toHaveBeenCalledTimes(1);

    rerender(
      createElement(
        wrapper,
        null,
        createElement(ClosureDocumentViewer, {
          projectId: 7,
          documentId: 33,
          nombre: 'Informe_Final.pdf',
          open: false,
          onOpenChange,
        }),
      ),
    );

    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith('blob:local/doc-33'));
  });

  it('muestra nombre y metadatos (tipo · tamaño · fecha) sin exponer ninguna URL del proveedor', async () => {
    (getClosureDocumentReadGrant as any).mockResolvedValue({
      documentId: 33,
      url: BACKEND_URL,
      expiraEn: '2026-09-06T12:05:00.000Z',
    });
    const { container } = renderViewer();

    await screen.findByTitle('Vista previa de Informe_Final.pdf');
    expect(screen.getByText('Informe_Final.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Generado automáticamente · 2\.4 MB ·/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('cloudinary');
    expect(document.body.innerHTML).not.toContain(PROVIDER_URL);
    expect(document.body.innerHTML).not.toContain('ticket=');
    expect(container.innerHTML).not.toContain('cloudinary');
  });

  it('403 es terminal: cierra el visor con el aviso y no vuelve a pedir un grant', async () => {
    (getClosureDocumentReadGrant as any).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    );
    const { onOpenChange } = renderViewer();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(swalFire).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ya no tienes acceso a este documento' }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(getClosureDocumentReadGrant).toHaveBeenCalledTimes(1);
    expect(fetchClosureDocumentBytes).not.toHaveBeenCalled();
  });

  it('404 muestra «El documento ya no está disponible» dentro del visor', async () => {
    (getClosureDocumentReadGrant as any).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );
    renderViewer();

    expect(await screen.findByRole('alert')).toHaveTextContent('El documento ya no está disponible.');
  });

  it('el grant no se cachea entre aperturas: reabrir pide otro grant', async () => {
    const { rerender, wrapper, onOpenChange, queryClient } = renderViewer();
    await screen.findByTitle('Vista previa de Informe_Final.pdf');
    expect(queryClient.getQueryDefaults(closureDocumentGrantQueryKey(7, 33))).toBeDefined();

    const props = { projectId: 7, documentId: 33, nombre: 'Informe_Final.pdf', onOpenChange };
    rerender(createElement(wrapper, null, createElement(ClosureDocumentViewer, { ...props, open: false })));
    await waitFor(() => expect(revokeSpy).toHaveBeenCalled());
    rerender(createElement(wrapper, null, createElement(ClosureDocumentViewer, { ...props, open: true })));

    await waitFor(() => expect(getClosureDocumentReadGrant).toHaveBeenCalledTimes(2));
    const estado = queryClient.getQueryCache().find({ queryKey: closureDocumentGrantQueryKey(7, 33) });
    expect((estado?.options as any).staleTime).toBe(0);
    expect((estado?.options as any).gcTime).toBe(0);
  });

  it('«Abrir en pestaña nueva» usa el mismo objectURL local', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderViewer();

    await screen.findByTitle('Vista previa de Informe_Final.pdf');
    fireEvent.click(screen.getAllByRole('button', { name: /abrir en pestaña nueva/i })[0]);
    expect(openSpy).toHaveBeenCalledWith('blob:local/doc-33', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('formatearTamano', () => {
    expect(formatearTamano(512)).toBe('512 B');
    expect(formatearTamano(20_480)).toBe('20 KB');
    expect(formatearTamano(2_516_582)).toBe('2.4 MB');
    expect(formatearTamano(null)).toBeNull();
  });
});

describe('apiFetchBlob (F004)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pide con credentials include, Accept application/pdf y devuelve el Blob', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const result = await apiFetchBlob(BACKEND_URL);

    expect(result).toBe(blob);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/proyectos/7/cierre/documentos/33/contenido?ticket=abc.def');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>).Accept).toBe('application/pdf');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('en error levanta el error enriquecido con statusCode y code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ statusCode: 403, message: 'Sin permiso', code: 'CLOSURE_TICKET_INVALID' }),
    } as unknown as Response);

    await expect(apiFetchBlob(BACKEND_URL)).rejects.toMatchObject({
      message: 'Sin permiso',
      statusCode: 403,
      code: 'CLOSURE_TICKET_INVALID',
    });
  });
});
