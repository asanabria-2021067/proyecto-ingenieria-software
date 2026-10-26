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
 * Color de la CATEGORÍA del aviso sobre un círculo neutro: la tinta on-tag-* de
 * su familia de etiqueta va solo en las letras o el trazo del icono y en un
 * borde fino; el fondo queda gris claro (surface-container). Esas tintas dan
 * ≥ 5,7:1 sobre ese fondo en claro y ≥ 9,7:1 en oscuro. El color no cambia al
 * leer el aviso; la forma sigue saliendo del origen (círculo o cuadro).
 */
const NEUTRO = 'bg-surface-container ring-1 ring-current/30';
export const COLOR_DE_CATEGORIA: Record<NotificationGroupId, string> = {
  tareas: `${NEUTRO} text-on-tag-blue`,
  postulaciones: `${NEUTRO} text-on-tag-turquoise`,
  proyectos: `${NEUTRO} text-on-tag-sage`,
  horas: `${NEUTRO} text-on-tag-amber`,
  recordatorios: `${NEUTRO} text-on-tag-orange`,
  contactos: `${NEUTRO} text-on-tag-violet`,
  cuenta: `${NEUTRO} text-on-tag-slate`,
  otras: `${NEUTRO} text-on-tag-neutral`,
};

export function NotificationAvatar({
  identidad,
  categoria,
  size = 'md',
  className,
}: {
  identidad: IdentidadDeAviso;
  categoria?: NotificationGroupId;
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
      className={cn(caja, 'shrink-0', TONO[identidad.tipo], categoria && COLOR_DE_CATEGORIA[categoria], className)}
    >
      <AvatarFallback className={cn('rounded-[inherit] bg-transparent font-semibold leading-none', letras)}>
        {'iniciales' in identidad ? identidad.iniciales : createElement(identidad.icon, { className: icono })}
      </AvatarFallback>
    </Avatar>
  );
}
