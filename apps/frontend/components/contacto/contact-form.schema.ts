import { z } from 'zod';

export const CONTACTO_LIMITES = {
  nombre: 100,
  correo: 254,
  asunto: 150,
  mensaje: 2000,
} as const;

export const contactFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Escribe tu nombre.')
    .max(CONTACTO_LIMITES.nombre, `El nombre no puede exceder ${CONTACTO_LIMITES.nombre} caracteres.`),
  correo: z
    .string()
    .trim()
    .min(1, 'Escribe tu correo.')
    .max(CONTACTO_LIMITES.correo, `El correo no puede exceder ${CONTACTO_LIMITES.correo} caracteres.`)
    .email('Escribe un correo válido, por ejemplo usuario@uvg.edu.gt.'),
  asunto: z
    .string()
    .trim()
    .min(1, 'Escribe el asunto.')
    .max(CONTACTO_LIMITES.asunto, `El asunto no puede exceder ${CONTACTO_LIMITES.asunto} caracteres.`),
  mensaje: z
    .string()
    .trim()
    .min(1, 'Escribe tu mensaje.')
    .max(CONTACTO_LIMITES.mensaje, `El mensaje no puede exceder ${CONTACTO_LIMITES.mensaje} caracteres.`),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export interface ContactFormUser {
  nombre?: string | null;
  apellido?: string | null;
  correo?: string | null;
}

export function contactFormDefaults(user?: ContactFormUser | null): ContactFormValues {
  const nombre = [user?.nombre, user?.apellido]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(' ');
  return {
    nombre: nombre.slice(0, CONTACTO_LIMITES.nombre),
    correo: user?.correo?.trim().slice(0, CONTACTO_LIMITES.correo) ?? '',
    asunto: '',
    mensaje: '',
  };
}
