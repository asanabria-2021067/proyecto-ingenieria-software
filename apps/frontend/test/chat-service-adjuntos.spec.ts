import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
const apiFetchBlob = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiFetchBlob: (...a: unknown[]) => apiFetchBlob(...a),
}));

import { getAttachmentThumbnail, getAttachmentUrl, getFiles, sendFileMessage } from '../lib/services/chat';

afterEach(() => vi.clearAllMocks());

describe('servicios de adjuntos del chat', () => {
  it('sendFileMessage manda multipart con archivo y texto', () => {
    const archivo = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    sendFileMessage(10, 5, 'hola', archivo);
    const [ruta, opciones] = apiFetch.mock.calls[0];
    expect(ruta).toBe('/proyectos/10/conversaciones/5/mensajes/archivo');
    expect(opciones.method).toBe('POST');
    expect(opciones.body).toBeInstanceOf(FormData);
    expect(opciones.body.get('contenido')).toBe('hola');
    expect(opciones.body.get('file')).toBeInstanceOf(File);
    expect(opciones.headers).toBeUndefined();
  });

  it('sendFileMessage omite contenido vacio', () => {
    sendFileMessage(10, 5, '', new File(['x'], 'a.pdf'));
    expect(apiFetch.mock.calls[0][1].body.has('contenido')).toBe(false);
  });

  it('getFiles y getAttachmentUrl usan las rutas del backend', () => {
    getFiles(10, 5);
    getFiles(10, 5, 9);
    getAttachmentUrl(10, 5, 7);
    expect(apiFetch.mock.calls.map((c) => c[0])).toEqual([
      '/proyectos/10/conversaciones/5/archivos',
      '/proyectos/10/conversaciones/5/archivos?cursor=9',
      '/proyectos/10/conversaciones/5/archivos/7/url',
    ]);
  });

  it('getAttachmentThumbnail pide la miniatura al backend como imagen', () => {
    getAttachmentThumbnail(10, 5, 7);
    expect(apiFetchBlob).toHaveBeenCalledWith('/proyectos/10/conversaciones/5/archivos/7/miniatura', {
      headers: { Accept: 'image/*' },
    });
  });
});
