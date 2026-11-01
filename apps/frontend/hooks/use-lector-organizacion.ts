'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useMisOrganizaciones } from '@/hooks/use-organizations';
import { esLectorDeOrganizacion } from '@/lib/organizations/lector';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

export type ProyectoParaLector = Pick<ProyectoDetalleDTO, 'creador' | 'organizaciones'>;

/**
 * ¿Veo este proyecto como miembro de la organización dueña, sin participar? Entonces es de solo lectura.
 * El proyecto y sus participantes los aporta quien llama (ya los tiene cargados): `participantes` en
 * `undefined` significa «aún cargando», y entonces no se afirma nada para no marcar de solo lectura a quien sí participa.
 */
export function useLectorOrganizacion(
  proyecto: ProyectoParaLector | undefined,
  participantes: { idUsuario: number }[] | undefined,
): { soloLectura: boolean; organizacion: string | null } {
  const { data: usuario } = useCurrentUser();
  const { data } = useMisOrganizaciones();
  const misOrganizaciones = data ?? [];

  const duenas = proyecto?.organizaciones ?? [];
  const soloLectura =
    participantes !== undefined &&
    esLectorDeOrganizacion({
      idUsuario: usuario?.idUsuario ?? null,
      idLider: proyecto?.creador.idUsuario ?? null,
      idsParticipantes: participantes.map((m) => m.idUsuario),
      idsOrganizacionesProyecto: duenas.map((o) => o.idOrganizacion),
      idsMisOrganizaciones: misOrganizaciones.map((o) => o.idOrganizacion),
    });

  const propia = duenas.find((o) => misOrganizaciones.some((m) => m.idOrganizacion === o.idOrganizacion));
  return { soloLectura, organizacion: soloLectura ? (propia?.organizacion.nombreOrganizacion ?? null) : null };
}
