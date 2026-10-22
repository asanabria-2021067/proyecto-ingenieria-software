import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MentionTextarea } from '../components/comments/mention-textarea';
import type { MencionSeleccionada } from '../lib/mentions/mention-tokens';
import type { Mencionable } from '../lib/services/comments';

/** HU-200 (T-376/T-379): autocompletado de @menciones. */

const MENCIONABLES: Mencionable[] = [
  { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null, esLider: true },
  { idUsuario: 2, nombre: 'María', apellido: 'López', fotoUrl: null, esLider: false },
  { idUsuario: 3, nombre: 'Mario', apellido: 'Ruiz', fotoUrl: null, esLider: false },
  { idUsuario: 9, nombre: 'Yo', apellido: 'Mismo', fotoUrl: null, esLider: false },
];

function Harness({
  onMenciones,
  yaNotificados,
  inicial = '',
}: {
  onMenciones?: (m: MencionSeleccionada[]) => void;
  yaNotificados?: number[];
  inicial?: string;
}) {
  const [texto, setTexto] = useState(inicial);
  const [menciones, setMenciones] = useState<MencionSeleccionada[]>([]);
  return (
    <MentionTextarea
      value={texto}
      onChange={setTexto}
      menciones={menciones}
      onMencionesChange={(m) => {
        setMenciones(m);
        onMenciones?.(m);
      }}
      mencionables={MENCIONABLES}
      currentUserId={9}
      yaNotificados={yaNotificados}
      aria-label="Comentario"
    />
  );
}

/** Escribe en el textarea dejando el cursor al final, como lo haría el usuario. */
function escribir(textarea: HTMLTextAreaElement, valor: string) {
  fireEvent.change(textarea, { target: { value: valor, selectionStart: valor.length, selectionEnd: valor.length } });
}

describe('MentionTextarea', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('al escribir @ sugiere a los integrantes del proyecto, sin incluirte a ti', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox', { name: 'Comentario' }) as HTMLTextAreaElement;

    escribir(textarea, 'Hola @');

    const opciones = screen.getAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual(['CMCarlos MendozaLíder', 'MLMaría López', 'MRMario Ruiz']);
    expect(textarea).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/Yo Mismo/)).not.toBeInTheDocument();
  });

  it('filtra por nombre o apellido sin distinguir tildes', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@mari');

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['MLMaría López', 'MRMario Ruiz']);
  });

  it('con teclado: ↓ y Enter insertan @Nombre Apellido y registran la mención', () => {
    const onMenciones = vi.fn();
    render(<Harness onMenciones={onMenciones} />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, 'Revisa @mar');
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea.value).toBe('Revisa @Mario Ruiz ');
    expect(onMenciones).toHaveBeenLastCalledWith([{ idUsuario: 3, etiqueta: 'Mario Ruiz' }]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('con el mouse: elegir una sugerencia la inserta', () => {
    const onMenciones = vi.fn();
    render(<Harness onMenciones={onMenciones} />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@car');
    fireEvent.mouseDown(screen.getByRole('option', { name: /Carlos Mendoza/ }));

    expect(textarea.value).toBe('@Carlos Mendoza ');
    expect(onMenciones).toHaveBeenLastCalledWith([{ idUsuario: 1, etiqueta: 'Carlos Mendoza' }]);
  });

  it('muestra a quién se notificará y quita la mención si se borra del texto', () => {
    const onMenciones = vi.fn();
    render(<Harness onMenciones={onMenciones} />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@mar');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(screen.getByText('Se notificará a')).toBeInTheDocument();
    expect(screen.getByText('María López', { selector: '.pill' })).toBeInTheDocument();

    escribir(textarea, 'Ya no menciono a nadie');

    expect(onMenciones).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText('Se notificará a')).not.toBeInTheDocument();
  });

  it('al editar, quien ya fue avisado no aparece en «Se notificará a»', () => {
    render(<Harness yaNotificados={[2]} />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@mar');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.queryByText('Se notificará a')).not.toBeInTheDocument();
  });

  it('Escape cierra las sugerencias sin borrar lo escrito', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@ma');
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea.value).toBe('@ma');
  });

  it('avisa cuando ningún integrante coincide', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@zzz');

    expect(screen.getByRole('status')).toHaveTextContent('Ningún integrante coincide con «zzz».');
  });

  it('un @ dentro de un correo no abre sugerencias', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, 'ana@uv');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-expanded', 'false');
  });

  it('seguir escribiendo después de una mención elegida no reabre la búsqueda', () => {
    render(<Harness />);
    const textarea = screen.getByRole('combobox') as HTMLTextAreaElement;

    escribir(textarea, '@mar');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    escribir(textarea, '@María López gracias');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
