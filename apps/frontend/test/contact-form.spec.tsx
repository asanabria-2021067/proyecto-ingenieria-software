import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactForm } from '../components/contacto/contact-form';
import { CONTACTO_LIMITES, contactFormDefaults, type ContactFormValues } from '../components/contacto/contact-form.schema';

const VALIDO: ContactFormValues = {
  nombre: 'Ana Pérez',
  correo: 'per23123@uvg.edu.gt',
  asunto: 'No puedo entrar a mi proyecto',
  mensaje: 'Al abrir el tablero aparece un error.',
};

function renderForm(overrides: Partial<Parameters<typeof ContactForm>[0]> = {}) {
  const props = {
    defaultValues: contactFormDefaults(null),
    onSubmit: vi.fn().mockResolvedValue({ mensaje: 'ok' }),
    isPending: false,
    ...overrides,
  };
  return { ...render(<ContactForm {...props} />), props };
}

function llenar(values: Partial<ContactFormValues>) {
  const etiquetas: Record<keyof ContactFormValues, string> = {
    nombre: 'Nombre',
    correo: 'Correo',
    asunto: 'Asunto',
    mensaje: 'Mensaje',
  };
  for (const [campo, valor] of Object.entries(values) as [keyof ContactFormValues, string][]) {
    fireEvent.change(screen.getByLabelText(etiquetas[campo]), { target: { value: valor } });
  }
}

const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

describe('ContactForm', () => {
  afterEach(() => cleanup());

  it('sin sesión muestra los cuatro campos vacíos', () => {
    renderForm();

    for (const etiqueta of ['Nombre', 'Correo', 'Asunto', 'Mensaje']) {
      expect(screen.getByLabelText(etiqueta)).toHaveValue('');
    }
  });

  it('con sesión precarga nombre y correo', () => {
    renderForm({ defaultValues: contactFormDefaults({ nombre: 'Ana', apellido: 'Pérez', correo: 'per23123@uvg.edu.gt' }) });

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText('Correo')).toHaveValue('per23123@uvg.edu.gt');
    expect(screen.getByLabelText('Asunto')).toHaveValue('');
  });

  it('enviado vacío muestra el error de cada campo y no envía', async () => {
    const { props } = renderForm();

    enviar();

    expect(await screen.findByText('Escribe tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el asunto.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu mensaje.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('muestra el error de un correo inválido solo en su campo', async () => {
    const { props } = renderForm();

    llenar({ ...VALIDO, correo: 'ana@uvg' });
    enviar();

    expect(await screen.findByText('Escribe un correo válido, por ejemplo usuario@uvg.edu.gt.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'false');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('muestra el error de un asunto demasiado largo', async () => {
    const { props } = renderForm();

    llenar({ ...VALIDO, asunto: 'a'.repeat(CONTACTO_LIMITES.asunto + 1) });
    enviar();

    expect(await screen.findByText(`El asunto no puede exceder ${CONTACTO_LIMITES.asunto} caracteres.`)).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('limita la escritura al largo máximo de cada campo', () => {
    renderForm();

    expect(screen.getByLabelText('Nombre')).toHaveAttribute('maxLength', String(CONTACTO_LIMITES.nombre));
    expect(screen.getByLabelText('Correo')).toHaveAttribute('maxLength', String(CONTACTO_LIMITES.correo));
    expect(screen.getByLabelText('Asunto')).toHaveAttribute('maxLength', String(CONTACTO_LIMITES.asunto));
    expect(screen.getByLabelText('Mensaje')).toHaveAttribute('maxLength', String(CONTACTO_LIMITES.mensaje));
  });

  it('cuenta los caracteres del mensaje', () => {
    renderForm();

    llenar({ mensaje: 'Hola' });

    expect(screen.getByText(`4/${CONTACTO_LIMITES.mensaje}`)).toBeInTheDocument();
  });

  it('envía los valores recortados y limpia el formulario al terminar', async () => {
    const { props } = renderForm();

    llenar({ ...VALIDO, nombre: '  Ana Pérez  ', asunto: ' No puedo entrar a mi proyecto ' });
    enviar();

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith(VALIDO));
    await waitFor(() => expect(screen.getByLabelText('Mensaje')).toHaveValue(''));
    for (const etiqueta of ['Nombre', 'Correo', 'Asunto']) {
      expect(screen.getByLabelText(etiqueta)).toHaveValue('');
    }
  });

  it('con sesión, al limpiar conserva el nombre y el correo precargados', async () => {
    const defaultValues = contactFormDefaults({ nombre: 'Ana', apellido: 'Pérez', correo: 'per23123@uvg.edu.gt' });
    const { props } = renderForm({ defaultValues });

    llenar({ asunto: VALIDO.asunto, mensaje: VALIDO.mensaje });
    enviar();

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith(VALIDO));
    await waitFor(() => expect(screen.getByLabelText('Asunto')).toHaveValue(''));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText('Correo')).toHaveValue('per23123@uvg.edu.gt');
  });

  it('si el envío falla conserva lo escrito', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('fallo'));
    renderForm({ onSubmit });

    llenar(VALIDO);
    enviar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByLabelText('Asunto')).toHaveValue(VALIDO.asunto);
    expect(screen.getByLabelText('Mensaje')).toHaveValue(VALIDO.mensaje);
  });

  it('mientras se envía deshabilita el botón y lo indica', () => {
    renderForm({ isPending: true });

    const boton = screen.getByRole('button', { name: 'Enviando...' });
    expect(boton).toBeDisabled();
  });
});
