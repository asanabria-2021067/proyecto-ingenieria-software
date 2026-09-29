import { MessageCircle, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getIniciales } from '@/components/projects/detail/project-header-card';

interface ProjectOwnerCardProps {
  nombre: string;
  apellido: string;
  correo?: string | null;
  /** Solo para quien ya participa: abre (o crea) el chat individual con el responsable. */
  onChat?: () => void;
}

/** HU-154 (T-216): tarjeta «Responsable del proyecto» de la columna lateral, compartida por líder y participante. */
export function ProjectOwnerCard({ nombre, apellido, correo, onChat }: ProjectOwnerCardProps) {
  return (
    <section aria-labelledby="project-owner-title" className="card-base">
      <h2 id="project-owner-title" className="type-subtitle flex items-center gap-tight">
        <UserRound className="size-4 text-text-secondary" aria-hidden="true" />
        Responsable del proyecto
      </h2>
      <div className="mt-stack flex items-center gap-inline">
        <Avatar className="size-12">
          <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
            {getIniciales(nombre, apellido)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="type-body truncate font-semibold">
            {nombre} {apellido}
          </p>
          {correo && <p className="type-meta truncate">{correo}</p>}
        </div>
        {onChat && (
          <Button type="button" variant="outline" size="sm" onClick={onChat} className="shrink-0">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Chat
          </Button>
        )}
      </div>
    </section>
  );
}
