import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../components/closure/closure-document-viewer', () => ({
  ClosureDocumentViewer: (props: { open: boolean; nombre: string; documentId: number }) =>
    props.open ? createElement('div', { 'data-testid': 'viewer', 'data-document': props.documentId }, `VIEWER ${props.nombre}`) : null,
  formatearTamano: (b: number | null) => (b == null ? null : `${(b / 1_048_576).toFixed(1)} MB`),
}));

import { ClosureDocumentsManager, MAX_EVIDENCIAS } from '../components/closure/closure-documents-manager';
import { validateClosurePdf } from '../hooks/use-closure';
import { apiFetch } from '../lib/api/client';
import { uploadClosureDocument } from '../lib/services/closure';
import { CLOSURE_DOCUMENT_MAX_BYTES, getApiErrorMessage } from '../components/projects/api-error';
import type { ClosureRevision } from '../lib/types/closure';

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
      { idDocumentoCierre: 100, tipoDocumento: 'INFORME_AUTOMATICO', nombreArchivo: 'informe.pdf', tamanoBytes: 2_000_000, checksumSha256: 'a'.repeat(64), orden: 0 },
      { idDocumentoCierre: 101, tipoDocumento: 'EVIDENCIA_LIDER', nombreArchivo: 'captura.pdf', tamanoBytes: 500_000, checksumSha256: 'b'.repeat(64), orden: 1 },
    ],
    informeOficial: null,
    puedeEditar: true,
    puedeEnviar: true,
    puedeResolver: false,
    ...overrides,
  };
}

function pdf(bytes: number, name = 'evidencia.pdf', type = 'application/pdf'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

function renderManager(props: Record<string, unknown> = {}) {
  const onUpload = vi.fn();
  const onGenerate = vi.fn();
  const onDetach = vi.fn();
  const utils = render(
    createElement(ClosureDocumentsManager, {
      projectId: 7,
      revision: revision(),
      onUpload,
      onGenerate,
      onDetach,
      ...props,
    }),
  );
  return { ...utils, onUpload, onGenerate, onDetach };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('validateClosurePdf — validación en cliente', () => {
  it('rechaza un archivo > 10 MiB sin ninguna petición', () => {
    expect(validateClosurePdf(pdf(CLOSURE_DOCUMENT_MAX_BYTES + 1))).toMatch(/supera el límite de 10 MiB/);
    expect(validateClosurePdf(pdf(CLOSURE_DOCUMENT_MAX_BYTES))).toBeNull();
  });

  it('rechaza lo que no es PDF', () => {
    expect(validateClosurePdf(pdf(1000, 'foto.png', 'image/png'))).toBe('Solo se admiten archivos PDF.');
  });
});

describe('ClosureDocumentsManager (VIEW-13 / F005)', () => {
  it('un archivo > 10 MiB se rechaza en cliente: error visible y onUpload no se llama', () => {
    const { onUpload } = renderManager();

    const input = screen.getByLabelText('Seleccionar evidencia en PDF') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf(CLOSURE_DOCUMENT_MAX_BYTES + 5)] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/supera el límite de 10 MiB/);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('un PDF válido se entrega a onUpload', () => {
    const { onUpload } = renderManager();
    const input = screen.getByLabelText('Seleccionar evidencia en PDF') as HTMLInputElement;
    const file = pdf(1_000_000);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('muestra «Evidencias — n de 10» y permite quitar', () => {
    const { onDetach } = renderManager();
    expect(screen.getByText(`1 de ${MAX_EVIDENCIAS}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar captura.pdf' }));
    expect(onDetach).toHaveBeenCalledWith(101);
  });

  it('422 muestra el mensaje de PDF inválido', () => {
    const mensaje = getApiErrorMessage(Object.assign(new Error('x'), { statusCode: 422 }), 'closure');
    renderManager({ error: mensaje });
    expect(screen.getByRole('alert')).toHaveTextContent('El archivo no es un PDF válido o no pudo leerse.');
  });

  it('503 (storage no disponible) deshabilita subida y generación con tooltip', () => {
    renderManager({ storageUnavailable: true });
    const subir = screen.getByRole('button', { name: /Añadir PDF/ });
    const generar = screen.getByRole('button', { name: /Regenerar informe/ });
    expect(subir).toBeDisabled();
    expect(generar).toBeDisabled();
    expect((subir.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0');
    expect((generar.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0');
    // El resto sigue usable: ver informe y evidencias
    expect(screen.getByRole('button', { name: 'Ver informe' })).not.toBeDisabled();
  });

  it('«Ver informe» abre ClosureDocumentViewer con el id del informe', () => {
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Ver informe' }));
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-document', '100');
  });

  it('readOnly: sin generar, subir ni quitar; sí se puede ver', () => {
    renderManager({ readOnly: true });
    expect(screen.queryByRole('button', { name: /Añadir PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Regenerar informe|Generar informe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seleccionar evidencia en PDF')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver informe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver captura.pdf' })).toBeInTheDocument();
  });

  it('allowGenerate:false (estado S) no ofrece regenerar el informe', () => {
    renderManager({ allowGenerate: false });
    expect(screen.queryByRole('button', { name: /Regenerar informe|Generar informe/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Añadir PDF/ })).toBeInTheDocument();
  });
});

describe('uploadClosureDocument — multipart exacto', () => {
  it('envía EXACTAMENTE ticket y file, y apiFetch NO fija Content-Type con FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ idDocumentoCierre: 102 }),
    } as unknown as Response);

    const file = pdf(1234, 'evidencia.pdf');
    await uploadClosureDocument(
      { documentId: 102, uploadUrl: '/proyectos/7/cierre/documentos', ticket: 'tkt.123', expiraEn: '', maxBytes: 10 },
      file,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/proyectos/7/cierre/documentos');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const keys = [...(init.body as FormData).keys()];
    expect(keys).toEqual(['ticket', 'file']);
    expect((init.body as FormData).get('ticket')).toBe('tkt.123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('apiFetch sigue fijando application/json cuando el body no es FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    await apiFetch('/x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
