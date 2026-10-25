import { apiFetch } from '@/lib/api/client';
import type {
  AdminMeeting,
  AdminMeetingEstadoListado,
  AdminMeetingPage,
  AdminMeetingParticipantes,
} from '@/lib/types/admin-meetings';

/** Máximo que admite el contrato por página. */
const LIMITE_PAGINA = 50;
// ponytail: tope de páginas por consulta (1000 reuniones); por encima se marca `completo: false`.
const MAX_PAGINAS = 20;

export interface AdminMeetingsResultado {
  reuniones: AdminMeeting[];
  /** false si el backend tenía más reuniones de las que se trajeron: la vista lo avisa. */
  completo: boolean;
}

/**
 * Todas las reuniones de Administración de un estado (y, si se indica, que se
 * solapan con [desde, hasta]), recorriendo la paginación del contrato.
 */
export async function getAllAdminMeetings(
  estado: AdminMeetingEstadoListado,
  rango?: { desde: Date; hasta: Date },
): Promise<AdminMeetingsResultado> {
  const reuniones: AdminMeeting[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let total = 0;
  do {
    const params = new URLSearchParams({ estado, page: String(pagina), limit: String(LIMITE_PAGINA) });
    if (rango) {
      params.set('desde', rango.desde.toISOString());
      params.set('hasta', rango.hasta.toISOString());
    }
    const respuesta = await apiFetch<AdminMeetingPage>(`/admin/reuniones?${params.toString()}`);
    reuniones.push(...respuesta.data);
    totalPaginas = respuesta.totalPages;
    total = respuesta.total;
    pagina += 1;
  } while (pagina <= totalPaginas && pagina <= MAX_PAGINAS);
  return { reuniones, completo: reuniones.length >= total };
}

/**
 * Reuniones no canceladas que se solapan con el rango visible: las que aún no
 * terminan (`activas`) y las que ya terminaron (`pasadas`). Las canceladas
 * nunca entran en la agenda. Una reunión que termina entre las dos peticiones
 * podría llegar en ambas: se deja una sola.
 */
export async function getAdminMeetingsInRange(desde: Date, hasta: Date): Promise<AdminMeetingsResultado> {
  const [activas, pasadas] = await Promise.all([
    getAllAdminMeetings('activas', { desde, hasta }),
    getAllAdminMeetings('pasadas', { desde, hasta }),
  ]);
  const porId = new Map<number, AdminMeeting>();
  for (const reunion of [...activas.reuniones, ...pasadas.reuniones]) porId.set(reunion.idReunion, reunion);
  return { reuniones: [...porId.values()], completo: activas.completo && pasadas.completo };
}

export function getAdminMeetingParticipants(idReunion: number): Promise<AdminMeetingParticipantes> {
  return apiFetch<AdminMeetingParticipantes>(`/admin/reuniones/${idReunion}/participantes`);
}
