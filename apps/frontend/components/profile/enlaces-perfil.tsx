'use client';

import { useState } from 'react';
import { Github, Globe, Link2, Linkedin, Palette, Plus, X } from 'lucide-react';
import { LinkPreviewView } from '@/components/chat-dock/link-preview-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEnlacesPerfil, useGuardarEnlaces } from '@/hooks/use-perfil-portafolio';
import type { EnlacePerfil } from '@/lib/services/perfil-portafolio';

export const MAX_ENLACES = 5;

const ICONO = { GITHUB: Github, LINKEDIN: Linkedin, BEHANCE: Palette, SITIO: Globe } as const;
const NOMBRE = { GITHUB: 'GitHub', LINKEDIN: 'LinkedIn', BEHANCE: 'Behance', SITIO: 'Sitio propio' } as const;

/** Solo https:// (el backend repite la validación y rechaza IP, localhost y credenciales). */
export const esEnlaceValido = (valor: string) => {
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
};

function Editor({ iniciales, guardando, onGuardar, onCancelar }: {
  iniciales: string[];
  guardando: boolean;
  onGuardar: (urls: string[]) => void;
  onCancelar: () => void;
}) {
  const [urls, setUrls] = useState<string[]>(iniciales.length > 0 ? iniciales : ['']);
  const llenas = urls.map((u) => u.trim()).filter(Boolean);
  const invalido = llenas.some((u) => !esEnlaceValido(u));

  return (
    <form
      className="space-y-tight"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalido) onGuardar(llenas);
      }}
    >
      {urls.map((valor, i) => (
        <div key={i} className="flex items-center gap-tight">
          <input
            type="url"
            value={valor}
            placeholder="https://github.com/tu-usuario"
            aria-label={`Enlace ${i + 1}`}
            aria-invalid={valor.trim() !== '' && !esEnlaceValido(valor)}
            onChange={(e) => setUrls((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))}
            className="type-body min-w-0 flex-1 rounded-control border border-outline-variant bg-card px-3 py-2 text-text-primary"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar enlace ${i + 1}`}
            onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      {invalido && <p role="alert" className="type-meta text-destructive">Cada enlace debe empezar con https:// y tener un dominio válido.</p>}
      <div className="flex flex-wrap items-center justify-between gap-tight">
        <Button type="button" variant="outline" size="sm" disabled={urls.length >= MAX_ENLACES} onClick={() => setUrls((prev) => [...prev, ''])}>
          <Plus aria-hidden="true" />
          Agregar enlace
        </Button>
        <div className="flex gap-tight">
          <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button type="submit" disabled={guardando || invalido}>Guardar enlaces</Button>
        </div>
      </div>
    </form>
  );
}

function Lista({ enlaces }: { enlaces: EnlacePerfil[] }) {
  return (
    <ul className="flex flex-col">
      {enlaces.map((e) => {
        const Icono = ICONO[e.tipo];
        return (
          <li key={e.idEnlace}>
            <LinkPreviewView url={e.url} sitio={e.sitio || NOMBRE[e.tipo]} titulo={e.titulo ?? e.url} icono={<Icono className="size-4" aria-hidden="true" />} />
          </li>
        );
      })}
    </ul>
  );
}

/** MEJ-149: GitHub, LinkedIn, Behance o sitio propio con vista previa; solo la propia persona los edita. */
export function EnlacesPerfilSeccion({ idUsuario, propio = false }: { idUsuario: number; propio?: boolean }) {
  const { data, isLoading, isError } = useEnlacesPerfil(idUsuario);
  const guardar = useGuardarEnlaces(idUsuario);
  const [editando, setEditando] = useState(false);

  if (isLoading) return <Skeleton className="h-28 rounded-card" aria-label="Cargando enlaces" />;
  if (isError || !data) return null;
  if (!propio && data.length === 0) return null;

  return (
    <section className="card-base space-y-tight" aria-labelledby={`enlaces-${idUsuario}`}>
      <div className="flex items-center justify-between gap-tight">
        <h2 id={`enlaces-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
          <Link2 className="size-4 text-primary" aria-hidden="true" />
          Enlaces
        </h2>
        {propio && !editando && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            Editar enlaces
          </Button>
        )}
      </div>
      {editando ? (
        <Editor
          iniciales={data.map((e) => e.url)}
          guardando={guardar.isPending}
          onCancelar={() => setEditando(false)}
          onGuardar={(urls) => guardar.mutate(urls, { onSuccess: () => setEditando(false) })}
        />
      ) : data.length === 0 ? (
        <p className="type-body text-text-secondary">Agrega hasta {MAX_ENLACES} enlaces a GitHub, LinkedIn, Behance o tu sitio.</p>
      ) : (
        <Lista enlaces={data} />
      )}
    </section>
  );
}
