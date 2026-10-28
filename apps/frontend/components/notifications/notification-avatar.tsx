import { createElement } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { IdentidadDeAviso } from '@/lib/notifications/inbox-model';
import type { NotificationGroupId } from '@/lib/notifications/preference-groups';
import { cn } from '@/lib/utils';

/**
 * Avatar contextual de un aviso (bandeja y visor): QUIÉN o QUÉ lo originó.
 * Persona = círculo con iniciales; Administración = círculo institucional;
 * proyecto = cuadro redondeado con iniciales (no se confunde con su líder);
 * evento automático = icono. Colores fijos por tipo de origen, desde tokens
 * de etiqueta que ya cumplen 4.5:1 en claro y oscuro. Decorativo: el nombre
 * va en texto junto a él, así que no se repite para lectores de pantalla.
 */
const TONO: Record<IdentidadDeAviso['tipo'], string> = {
  persona: 'rounded-full bg-tag-sage text-on-tag-sage',
  institucion: 'rounded-full bg-tag-slate text-on-tag-slate',
  // Valor arbitrario del mismo token: `rounded-control` a secas no lo reconoce tailwind-merge y dejaría el rounded-full del Avatar.
  proyecto: 'rounded-[var(--radius-control)] bg-tag-neutral text-on-tag-neutral',
  sistema: 'rounded-full bg-surface-container text-tertiary',
};

/**
 * Color de la CATEGORÍA del aviso, con la familia de etiqueta que ya la
 * representa (fondo tag-* suave y tinta on-tag-*, AA en claro y oscuro), mientras
 * el aviso está sin leer. Leído (`leida`), el avatar pierde el color y queda gris
 * (surface-container con tinta tertiary: 6:1 en claro, 10:1 en oscuro). La forma
 * sigue saliendo del origen (círculo o cuadro).
 */
export const COLOR_DE_CATEGORIA: Record<NotificationGroupId, string> = {
  tareas: 'bg-tag-blue text-on-tag-blue',
  postulaciones: 'bg-tag-turquoise text-on-tag-turquoise',
  proyectos: 'bg-tag-sage text-on-tag-sage',
  horas: 'bg-tag-amber text-on-tag-amber',
  recordatorios: 'bg-tag-orange text-on-tag-orange',
  contactos: 'bg-tag-violet text-on-tag-violet',
  cuenta: 'bg-tag-slate text-on-tag-slate',
  otras: 'bg-tag-neutral text-on-tag-neutral',
};

const GRIS_LEIDA = 'bg-surface-container text-tertiary';

export function NotificationAvatar({
  identidad,
  categoria,
  leida = false,
  size = 'md',
  className,
}: {
  identidad: IdentidadDeAviso;
  categoria?: NotificationGroupId;
  /** Aviso ya leído: sin el color de su categoría, en gris. */
  leida?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const caja = size === 'lg' ? 'size-10' : 'size-9';
  const icono = size === 'lg' ? 'size-5' : 'size-4';
  const letras = size === 'lg' ? 'text-sm' : 'text-[13px]';

  return (
    <Avatar
      aria-hidden="true"
      data-identidad={identidad.tipo}
      data-categoria={categoria}
      data-leida={leida || undefined}
      className={cn(caja, 'shrink-0', TONO[identidad.tipo], categoria && (leida ? GRIS_LEIDA : COLOR_DE_CATEGORIA[categoria]), className)}
    >
      <AvatarFallback className={cn('rounded-[inherit] bg-transparent font-semibold leading-none', letras)}>
        {'iniciales' in identidad ? identidad.iniciales : createElement(identidad.icon, { className: icono })}
      </AvatarFallback>
    </Avatar>
  );
}
