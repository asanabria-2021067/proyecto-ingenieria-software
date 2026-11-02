'use client';

import { Eye } from 'lucide-react';
import { useLectorOrganizacion, type ProyectoParaLector } from '@/hooks/use-lector-organizacion';

/** Aviso para quien ve un proyecto de su organización sin participar en él. No pinta nada en otro caso. */
export function OrgSoloLecturaBanner({
  proyecto,
  participantes,
  className = '',
}: {
  proyecto: ProyectoParaLector | undefined;
  /** `undefined` mientras cargan los participantes. */
  participantes: { idUsuario: number }[] | undefined;
  className?: string;
}) {
  const { soloLectura, organizacion } = useLectorOrganizacion(proyecto, participantes);
  if (!soloLectura) return null;
  return (
    <div
      role="status"
      aria-label="Proyecto de tu organización: vista de solo lectura"
      className={`flex items-center gap-inline rounded-card border border-outline-variant/40 bg-surface-container-low px-stack py-inline type-body ${className}`}
    >
      <Eye className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Solo lectura.</span> Eres miembro de {organizacion ?? 'la organización'} pero no
        participas en este proyecto: puedes ver el tablero, las tareas y el avance, sin crear ni mover tareas ni
        registrar horas.
      </p>
    </div>
  );
}
