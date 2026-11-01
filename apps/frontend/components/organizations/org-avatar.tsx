import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0))
    .join('')
    .toUpperCase();
}

/** Logo de una organización; sin logo, sus iniciales. */
export function OrgAvatar({ nombre, logoUrl, className }: { nombre: string; logoUrl: string | null; className?: string }) {
  return (
    <Avatar className={cn('size-12 rounded-xl', className)}>
      {logoUrl && <AvatarImage src={logoUrl} alt={`Logo de ${nombre}`} className="object-cover" />}
      <AvatarFallback className="rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {iniciales(nombre)}
      </AvatarFallback>
    </Avatar>
  );
}
