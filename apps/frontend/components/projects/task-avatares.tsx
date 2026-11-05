import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { UsuarioAsignadoResumen } from '@/lib/types/tasks';

/** Cuántos avatares se muestran antes de resumir el resto en "+N". */
const MAX_AVATARES_VISIBLES = 3;

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** MEJ-109: avatares superpuestos de los responsables de una tarea, con "+N" si son más de tres. */
export function TaskAvatares({ responsables }: { responsables: UsuarioAsignadoResumen[] }) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {responsables.length === 0 && (
        <Avatar className="size-6">
          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">—</AvatarFallback>
        </Avatar>
      )}
      {responsables.slice(0, MAX_AVATARES_VISIBLES).map((r) => (
        <Avatar key={r.idUsuario} className="size-6 ring-2 ring-surface-container-lowest">
          {r.fotoUrl && <AvatarImage src={r.fotoUrl} alt="" />}
          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
            {getInitials(r.nombre, r.apellido)}
          </AvatarFallback>
        </Avatar>
      ))}
      {responsables.length > MAX_AVATARES_VISIBLES && (
        <Avatar className="size-6 ring-2 ring-surface-container-lowest">
          <AvatarFallback className="bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
            +{responsables.length - MAX_AVATARES_VISIBLES}
          </AvatarFallback>
        </Avatar>
      )}
    </span>
  );
}

/** Texto del responsable: nombre si es uno, "N responsables" si son varios, "Sin asignar" si ninguno. */
export function textoResponsables(responsables: UsuarioAsignadoResumen[]): string {
  if (responsables.length === 0) return 'Sin asignar';
  if (responsables.length === 1) return `${responsables[0].nombre} ${responsables[0].apellido}`;
  return `${responsables.length} responsables`;
}
