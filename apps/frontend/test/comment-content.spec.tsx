import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CommentContent } from '../components/comments/comment-content';

/** HU-200 (T-378/T-379): resaltado de menciones en el hilo de comentarios. */

const maria = { usuario: { idUsuario: 12, nombre: 'María', apellido: 'López', fotoUrl: null } };

describe('CommentContent', () => {
  afterEach(cleanup);

  it('pinta cada mención validada como enlace al perfil del integrante', () => {
    render(<CommentContent contenido="Revisa @[María López](12) por favor" menciones={[maria]} currentUserId={1} />);

    const enlace = screen.getByRole('link', { name: 'Mención a María López, ver perfil' });
    expect(enlace).toHaveAttribute('href', '/dashboard/personas/12');
    expect(enlace).toHaveTextContent('@María López');
    expect(enlace.closest('p')).toHaveTextContent('Revisa @María López por favor');
  });

  it('usa el nombre vigente del usuario, no la etiqueta guardada en el token', () => {
    render(<CommentContent contenido="Hola @[Mary](12)" menciones={[maria]} />);

    expect(screen.getByRole('link')).toHaveTextContent('@María López');
  });

  it('destaca con más fuerza la mención al usuario actual', () => {
    render(<CommentContent contenido="@[María López](12) te toca" menciones={[maria]} currentUserId={12} />);

    const enlace = screen.getByRole('link', { name: 'Mención a ti (María López), ver perfil' });
    expect(enlace.className).toContain('bg-primary');
    expect(enlace.className).toContain('text-on-primary');
  });

  it('un token sin mención validada se muestra como texto, sin enlace', () => {
    render(<CommentContent contenido="Hola @[Intruso](99)" menciones={[maria]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('@Intruso')).toBeInTheDocument();
  });

  it('comentarios antiguos sin `menciones` siguen mostrándose como texto', () => {
    render(<CommentContent contenido="Comentario normal" />);

    expect(screen.getByText('Comentario normal')).toBeInTheDocument();
  });

  it('el contenido se escapa: el HTML del comentario nunca se interpreta', () => {
    const { container } = render(
      <CommentContent contenido={'<img src=x onerror="alert(1)"> @[María López](12)'} menciones={[maria]} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });
});
