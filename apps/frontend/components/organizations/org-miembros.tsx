'use client';

import { UserMinus } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { getIniciales } from '@/components/projects/available-project-card';
import { useCambiarRolMiembro, useQuitarMiembro } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { puedeActuarSobre, ROL_LABEL, rolesQueSePuedenAsignar } from '@/lib/organizations/roles';
import { aviso, confirmar } from '@/lib/mensajes';
import type { MiembroOrganizacion, RolOrganizacion } from '@/lib/types/organizations';

interface Props {
  idOrganizacion: number;
  miembros: MiembroOrganizacion[];
  miRol: RolOrganizacion | null;
  idUsuarioActual: number | null;
  /** Una organización archivada queda en solo lectura. */
  archivada: boolean;
}

/** Miembros con su rol. Quien gestiona cambia roles y quita miembros según las reglas del servicio. */
export function OrgMiembros({ idOrganizacion, miembros, miRol, idUsuarioActual, archivada }: Props) {
  const cambiarRol = useCambiarRolMiembro(idOrganizacion);
  const quitar = useQuitarMiembro(idOrganizacion);
  const asignables = rolesQueSePuedenAsignar(miRol);

  const cambiar = (m: MiembroOrganizacion, rol: RolOrganizacion) => {
    if (rol === m.rolOrganizacion) return;
    cambiarRol.mutate(
      { idUsuario: m.idUsuario, rol },
      {
        onSuccess: () =>
          aviso.deshacer('Rol actualizado', () =>
            cambiarRol.mutate(
              { idUsuario: m.idUsuario, rol: m.rolOrganizacion },
              { onError: (err) => aviso.error('No se pudo deshacer', mensajeErrorOrganizacion(err)) },
            ),
          ),
        onError: (err) => aviso.error('No se pudo cambiar el rol', mensajeErrorOrganizacion(err)),
      },
    );
  };

  const quitarMiembro = async (m: MiembroOrganizacion) => {
    const ok = await confirmar({
      titulo: `¿Quitar a ${m.nombre} ${m.apellido}?`,
      descripcion: 'Dejará de ver la organización y su chat. Podrá volver solo con una nueva invitación.',
      textoAccion: 'Quitar miembro',
      destructiva: true,
    });
    if (!ok) return;
    quitar.mutate(m.idUsuario, {
      onSuccess: () => aviso.exito('Miembro quitado'),
      onError: (err) => aviso.error('No se pudo quitar al miembro', mensajeErrorOrganizacion(err)),
    });
  };

  return (
    <ul className="divide-y divide-outline-variant/40" aria-label="Miembros de la organización">
      {miembros.map((m) => {
        const esYo = m.idUsuario === idUsuarioActual;
        const gestionable = !archivada && puedeActuarSobre(miRol, m.rolOrganizacion, esYo);
        return (
          <li key={m.idUsuario} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Avatar className="size-10">
              {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
              <AvatarFallback className="text-xs font-bold">{getIniciales(m.nombre, m.apellido)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                href={`/dashboard/personas/${m.idUsuario}`}
                className="block truncate text-sm font-semibold text-on-surface hover:underline"
              >
                {m.nombre} {m.apellido}
                {esYo && <span className="font-normal text-on-surface-variant"> (tú)</span>}
              </Link>
              <p className="text-xs text-on-surface-variant">
                Desde {new Date(m.fechaIngreso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            {gestionable ? (
              <div className="flex shrink-0 items-center gap-2">
                <Select value={m.rolOrganizacion} onValueChange={(v) => cambiar(m, v as RolOrganizacion)} disabled={cambiarRol.isPending}>
                  <SelectTrigger aria-label={`Rol de ${m.nombre} ${m.apellido}`} className="h-9 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* El rol actual siempre figura, aunque quien edita no pueda asignarlo. */}
                    {[...new Set<RolOrganizacion>([m.rolOrganizacion, ...asignables])].map((rol) => (
                      <SelectItem key={rol} value={rol} disabled={!asignables.includes(rol)}>
                        {ROL_LABEL[rol]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={quitar.isPending}
                  onClick={() => quitarMiembro(m)}
                  aria-label={`Quitar a ${m.nombre} ${m.apellido}`}
                  className="text-destructive hover:text-destructive"
                >
                  <UserMinus aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <Tag tone={m.rolOrganizacion === 'PROPIETARIO' ? 'lime' : 'neutral'}>{ROL_LABEL[m.rolOrganizacion]}</Tag>
            )}
          </li>
        );
      })}
    </ul>
  );
}
