import { z } from 'zod';
import {
  buildEventFormSchema,
  buildEventPayload,
  emptyEventForm,
  eventFormFromEvento,
  rangoDelFormulario,
  type BuildEventFormSchemaOptions,
  type EventFormValues,
} from '@/components/calendar/event-form.schema';
import type {
  AdminMeetingDetalle,
  AdminMeetingPayload,
  MotivoNoElegible,
  PoliticaEdicionReunion,
} from '@/lib/types/admin-meetings';

/**
 * HU-195 (T-363): formulario de una reunión de Administración. Son los mismos
 * valores y reglas del evento de proyecto (título, fecha y horario,
 * modalidad, enlace, lugar y recordatorio; `buildEventFormSchema`) más los
 * proyectos invitados y quién puede gestionarla. El tipo es siempre REUNION y
 * no hay invitados individuales: se convoca al equipo de cada proyecto.
 */

/** Tope del contrato (`MAX_PROYECTOS_POR_REUNION`). */
export const MAX_PROYECTOS_REUNION = 50;

export interface AdminMeetingFormValues extends EventFormValues {
  proyectos: number[];
  politicaEdicion: PoliticaEdicionReunion;
  editores: number[];
}

export const POLITICA_EDICION_OPCIONES: { value: PoliticaEdicionReunion; label: string; ayuda: string }[] = [
  { value: 'TODOS_ADMINISTRADORES', label: 'Todos los administradores', ayuda: 'Cualquier administrador puede editarla o cancelarla.' },
  { value: 'SOLO_CREADOR', label: 'Solo yo', ayuda: 'Solo quien la programó puede editarla o cancelarla.' },
  { value: 'ADMINISTRADORES_SELECCIONADOS', label: 'Administradores seleccionados', ayuda: 'Tú y los administradores que elijas.' },
];

export const MOTIVO_NO_ELEGIBLE: Record<MotivoNoElegible, string> = {
  PROYECTO_INEXISTENTE: 'El proyecto ya no existe.',
  PROYECTO_ELIMINADO: 'El proyecto fue eliminado.',
  ESTADO_NO_ELEGIBLE: 'El proyecto no está en progreso ni recién cerrado.',
  SIN_FECHA_OFICIAL_CIERRE: 'El proyecto cerrado no tiene fecha oficial de cierre.',
  FUERA_DE_VENTANA_POSCIERRE: 'La reunión queda fuera de los dos meses posteriores al cierre oficial.',
};

export function buildAdminMeetingFormSchema(opciones: Omit<BuildEventFormSchemaOptions, 'exigirProyecto'>) {
  return buildEventFormSchema({ ...opciones, exigirProyecto: false }).and(
    z.object({
      proyectos: z
        .array(z.number().int().positive())
        .min(1, 'Invita al menos un proyecto.')
        .max(MAX_PROYECTOS_REUNION, `Una reunión admite hasta ${MAX_PROYECTOS_REUNION} proyectos.`)
        .refine((ids) => new Set(ids).size === ids.length, 'Hay proyectos repetidos.'),
      politicaEdicion: z.enum(['TODOS_ADMINISTRADORES', 'SOLO_CREADOR', 'ADMINISTRADORES_SELECCIONADOS']),
      editores: z.array(z.number().int().positive()),
    }),
  );
}

export function emptyAdminMeetingForm(initialDate?: Date, ahora = new Date()): AdminMeetingFormValues {
  return {
    ...emptyEventForm(undefined, initialDate, ahora),
    proyectos: [],
    politicaEdicion: 'TODOS_ADMINISTRADORES',
    editores: [],
  };
}

/** Valores de una reunión existente para editarla. `contenido` llega siempre con integridad OK. */
export function adminMeetingFormFromReunion(reunion: AdminMeetingDetalle): AdminMeetingFormValues {
  const contenido = reunion.contenido!;
  return {
    ...eventFormFromEvento({
      ...contenido,
      idProyecto: 0,
      tipoEvento: 'REUNION',
      rolesDestino: [],
      invitados: [],
    }),
    proyectos: reunion.proyectos.map((p) => p.idProyecto),
    politicaEdicion: reunion.politicaEdicion,
    editores: reunion.editores.map((e) => e.idUsuario),
  };
}

/** Inicio y fin del formulario si ya forman un rango válido (para consultar la elegibilidad). */
export function rangoDeReunion(values: Pick<AdminMeetingFormValues, 'fecha' | 'horaInicio' | 'horaFin' | 'terminaOtroDia' | 'fechaFin'>) {
  const { inicio, fin } = rangoDelFormulario(values);
  return inicio && fin && fin > inicio ? { fechaInicio: inicio, fechaFin: fin } : null;
}

/**
 * Cuerpo de POST (`mode: 'create'`) o PATCH (`'edit'`) con los campos exactos
 * del DTO: nunca `tipoEvento`, `invitados` ni `rolesDestino`, que el backend
 * rechaza. Al editar, lo que la modalidad ya no usa va como `null` para
 * limpiarlo. La política y los editores solo viajan si quien guarda puede
 * cambiarlos; los editores, solo con ADMINISTRADORES_SELECCIONADOS.
 */
export function buildAdminMeetingPayload(
  values: AdminMeetingFormValues,
  { mode, incluirPolitica }: { mode: 'create' | 'edit'; incluirPolitica: boolean },
): AdminMeetingPayload {
  const { tipoEvento, rolesDestino, invitados, ...base } = buildEventPayload(values, { keepEmptyDescripcion: mode === 'edit' });
  return {
    ...base,
    antelacionMinutos: base.antelacionMinutos ?? 0,
    modalidad: values.modalidad,
    proyectos: values.proyectos,
    ...(incluirPolitica
      ? {
          politicaEdicion: values.politicaEdicion,
          ...(values.politicaEdicion === 'ADMINISTRADORES_SELECCIONADOS' ? { editores: values.editores } : {}),
        }
      : {}),
  };
}

/** `proyectos[].motivo` de un 400 de elegibilidad, por id; vacío si el error es otro. */
export function motivosNoElegibles(error: unknown): Map<number, MotivoNoElegible> {
  const proyectos = (error as { body?: { proyectos?: unknown } } | null)?.body?.proyectos;
  if (!Array.isArray(proyectos)) return new Map();
  return new Map(
    proyectos
      .filter((p): p is { idProyecto: number; motivo: MotivoNoElegible } => typeof p?.idProyecto === 'number' && typeof p?.motivo === 'string')
      .map((p) => [p.idProyecto, p.motivo]),
  );
}

export function esConflictoDeVersion(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 409;
}
