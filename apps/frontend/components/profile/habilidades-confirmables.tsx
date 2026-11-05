'use client';

import { BadgeCheck, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { useConfirmarHabilidad, useHabilidadesConfirmables } from '@/hooks/use-perfil-portafolio';
import { getHabilidadBadgeStyle } from '@/lib/social/badge-colors';

const NIVEL: Record<string, string> = { BASICO: 'Básico', INTERMEDIO: 'Intermedio', AVANZADO: 'Avanzado' };

export const textoConfirmaciones = (n: number) => `${n} ${n === 1 ? 'confirmación' : 'confirmaciones'}`;

/** MEJ-147: habilidades de la persona con sus confirmaciones; los compañeros de proyecto pueden confirmar o retirar la suya. */
export function HabilidadesConfirmables({ idUsuario }: { idUsuario: number }) {
  const { data } = useHabilidadesConfirmables(idUsuario);
  const { confirmar, retirar } = useConfirmarHabilidad(idUsuario);
  if (!data || data.length === 0) return null;
  const ocupado = confirmar.isPending || retirar.isPending;

  return (
    <div>
      <h2 className="type-meta flex items-center gap-tight uppercase tracking-wide">
        <Code2 className="size-4 text-primary" aria-hidden="true" />
        Habilidades
      </h2>
      <ul className="mt-tight flex flex-col gap-tight">
        {data.map((h) => (
          <li key={h.idHabilidad} className="flex flex-wrap items-center gap-tight">
            <span className={`pill font-semibold ${getHabilidadBadgeStyle(h.nombre)}`}>{h.nombre}</span>
            <Tag tone="subtle" size="sm">{NIVEL[h.nivel] ?? h.nivel}</Tag>
            <span className="type-meta flex items-center gap-micro">
              <BadgeCheck className="size-3.5 text-primary" aria-hidden="true" />
              {textoConfirmaciones(h.confirmaciones)}
            </span>
            {h.puedoConfirmar && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={ocupado}
                aria-label={`Confirmar la habilidad ${h.nombre}`}
                onClick={() => confirmar.mutate(h.idHabilidad)}
              >
                Confirmar
              </Button>
            )}
            {h.confirmadaPorMi && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ocupado}
                aria-label={`Retirar mi confirmación de ${h.nombre}`}
                onClick={() => retirar.mutate(h.idHabilidad)}
              >
                Retirar mi confirmación
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
