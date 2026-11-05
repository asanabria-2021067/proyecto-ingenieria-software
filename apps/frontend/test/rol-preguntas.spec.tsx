import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RolPreguntas } from '../app/dashboard/projects/mine/form/RolPreguntas';
import { newRol, preguntaSchema, rolSchema, type PreguntaFormItem } from '../app/dashboard/projects/mine/form/types';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const pregunta = (id: string, enunciado: string, extra: Partial<PreguntaFormItem> = {}): PreguntaFormItem => ({
  id,
  enunciado,
  tipo: 'CORTA',
  obligatoria: false,
  ...extra,
});

function Editor({ inicial = [] }: { inicial?: PreguntaFormItem[] }) {
  const [preguntas, setPreguntas] = useState(inicial);
  return <RolPreguntas preguntas={preguntas} errors={{}} onChange={setPreguntas} />;
}

const enunciados = () => screen.queryAllByRole('textbox').map((c) => (c as HTMLInputElement).value);

describe('Editor de preguntas del rol (MEJ-97)', () => {
  afterEach(() => cleanup());

  it('agrega preguntas hasta el máximo de 5 y luego bloquea el botón', () => {
    render(<Editor />);
    const agregar = screen.getByRole('button', { name: /Agregar pregunta/ });
    for (let i = 0; i < 5; i += 1) fireEvent.click(agregar);
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
    expect(agregar).toBeDisabled();
  });

  it('escribe, marca obligatoria, reordena y quita con botones', () => {
    render(<Editor inicial={[pregunta('a', 'Primera'), pregunta('b', 'Segunda')]} />);

    fireEvent.change(screen.getByLabelText('Pregunta 1'), { target: { value: 'Uno' } });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Obligatoria' })[1]);
    expect(screen.getAllByRole('checkbox', { name: 'Obligatoria' })[1]).toBeChecked();

    expect(screen.getByRole('button', { name: 'Subir la pregunta 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar la pregunta 2' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Bajar la pregunta 1' }));
    expect(enunciados()).toEqual(['Segunda', 'Uno']);
    // La obligatoria viaja con su pregunta.
    expect(screen.getAllByRole('checkbox', { name: 'Obligatoria' })[0]).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar la pregunta 1' }));
    expect(enunciados()).toEqual(['Uno']);
  });

  it('muestra el error de una pregunta sin enunciado', () => {
    render(<RolPreguntas preguntas={[pregunta('a', '')]} errors={{ 'preguntas.0.enunciado': 'Escribe la pregunta.' }} onChange={() => {}} />);
    expect(screen.getByText('Escribe la pregunta.')).toBeInTheDocument();
  });
});

describe('Validación de preguntas del rol', () => {
  it('pide enunciado y respeta el límite de 200 caracteres y de 5 preguntas', () => {
    expect(preguntaSchema.safeParse(pregunta('a', '   ')).success).toBe(false);
    expect(preguntaSchema.safeParse(pregunta('a', 'x'.repeat(200))).success).toBe(true);
    expect(preguntaSchema.safeParse(pregunta('a', 'x'.repeat(201))).success).toBe(false);

    const rol = { ...newRol(), nombreRol: 'Dev', cupos: 1 };
    const seis = Array.from({ length: 6 }, (_, i) => pregunta(String(i), 'Pregunta'));
    expect(rolSchema.safeParse({ ...rol, preguntas: seis.slice(0, 5) }).success).toBe(true);
    expect(rolSchema.safeParse({ ...rol, preguntas: seis }).success).toBe(false);
  });
});
