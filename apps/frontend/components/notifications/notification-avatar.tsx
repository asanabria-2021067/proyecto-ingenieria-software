import { createElement } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { IdentidadDeAviso } from '@/lib/notifications/inbox-model';
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

export function NotificationAvatar({ identidad, size = 'md', className }: { identidad: IdentidadDeAviso; size?: 'md' | 'lg'; className?: string }) {
  const caja = size === 'lg' ? 'size-10' : 'size-9';
  const icono = size === 'lg' ? 'size-5' : 'size-4';
  const letras = size === 'lg' ? 'text-sm' : 'text-[13px]';

  return (
    <Avatar aria-hidden="true" data-identidad={identidad.tipo} className={cn(caja, 'shrink-0', TONO[identidad.tipo], className)}>
      <AvatarFallback className={cn('rounded-[inherit] bg-transparent font-semibold leading-none', letras)}>
        {'iniciales' in identidad ? identidad.iniciales : createElement(identidad.icon, { className: icono })}
      </AvatarFallback>
    </Avatar>
  );
}
