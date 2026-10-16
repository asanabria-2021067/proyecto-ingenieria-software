import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

const useLinkPreview = vi.fn();
vi.mock('@/hooks/use-chat', () => ({ useLinkPreview: (...args: unknown[]) => useLinkPreview(...args) }));

import { LinkPreviewCard, firstUrl } from '../components/chat-dock/link-preview-card';

const DATA = {
  url: 'https://example.com/post',
  titulo: 'Titulo de prueba',
  descripcion: 'Descripcion de prueba',
  imagen: 'https://cdn.example.com/i.png',
  sitio: 'example.com',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useLinkPreview.mockReset();
});

const renderCard = (contenido: string) =>
  render(<LinkPreviewCard idProyecto={1} idConversacion={2} contenido={contenido} />);

describe('firstUrl', () => {
  it('toma la primera URL y quita puntuacion final', () => {
    expect(firstUrl('mira https://a.com/x, y http://b.com')).toBe('https://a.com/x');
    expect(firstUrl('(ver https://a.com/x).')).toBe('https://a.com/x');
    expect(firstUrl('HTTPS://A.com')).toBe('HTTPS://A.com');
  });

  it('devuelve null sin URL, con esquemas no http o demasiado larga', () => {
    expect(firstUrl('hola')).toBeNull();
    expect(firstUrl('javascript:alert(1) ftp://a.com')).toBeNull();
    expect(firstUrl(`https://a.com/${'a'.repeat(2050)}`)).toBeNull();
  });
});

describe('LinkPreviewCard', () => {
  it('sin URL no consulta ni pinta nada', () => {
    useLinkPreview.mockReturnValue({ data: undefined });
    const { container } = renderCard('solo texto');
    expect(container).toBeEmptyDOMElement();
    expect(useLinkPreview).toHaveBeenCalledWith(1, 2, null);
  });

  it('muestra la tarjeta como enlace seguro con imagen decorativa', () => {
    useLinkPreview.mockReturnValue({ data: DATA });
    const { getByRole, container } = renderCard('ver https://example.com/post');
    expect(useLinkPreview).toHaveBeenCalledWith(1, 2, 'https://example.com/post');
    const link = getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/post');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Titulo de prueba');
    expect(link).toHaveTextContent('Descripcion de prueba');
    expect(link).toHaveTextContent('Abre en una pestaña nueva');
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('si la imagen falla, la oculta y deja el texto', () => {
    useLinkPreview.mockReturnValue({ data: DATA });
    const { container, getByRole } = renderCard('https://example.com/post');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('link')).toHaveTextContent('Titulo de prueba');
  });

  it('muestra solo los campos presentes', () => {
    useLinkPreview.mockReturnValue({ data: { ...DATA, imagen: null, descripcion: null, sitio: null } });
    const { container, getByRole } = renderCard('https://example.com/post');
    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('link')).toHaveTextContent('Titulo de prueba');
  });

  it('cargando o con error no muestra tarjeta ni mensaje', () => {
    useLinkPreview.mockReturnValue({ data: undefined, isError: true });
    const { queryByRole } = renderCard('https://example.com/post');
    expect(queryByRole('link')).toBeNull();
    expect(queryByRole('alert')).toBeNull();
  });

  it('sin metadatos utiles no muestra tarjeta', () => {
    useLinkPreview.mockReturnValue({ data: { ...DATA, titulo: null, descripcion: null, imagen: null } });
    const { queryByRole } = renderCard('https://example.com/post');
    expect(queryByRole('link')).toBeNull();
  });

  it('una URL final no http(s) se muestra como texto inerte, sin enlace', () => {
    useLinkPreview.mockReturnValue({ data: { ...DATA, url: 'javascript:alert(1)' } });
    const { queryByRole, container } = renderCard('https://example.com/post');
    expect(queryByRole('link')).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });

  it('es perezosa: no consulta hasta entrar en pantalla', () => {
    let trigger: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof trigger) {
          trigger = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    useLinkPreview.mockReturnValue({ data: undefined });
    renderCard('https://example.com/post');
    expect(useLinkPreview).toHaveBeenLastCalledWith(1, 2, null);

    act(() => trigger([{ isIntersecting: false }]));
    expect(useLinkPreview).toHaveBeenLastCalledWith(1, 2, null);

    act(() => trigger([{ isIntersecting: true }]));
    expect(useLinkPreview).toHaveBeenLastCalledWith(1, 2, 'https://example.com/post');
    expect(disconnect).toHaveBeenCalled();
  });
});
