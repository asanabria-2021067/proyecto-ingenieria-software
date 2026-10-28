import { describe, expect, it } from 'vitest';
import {
  CONTACTO_LIMITES,
  contactFormDefaults,
  contactFormSchema,
  type ContactFormValues,
} from '../components/contacto/contact-form.schema';

const VALIDO: ContactFormValues = {
  nombre: 'Ana Pérez',
  correo: 'per23123@uvg.edu.gt',
  asunto: 'No puedo entrar a mi proyecto',
  mensaje: 'Al abrir el tablero aparece un error.',
};

function mensajes(values: Partial<Record<keyof ContactFormValues, unknown>>) {
  const result = contactFormSchema.safeParse({ ...VALIDO, ...values });
  if (result.success) return {};
  const porCampo: Record<string, string> = {};
  for (const issue of result.error.issues) {
    porCampo[issue.path.join('.')] ??= issue.message;
  }
  return porCampo;
}

describe('contactFormSchema', () => {
  it('acepta un formulario válido y recorta los espacios', () => {
    const result = contactFormSchema.safeParse({ ...VALIDO, nombre: '  Ana Pérez ', asunto: ' Ayuda ' });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ ...VALIDO, asunto: 'Ayuda' });
  });

  it('coincide con los límites del backend', () => {
    expect(CONTACTO_LIMITES).toEqual({ nombre: 100, correo: 254, asunto: 150, mensaje: 2000 });
  });

  it('acepta exactamente los largos máximos', () => {
    expect(
      mensajes({
        nombre: 'n'.repeat(CONTACTO_LIMITES.nombre),
        asunto: 'a'.repeat(CONTACTO_LIMITES.asunto),
        mensaje: 'm'.repeat(CONTACTO_LIMITES.mensaje),
      }),
    ).toEqual({});
  });

  it.each([
    ['nombre', 'Escribe tu nombre.'],
    ['correo', 'Escribe tu correo.'],
    ['asunto', 'Escribe el asunto.'],
    ['mensaje', 'Escribe tu mensaje.'],
  ] as const)('%s vacío o solo con espacios es obligatorio', (campo, mensaje) => {
    expect(mensajes({ [campo]: '' })[campo]).toBe(mensaje);
    expect(mensajes({ [campo]: '   ' })[campo]).toBe(mensaje);
  });

  it.each(['sin-arroba', 'ana@', '@uvg.edu.gt', 'ana@uvg', 'ana perez@uvg.edu.gt'])(
    'rechaza el correo con formato inválido %s',
    (correo) => {
      expect(mensajes({ correo }).correo).toBe('Escribe un correo válido, por ejemplo usuario@uvg.edu.gt.');
    },
  );

  it('acepta correos que no son institucionales', () => {
    expect(mensajes({ correo: 'visitante@gmail.com' })).toEqual({});
  });

  it.each([
    ['nombre', CONTACTO_LIMITES.nombre],
    ['asunto', CONTACTO_LIMITES.asunto],
    ['mensaje', CONTACTO_LIMITES.mensaje],
  ] as const)('rechaza %s con más de %i caracteres', (campo, limite) => {
    expect(mensajes({ [campo]: 'x'.repeat(limite + 1) })[campo]).toBe(
      `El ${campo} no puede exceder ${limite} caracteres.`,
    );
  });

  it('rechaza un correo con más del largo máximo', () => {
    const correo = `${'a'.repeat(CONTACTO_LIMITES.correo)}@uvg.edu.gt`;
    expect(mensajes({ correo }).correo).toBe(`El correo no puede exceder ${CONTACTO_LIMITES.correo} caracteres.`);
  });

  it('reporta cada campo inválido por separado', () => {
    expect(Object.keys(mensajes({ nombre: '', correo: 'x', asunto: '', mensaje: '' })).sort()).toEqual([
      'asunto',
      'correo',
      'mensaje',
      'nombre',
    ]);
  });
});

describe('contactFormDefaults', () => {
  it('sin sesión deja todo vacío', () => {
    expect(contactFormDefaults(null)).toEqual({ nombre: '', correo: '', asunto: '', mensaje: '' });
    expect(contactFormDefaults(undefined)).toEqual({ nombre: '', correo: '', asunto: '', mensaje: '' });
  });

  it('con sesión precarga el nombre completo y el correo', () => {
    expect(contactFormDefaults({ nombre: 'Ana', apellido: 'Pérez', correo: 'per23123@uvg.edu.gt' })).toEqual({
      nombre: 'Ana Pérez',
      correo: 'per23123@uvg.edu.gt',
      asunto: '',
      mensaje: '',
    });
  });

  it('omite las partes vacías del nombre y no supera el largo máximo', () => {
    expect(contactFormDefaults({ nombre: 'Ana', apellido: null, correo: null }).nombre).toBe('Ana');
    expect(contactFormDefaults({ nombre: 'x'.repeat(150), apellido: 'y' }).nombre).toHaveLength(CONTACTO_LIMITES.nombre);
  });
});
