import { describe, expect, it } from 'vitest';
import {
  CHAT_ADJUNTO_ACCEPT,
  CHAT_ADJUNTO_MAX_BYTES,
  categoriaAdjunto,
  formatearTamano,
  validarArchivoChat,
} from '../lib/chat-adjuntos';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function archivo(nombre: string, tipo: string, bytes = 10) {
  const f = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('validarArchivoChat', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.PNG', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
    ['a.pdf', 'application/pdf'],
    ['a.docx', DOCX],
    ['a.xlsx', XLSX],
    ['a.pptx', PPTX],
  ])('acepta %s', (nombre, tipo) => {
    expect(validarArchivoChat(archivo(nombre, tipo))).toBeNull();
  });

  it('acepta justo 10 MB y rechaza 10 MB + 1', () => {
    expect(validarArchivoChat(archivo('a.pdf', 'application/pdf', CHAT_ADJUNTO_MAX_BYTES))).toBeNull();
    expect(validarArchivoChat(archivo('a.pdf', 'application/pdf', CHAT_ADJUNTO_MAX_BYTES + 1))).toMatch(/10 MB/);
  });

  it('rechaza archivos vacios', () => {
    expect(validarArchivoChat(archivo('a.pdf', 'application/pdf', 0))).toMatch(/vacío/);
  });

  it.each([
    ['script.exe', 'application/x-msdownload'],
    ['pagina.html', 'text/html'],
    ['vector.svg', 'image/svg+xml'],
    ['viejo.doc', 'application/msword'],
    ['sin-tipo.pdf', ''],
  ])('rechaza tipo fuera de la lista: %s', (nombre, tipo) => {
    expect(validarArchivoChat(archivo(nombre, tipo))).toMatch(/no permitido/);
  });

  it('rechaza extension que no corresponde al tipo', () => {
    expect(validarArchivoChat(archivo('foto.pdf', 'image/png'))).toMatch(/no permitido/);
    expect(validarArchivoChat(archivo('sinextension', 'application/pdf'))).toMatch(/no permitido/);
  });
});

describe('utilidades de adjuntos', () => {
  it('accept incluye MIME y extensiones de la lista blanca', () => {
    expect(CHAT_ADJUNTO_ACCEPT).toContain('application/pdf');
    expect(CHAT_ADJUNTO_ACCEPT).toContain('.docx');
    expect(CHAT_ADJUNTO_ACCEPT).not.toContain('svg');
  });

  it.each([
    ['image/png', 'imagen'],
    ['application/pdf', 'pdf'],
    [DOCX, 'word'],
    [XLSX, 'excel'],
    [PPTX, 'powerpoint'],
  ])('categoria de %s', (mime, esperada) => {
    expect(categoriaAdjunto(mime)).toBe(esperada);
  });

  it('formatea tamanos', () => {
    expect(formatearTamano(512)).toBe('512 B');
    expect(formatearTamano(2048)).toBe('2.0 KB');
    expect(formatearTamano(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
