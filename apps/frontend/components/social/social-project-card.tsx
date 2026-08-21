import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { estadoBadgeLabel, estadoBadgeStyle, getIniciales } from '@/components/projects/available-project-card';
import type { ProyectoFeedDto } from '@/lib/types/social';

export function SocialProjectCard({ proyecto }: { proyecto: ProyectoFeedDto }) {
  return (
    <Link
      href={`/dashboard/proyectos/${proyecto.idProyecto}`}
      className="flex flex-col gap-3 rounded-[10px] border border-[#D3DDD3] dark:border-outline-variant bg-surface-container-lowest p-4 hover:border-[#A9BFAE] dark:hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-headline text-sm font-semibold text-on-surface line-clamp-2">
          {proyecto.tituloProyecto}
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
          {estadoBadgeLabel(proyecto.estadoProyecto)}
        </span>
      </div>
      <div className="flex items-center -space-x-2">
        {proyecto.amigosParticipantes.map((amigo) => (
          <Avatar key={amigo.idUsuario} className="border-2 border-surface-container-lowest">
            {amigo.fotoUrl && <AvatarImage src={amigo.fotoUrl} alt={`${amigo.nombre} ${amigo.apellido}`} />}
            <AvatarFallback className="text-[10px]">{getIniciales(amigo.nombre, amigo.apellido)}</AvatarFallback>
          </Avatar>
        ))}
      </div>
    </Link>
  );
}
